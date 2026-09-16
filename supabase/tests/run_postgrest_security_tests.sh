#!/usr/bin/env bash
# PostgREST-level adversarial security suite (issue #14, Audit 10).
#
# Unlike the psql harnesses (run_ownership_tests.sh etc.), which drive SQL as
# role-switched sessions, this suite attacks the REAL HTTP surface: PostgREST
# and GoTrue on a running local Supabase stack (`npx supabase start`), with
# anonymous and two independent authenticated users (real JWTs via signup).
#
# What this suite owns (do not duplicate in the psql harnesses):
#   1. missing-migration detection: schema objects (tables, RLS, policies,
#      composite FKs, triggers, RPCs) asserted via psql + PostgREST OpenAPI
#      introspection — a migration that fails to apply fails the suite
#   2. anonymous-role lockdown across every table and revoked RPCs
#   3. per-table cross-user SELECT/INSERT/UPDATE/DELETE isolation, ownership
#      spoofing (forged user_id / cross-user references), budget_categories
#      relationship ownership
#   4. trigger balance effects, multi-row (bulk) rollback, transfer
#      idempotency and concurrent-write correctness over HTTP
#   5. forged JWT claims: wrong signature, expired, alg=none, role downgrades
#      (needs JWT_SECRET from `supabase status`, skipped when unavailable)
#   6. IDOR probes on every RPC parameter
#
# REGRESSION CASES ACCUMULATE HERE: when an audit fix lands, append a block
# that reproduces the attack it closes (a new section, or new check lines in
# an existing one). Keep cases HTTP-level; SQL-session cases belong in the
# psql harnesses.
#
# Usage: supabase/tests/run_postgrest_security_tests.sh
# Requires: curl, python3, psql (for the missing-migration assertions), a
# running local Supabase stack. Skips with exit 0 (message on stderr) when no
# stack is reachable; exits 1 on any failed assertion (all sections run).

set -uo pipefail
cd "$(dirname "$0")/../.."

FAILURES=0
CHECKS=0
RUN_ID="$$-$RANDOM"
# Digits-only discriminator for embedding in UUID test ids (8-4-4-4-12).
UID12=$(printf %012d "${RUN_ID//[!0-9]/}" | tail -c 12)

# ---------------------------------------------------------------------------
# Bootstrap: resolve the running stack (env override > `supabase status`).
# ---------------------------------------------------------------------------
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  if [ -x node_modules/.bin/supabase ]; then
    eval "$(node_modules/.bin/supabase status -o env 2>/dev/null | grep '=' || true)"
  else
    eval "$(npx supabase status -o env 2>/dev/null | grep '=' || true)"
  fi
  SUPABASE_URL=${SUPABASE_URL:-${API_URL:-}}
  SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-${ANON_KEY:-}}
  SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_ROLE_KEY:-}}
  SUPABASE_DB_URL=${SUPABASE_DB_URL:-${DB_URL:-}}
  JWT_SECRET=${JWT_SECRET:-}
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "SKIP: no SUPABASE_URL / SUPABASE_ANON_KEY and no reachable stack; PostgREST security tests not run" >&2
  exit 0
fi
if ! curl -sf -o /dev/null --max-time 5 "$SUPABASE_URL/auth/v1/health"; then
  echo "SKIP: Supabase stack at $SUPABASE_URL not reachable; PostgREST security tests not run" >&2
  exit 0
fi
if ! command -v psql >/dev/null || [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "FAIL: psql + SUPABASE_DB_URL are required for the missing-migration assertions" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# HTTP + assert helpers
# ---------------------------------------------------------------------------
REST_BODY=$(mktemp /tmp/abacus-sec-body.XXXXXX)

# rest <token|anon> <method> <path> [json-body] -> HTTP status; body in $REST_BODY
rest() {
  local tok=$1 method=$2 path=$3 body=${4:-}
  local -a args=(-s -o "$REST_BODY" -w '%{http_code}' -X "$method"
                 "$SUPABASE_URL/rest/v1/$path"
                 -H "apikey: $SUPABASE_ANON_KEY"
                 -H 'Prefer: return=representation'
                 -H 'Content-Type: application/json')
  [ "$tok" != "anon" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

# auth-rest <token|anon> <method> <path> [json-body] — against /auth/v1
auth_rest() {
  local tok=$1 method=$2 path=$3 body=${4:-}
  local -a args=(-s -o "$REST_BODY" -w '%{http_code}' -X "$method"
                 "$SUPABASE_URL/auth/v1/$path"
                 -H "apikey: $SUPABASE_ANON_KEY"
                 -H 'Content-Type: application/json')
  [ "$tok" != "anon" ] && args+=(-H "Authorization: Bearer $tok")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}"
}

# json <python expression over d> — evaluated against the last REST body;
# d is None when the body is not JSON. Prints nothing on expression errors.
json() { python3 -c "import json
try: d=json.load(open('$REST_BODY'))
except Exception: d=None
print($1)" 2>/dev/null; }

section() { echo; echo "== $* =="; }
check() { # check <description> <0|1>
  CHECKS=$((CHECKS + 1))
  if [ "$2" -eq 0 ]; then echo "   ok: $1"
  else FAILURES=$((FAILURES + 1)); echo "   FAIL: $1"; fi
}
# denied: status >= 400, or 2xx with zero rows (RLS-filtered no-op write)
deny_ok() { local st=$1
  [ "$st" -ge 400 ] && return 0
  [ "$(json "len(d) if isinstance(d,list) else 0")" = "0" ]
}

# Two independent authenticated users (unique per run; re-runs reuse them).
U1_EMAIL="sec-${RUN_ID}-u1@abacus.test"
U2_EMAIL="sec-${RUN_ID}-u2@abacus.test"
PASSPHRASE='sec5cr3t-Pr0be-0nly!'

signup() { auth_rest anon POST signup "{\"email\":\"$1\",\"password\":\"$PASSPHRASE\"}" >/dev/null; }
login_uid_token() { # -> "uid token"; nonzero exit when login fails
  auth_rest anon POST "token?grant_type=password" \
    "{\"email\":\"$1\",\"password\":\"$PASSPHRASE\"}" >/dev/null
  local t u
  t=$(json "d.get('access_token','') if isinstance(d,dict) else ''")
  if [ -z "$t" ]; then
    echo "FAIL: password login failed for $1: $(head -c 200 "$REST_BODY")" >&2
    return 1
  fi
  u=$(json "d['user']['id'] if isinstance(d,dict) and isinstance(d.get('user'),dict) else ''")
  echo "$u $t"
}
cleanup() { # cascade-deletes the test users (and with them all their rows)
  local uid
  for uid in "${U1:-}" "${U2:-}"; do
    [ -n "$uid" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && curl -sf -o /dev/null \
      -X DELETE "$SUPABASE_URL/auth/v1/admin/users/$uid" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
  done
  rm -f "$REST_BODY"
}

section "bootstrap users"
signup "$U1_EMAIL"; signup "$U2_EMAIL"
read -r U1 T1 <<< "$(login_uid_token "$U1_EMAIL")" || { echo "aborting: U1 unavailable" >&2; exit 1; }
read -r U2 T2 <<< "$(login_uid_token "$U2_EMAIL")" || { echo "aborting: U2 unavailable" >&2; exit 1; }
trap cleanup EXIT
check "two independent authenticated users" \
  $([ -n "$U1" ] && [ -n "$U2" ] && [ "$U1" != "$U2" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 1. Missing migrations FAIL: schema objects must exist (psql + OpenAPI).
# ---------------------------------------------------------------------------
section "1. schema integrity — missing migrations fail"

psql_scalar() { psql "$SUPABASE_DB_URL" -tAc "$1" 2>/dev/null; }

# 1a. every table exists, RLS enabled, policy present
for T in accounts categories transactions budgets exchange_rates \
         investment_plans recurring_transactions budget_categories; do
  RLS=$(psql_scalar "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where n.nspname='public' and c.relname='$T'")
  POL=$(psql_scalar "select count(*) from pg_policies where schemaname='public' and tablename='$T'")
  check "table $T: exists + RLS enabled + policy present" \
    $([ "$RLS" = "t" ] && [ "${POL:-0}" -ge 1 ] 2>/dev/null && echo 0 || echo 1)
done

# 1b. composite ownership FKs + unique targets (migration 20260917000004)
for C in accounts_id_user_id_key categories_id_user_id_key budgets_id_user_id_key \
         transactions_account_same_user_fkey transactions_category_same_user_fkey \
         categories_parent_same_user_fkey recurring_transactions_account_same_user_fkey \
         recurring_transactions_category_same_user_fkey; do
  N=$(psql_scalar "select count(*) from pg_constraint where conname='$C' and contype in ('f','u')")
  check "constraint $C present" $([ "$N" = "1" ] && echo 0 || echo 1)
done

# 1c. triggers that enforce ownership/balances
for TG in "accounts:set_user_id" "accounts:enforce_account_balance" \
          "transactions:set_user_id" "transactions:maintain_account_balance" \
          "categories:set_user_id" "budgets:set_user_id" "exchange_rates:set_user_id" \
          "investment_plans:set_user_id" "recurring_transactions:set_user_id" \
          "budget_categories:set_user_id"; do
  T=${TG%%:*}; G=${TG#*:}
  N=$(psql_scalar "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
                   join pg_namespace n on n.oid=c.relnamespace
                   where n.nspname='public' and c.relname='$T' and t.tgname='$G' and not t.tgisinternal")
  check "trigger $G on $T present" $([ "$N" = "1" ] && echo 0 || echo 1)
done

# 1d. RPC surface via OpenAPI (generated from the live schema — a migration
# that failed to apply makes its objects vanish from here)
OAPI_STATUS=$(rest "$T1" GET "")
OAPI_TABLES=$(json "'\n'.join(sorted(d.get('definitions',{}).keys()))")
OAPI_RPC=$(json "'\n'.join(sorted(p.split('/')[-1] for p in d.get('paths',{}) if '/rpc/' in p))")
check "OpenAPI introspection succeeded" $([ "$OAPI_STATUS" = "200" ] && echo 0 || echo 1)
for T in accounts budget_categories budgets categories exchange_rates \
         investment_plans recurring_transactions transactions; do
  check "OpenAPI exposes table $T" \
    $(printf '%s' "$OAPI_TABLES" | grep -qx "$T" && echo 0 || echo 1)
done
for F in account_ledger_effects assert_owned_account budget_spending \
         convert_transfer_to_plain create_transfer delete_transfer edit_transfer \
         recurring_next_date replace_budget_categories report_by_category \
         report_monthly report_summary restore_user_data; do
  check "OpenAPI exposes rpc $F" $(python3 -c "print(0 if '$F' in '''$OAPI_RPC''' else 1)")
done

# ---------------------------------------------------------------------------
# 2. Anonymous role lockdown.
# ---------------------------------------------------------------------------
section "2. anonymous lockdown"
for T in accounts categories transactions budgets exchange_rates \
         investment_plans recurring_transactions budget_categories; do
  ST=$(rest anon GET "$T?select=*")
  check "anon GET $T -> no rows" \
    $([ "$ST" = "200" ] && [ "$(json "len(d)")" = "0" ] && echo 0 || echo 1)
  ST=$(rest anon POST "$T" '{"name":"anon-row","type":"checking"}')
  check "anon POST $T -> denied" $(deny_ok "$ST" && echo 0 || echo 1)
done
ST=$(rest anon POST "rpc/report_summary" '{"p_from":null,"p_to":null,"p_currency":"USD"}')
check "anon rpc report_summary (execute revoked) -> denied" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest anon POST "rpc/create_transfer" '{"p_idempotency_key":"00000000-0000-0000-0000-000000000001"}')
check "anon rpc create_transfer -> denied" $(deny_ok "$ST" && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 3. U1 baseline data (used by every later section).
#    ACC balance ledger: +50 income, -20 expense, +40 transfer-in -> 170.
#    ACC2: 500 opening, -30 plain transfer-out leg, -40 transfer-out -> 430.
# ---------------------------------------------------------------------------
section "3. U1 baseline over REST"
rest "$T1" POST accounts '{"name":"u1 checking","type":"checking","currency":"USD","opening_balance":100}' >/dev/null
ACC=$(json "d[0]['id']")
rest "$T1" POST accounts '{"name":"u1 savings","type":"savings","currency":"USD","opening_balance":500}' >/dev/null
ACC2=$(json "d[0]['id']")
rest "$T1" POST categories '{"name":"u1 food","type":"expense","color":"#123456"}' >/dev/null
CAT=$(json "d[0]['id']")
rest "$T1" POST transactions "{\"account_id\":\"$ACC\",\"category_id\":\"$CAT\",\"type\":\"income\",\"amount\":50,\"currency\":\"USD\",\"base_amount\":50,\"base_currency\":\"USD\",\"date\":\"2026-01-10\"}" >/dev/null
TX=$(json "d[0]['id']")
rest "$T1" POST budgets '{"name":"u1 budget","amount":200,"period":"monthly"}' >/dev/null
BUD=$(json "d[0]['id']")
rest "$T1" POST budget_categories "{\"budget_id\":\"$BUD\",\"category_id\":\"$CAT\"}" >/dev/null
rest "$T1" POST exchange_rates '{"from_currency":"USD","to_currency":"EUR","rate":0.9,"date":"2026-01-10"}' >/dev/null
XRATE=$(json "d[0]['id']")
rest "$T1" POST investment_plans '{"name":"u1 plan","type":"stock","currency":"USD","initial_amount":1000}' >/dev/null
PLAN=$(json "d[0]['id']")
rest "$T1" POST recurring_transactions "{\"account_id\":\"$ACC\",\"category_id\":\"$CAT\",\"type\":\"expense\",\"amount\":10,\"frequency\":\"monthly\"}" >/dev/null
RECUR=$(json "d[0]['id']")
check "baseline rows created" \
  $([ -n "$ACC" ] && [ -n "$ACC2" ] && [ -n "$CAT" ] && [ -n "$TX" ] && [ -n "$BUD" ] \
    && [ -n "$XRATE" ] && [ -n "$PLAN" ] && [ -n "$RECUR" ] && echo 0 || echo 1)
rest "$T1" GET "accounts?select=user_id" >/dev/null
check "U1 owns all its rows" \
  $([ "$(json "len([x for x in d if x['user_id']!='$U1'])")" = "0" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 4. Per-table cross-user isolation (U2 attacks U1's rows).
# ---------------------------------------------------------------------------
section "4. cross-user isolation (U2 vs U1, every table)"

probe_table() { # probe_table <table> <owner-row-id>
  local T=$1 RID=$2 ST
  ST=$(rest "$T2" GET "$T?id=eq.$RID&select=*")
  check "$T: U2 SELECT by foreign id -> invisible (IDOR)" \
    $([ "$ST" = "200" ] && [ "$(json "len(d)")" = "0" ] && echo 0 || echo 1)

  ST=$(rest "$T2" GET "$T?select=*")
  check "$T: U2 SELECT list -> only own rows" \
    $([ "$(json "len([x for x in d if x['user_id']!='$U2'])")" = "0" ] && echo 0 || echo 1)

  ST=$(rest "$T2" PATCH "$T?id=eq.$RID" '{"notes":"pwned-by-u2"}')
  check "$T: U2 UPDATE foreign row -> no effect" $(deny_ok "$ST" && echo 0 || echo 1)

  ST=$(rest "$T2" DELETE "$T?id=eq.$RID")
  check "$T: U2 DELETE foreign row -> no effect" $(deny_ok "$ST" && echo 0 || echo 1)
}
probe_table accounts "$ACC"
probe_table categories "$CAT"
probe_table transactions "$TX"
probe_table budgets "$BUD"
probe_table exchange_rates "$XRATE"
probe_table investment_plans "$PLAN"
probe_table recurring_transactions "$RECUR"

N=$(rest "$T1" GET "accounts?id=eq.$ACC&select=notes,balance" >/dev/null; json "d[0]['notes'] is None and d[0]['balance']==150")
check "owner's account intact after foreign PATCH/DELETE attempts" $([ "$N" = "True" ] && echo 0 || echo 1)
check "owner still sees own transaction" \
  $([ "$(rest "$T1" GET "transactions?id=eq.$TX&select=id" >/dev/null; json "len(d)")" = "1" ] && echo 0 || echo 1)

section "4b. ownership spoofing (forged user_id / cross-user references)"
# forged user_id on INSERT: the set_user_id trigger must stamp auth.uid()
ST=$(rest "$T2" POST accounts "{\"name\":\"u2 spoof\",\"type\":\"checking\",\"user_id\":\"$U1\"}")
SPOOF_ACC=$(json "d[0]['id'] if isinstance(d,list) and d else ''")
SPOOF_UID=$(json "d[0]['user_id'] if isinstance(d,list) and d else ''")
check "accounts: INSERT with forged user_id stamped to attacker instead" $([ "$SPOOF_UID" = "$U2" ] && echo 0 || echo 1)

# cross-user relationship references are unsatisfiable (composite FKs)
ST=$(rest "$T2" POST transactions "{\"account_id\":\"$ACC\",\"type\":\"expense\",\"amount\":1,\"currency\":\"USD\",\"base_amount\":1,\"base_currency\":\"USD\",\"date\":\"2026-01-10\"}")
check "transactions: INSERT referencing foreign account -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST recurring_transactions "{\"account_id\":\"$ACC\",\"type\":\"expense\",\"amount\":1,\"frequency\":\"monthly\"}")
check "recurring_transactions: INSERT referencing foreign account -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST categories "{\"name\":\"u2 child\",\"type\":\"expense\",\"color\":\"#223344\",\"parent_id\":\"$CAT\"}")
check "categories: parent_id foreign -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST budget_categories "{\"budget_id\":\"$BUD\",\"category_id\":\"$CAT\"}")
check "budget_categories: foreign budget + foreign category -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST budget_categories "{\"budget_id\":\"$BUD\",\"category_id\":\"$SPOOF_ACC\"}")
check "budget_categories: foreign budget + own account-as-category -> rejected (user_id FK leg)" $(deny_ok "$ST" && echo 0 || echo 1)

# ownership cannot be stolen via UPDATE (RLS WITH CHECK): PATCH user_id=U1 on
# U2's own row must be rejected and leave ownership with U2
ST=$(rest "$T2" PATCH "accounts?id=eq.$SPOOF_ACC" "{\"user_id\":\"$U1\"}")
N=$(rest "$T2" GET "accounts?id=eq.$SPOOF_ACC&select=user_id" >/dev/null; json "d[0]['user_id']=='$U2' if d else False")
check "accounts: UPDATE cannot re-own a row to another user_id" \
  $(deny_ok "$ST" && [ "$N" = "True" ] && echo 0 || echo 1)

# same-user relationship ownership keeps working for U2
rest "$T2" POST budgets '{"name":"u2 budget","amount":50,"period":"monthly"}' >/dev/null
U2BUD=$(json "d[0]['id']")
rest "$T2" POST categories '{"name":"u2 cat","type":"expense","color":"#334455"}' >/dev/null
U2CAT=$(json "d[0]['id']")
ST=$(rest "$T2" POST budget_categories "{\"budget_id\":\"$U2BUD\",\"category_id\":\"$U2CAT\"}")
check "budget_categories: same-user association still inserts" \
  $([ "$ST" = "201" ] && [ "$(json "len(d)")" = "1" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 5. Trigger balance effects over REST.
# ---------------------------------------------------------------------------
section "5. trigger balance effects"
bal() { rest "$T1" GET "accounts?id=eq.$1&select=balance" >/dev/null; json "d[0]['balance']"; }
check "opening 100 + income 50 -> 150" $([ "$(bal "$ACC")" = "150" ] && echo 0 || echo 1)
rest "$T1" POST transactions "{\"account_id\":\"$ACC\",\"type\":\"expense\",\"amount\":20,\"currency\":\"USD\",\"base_amount\":20,\"base_currency\":\"USD\",\"date\":\"2026-01-11\"}" >/dev/null
check "expense 20 -> 130" $([ "$(bal "$ACC")" = "130" ] && echo 0 || echo 1)
rest "$T1" POST transactions "{\"account_id\":\"$ACC2\",\"type\":\"transfer\",\"amount\":-30,\"currency\":\"USD\",\"base_amount\":-30,\"base_currency\":\"USD\",\"date\":\"2026-01-11\"}" >/dev/null
check "outgoing transfer leg -30 -> 470 on ACC2" $([ "$(bal "$ACC2")" = "470" ] && echo 0 || echo 1)
ST=$(rest "$T1" PATCH "accounts?id=eq.$ACC" '{"balance":99999}')
check "direct balance write rejected (enforce_account_balance)" $(deny_ok "$ST" && echo 0 || echo 1)
check "balance unchanged after rejected write" $([ "$(bal "$ACC")" = "130" ] && echo 0 || echo 1)
rest "$T1" PATCH "accounts?id=eq.$ACC" '{"opening_balance":200}' >/dev/null
check "opening_balance edit re-derives balance (200 + effects 30 -> 230)" $([ "$(bal "$ACC")" = "230" ] && echo 0 || echo 1)
rest "$T1" PATCH "accounts?id=eq.$ACC" '{"opening_balance":100}' >/dev/null
check "opening_balance restored -> 130 again" $([ "$(bal "$ACC")" = "130" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 6. Multi-row rollback + transfer atomicity/idempotency over REST.
# ---------------------------------------------------------------------------
section "6. multi-row rollback"
NTX_BEFORE=$(rest "$T1" GET "transactions?select=id" >/dev/null; json "len(d)")
ST=$(rest "$T1" POST transactions "[{\"account_id\":\"$ACC\",\"type\":\"expense\",\"amount\":5,\"currency\":\"USD\",\"base_amount\":5,\"base_currency\":\"USD\",\"date\":\"2026-01-12\"},{\"account_id\":\"$U1\",\"type\":\"expense\",\"amount\":5,\"currency\":\"USD\",\"base_amount\":5,\"base_currency\":\"USD\",\"date\":\"2026-01-12\"}]")
NTX_AFTER=$(rest "$T1" GET "transactions?select=id" >/dev/null; json "len(d)")
check "bulk POST with one invalid row -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
check "bulk POST is atomic: zero rows landed" $([ "$NTX_BEFORE" = "$NTX_AFTER" ] && echo 0 || echo 1)
check "no balance residue from the rolled-back bulk" $([ "$(bal "$ACC")" = "130" ] && echo 0 || echo 1)

IDEM="11111111-3333-4444-5555-$UID12"
TRANSFER_BODY="{\"p_idempotency_key\":\"$IDEM\",\"p_from_account_id\":\"$ACC2\",\"p_to_account_id\":\"$ACC\",\"p_amount\":40,\"p_converted_amount\":40,\"p_out_base_amount\":40,\"p_out_base_currency\":\"USD\",\"p_out_base_stale\":false,\"p_in_base_amount\":40,\"p_in_base_currency\":\"USD\",\"p_in_base_stale\":false}"
ST=$(rest "$T1" POST rpc/create_transfer "$TRANSFER_BODY")
check "create_transfer (same user) -> 2 legs created" $([ "$(json "len(d) if isinstance(d,list) else 0")" = "2" ] && echo 0 || echo 1)
TRF_IN=$(json "[x['id'] for x in d if x['amount']>0][0] if isinstance(d,list) and d else ''")
rest "$T1" POST rpc/create_transfer "$TRANSFER_BODY" >/dev/null
N=$(rest "$T1" GET "transactions?transfer_id=eq.$IDEM&select=id" >/dev/null; json "len(d)")
check "create_transfer idempotent retry -> still exactly one pair" $([ "$N" = "2" ] && echo 0 || echo 1)
check "transfer moved balances both ways (ACC 170 / ACC2 430)" \
  $([ "$(bal "$ACC")" = "170" ] && [ "$(bal "$ACC2")" = "430" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 7. IDOR probes on RPC parameters (U2 attacks U1's ids).
# ---------------------------------------------------------------------------
section "7. RPC IDOR probes"
ST=$(rest "$T2" POST rpc/create_transfer "{\"p_idempotency_key\":\"22222222-3333-4444-5555-$UID12\",\"p_from_account_id\":\"$ACC2\",\"p_to_account_id\":\"$ACC\",\"p_amount\":10,\"p_converted_amount\":10,\"p_out_base_amount\":10,\"p_out_base_currency\":\"USD\",\"p_out_base_stale\":false,\"p_in_base_amount\":10,\"p_in_base_currency\":\"USD\",\"p_in_base_stale\":false}")
check "create_transfer with foreign accounts -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST rpc/delete_transfer "{\"p_transfer_id\":\"$IDEM\"}")
DENIED=$(deny_ok "$ST" && echo 0 || echo 1)
N=$(rest "$T1" GET "transactions?transfer_id=eq.$IDEM&select=id" >/dev/null; json "len(d)")
check "delete_transfer on foreign transfer pair -> no effect, both legs survive" \
  $([ "$DENIED" = "0" ] && [ "$N" = "2" ] && echo 0 || echo 1)
ST=$(rest "$T2" POST rpc/edit_transfer "{\"p_transfer_id\":\"$IDEM\",\"p_from_account_id\":\"$ACC2\",\"p_to_account_id\":\"$ACC\",\"p_amount\":1,\"p_converted_amount\":1}")
DENIED=$(deny_ok "$ST" && echo 0 || echo 1)
N=$(rest "$T1" GET "transactions?transfer_id=eq.$IDEM&select=amount" >/dev/null; json "[x['amount'] for x in d if x['amount']>0]==[40] if d else False")
check "edit_transfer on foreign transfer pair -> rejected, amounts unchanged" \
  $([ "$DENIED" = "0" ] && [ "$N" = "True" ] && echo 0 || echo 1)
N=$(rest "$T2" GET "rpc/account_ledger_effects?p_account_id=$ACC" >/dev/null; json "d if isinstance(d,(int,float)) else -1")
check "account_ledger_effects(foreign) leaks nothing (RLS-scoped -> 0)" $([ "$N" = "0" ] && echo 0 || echo 1)
ST=$(rest "$T2" GET "rpc/assert_owned_account?p_account_id=$ACC&p_user_id=$U2")
check "assert_owned_account(foreign id, forged owner claim) -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST rpc/replace_budget_categories "{\"p_budget_id\":\"$BUD\",\"p_category_ids\":[\"$U2CAT\"]}")
DENIED=$(deny_ok "$ST" && echo 0 || echo 1)
N=$(rest "$T1" GET "budget_categories?budget_id=eq.$BUD&select=category_id" >/dev/null; json "len(d)")
check "replace_budget_categories on foreign budget -> rejected, associations intact" \
  $([ "$DENIED" = "0" ] && [ "$N" = "1" ] && echo 0 || echo 1)
ST=$(rest "$T2" POST rpc/restore_user_data "{\"p_payload\":{\"version\":3,\"accounts\":[{\"id\":\"$ACC\",\"name\":\"stolen\",\"type\":\"checking\",\"currency\":\"USD\",\"opening_balance\":0,\"balance\":0}],\"categories\":[],\"transactions\":[],\"budgets\":[],\"budget_categories\":[],\"exchange_rates\":[],\"investment_plans\":[],\"recurring_transactions\":[]}}")
check "restore_user_data claiming foreign account id -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
ST=$(rest "$T2" POST rpc/restore_user_data "{\"p_payload\":{\"version\":3,\"accounts\":[{\"id\":\"00000000-0000-0000-0000-0000000000aa\",\"user_id\":\"$U1\",\"name\":\"claimed\",\"type\":\"checking\",\"currency\":\"USD\",\"opening_balance\":0,\"balance\":0}],\"categories\":[],\"transactions\":[],\"budgets\":[],\"budget_categories\":[],\"exchange_rates\":[],\"investment_plans\":[],\"recurring_transactions\":[]}}")
check "restore_user_data payload with foreign user_id -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
N=$(rest "$T2" POST rpc/report_summary '{"p_from":null,"p_to":null,"p_currency":"USD"}' >/dev/null; json "int(d[0]['total']) if d else -1")
check "report_summary sees zero foreign rows (RLS-scoped)" $([ "$N" = "0" ] && echo 0 || echo 1)
N=$(rest "$T2" POST rpc/budget_spending "{\"p_today\":\"2026-01-15\",\"p_currency\":\"USD\"}" >/dev/null; json "len([r for r in d if '$BUD' in str(r)])")
check "budget_spending returns no foreign budgets" $([ "$N" = "0" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 8. Concurrent operations (parallel HTTP writers, no lost updates).
# ---------------------------------------------------------------------------
section "8. concurrent operations"
# 8a. 10 parallel expenses of 3 against the same account: the account row
# lock serializes the trigger deltas; balance must land exactly at 170-30.
PIDS=()
for _ in 1 2 3 4 5 6 7 8 9 10; do
  ( rest "$T1" POST transactions "{\"account_id\":\"$ACC\",\"type\":\"expense\",\"amount\":3,\"currency\":\"USD\",\"base_amount\":3,\"base_currency\":\"USD\",\"date\":\"2026-01-13\"}" >/dev/null ) &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done
check "10 parallel expenses -> balance exactly 140 (no lost updates)" $([ "$(bal "$ACC")" = "140" ] && echo 0 || echo 1)
N=$(rest "$T1" GET "transactions?date=eq.2026-01-13&select=id" >/dev/null; json "len(d)")
check "all 10 parallel inserts landed" $([ "$N" = "10" ] && echo 0 || echo 1)

# 8b. the same idempotency key racing concurrently -> exactly one pair.
IDEM2="33333333-3333-4444-5555-$UID12"
CONC_BODY="{\"p_idempotency_key\":\"$IDEM2\",\"p_from_account_id\":\"$ACC2\",\"p_to_account_id\":\"$ACC\",\"p_amount\":2,\"p_converted_amount\":2,\"p_out_base_amount\":2,\"p_out_base_currency\":\"USD\",\"p_out_base_stale\":false,\"p_in_base_amount\":2,\"p_in_base_currency\":\"USD\",\"p_in_base_stale\":false}"
PIDS=()
for _ in 1 2 3 4 5; do
  ( rest "$T1" POST rpc/create_transfer "$CONC_BODY" >/dev/null ) &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p"; done
N=$(rest "$T1" GET "transactions?transfer_id=eq.$IDEM2&select=id" >/dev/null; json "len(d)")
check "5 concurrent same-key transfers -> exactly one pair" $([ "$N" = "2" ] && echo 0 || echo 1)
check "concurrent transfers left consistent balances (ACC 142 / ACC2 428)" \
  $([ "$(bal "$ACC")" = "142" ] && [ "$(bal "$ACC2")" = "428" ] && echo 0 || echo 1)

# ---------------------------------------------------------------------------
# 9. Forged JWT claims (needs JWT_SECRET — the local stack's signing key).
#    Feasible locally: mint tokens and assert PostgREST's claim handling.
# ---------------------------------------------------------------------------
section "9. forged JWT claims"
if [ -n "${JWT_SECRET:-}" ]; then
  b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  mint() { # mint <payload-json> <secret>
    local h b
    h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64)
    b=$(printf '%s' "$1" | b64)
    printf '%s.%s.%s' "$h" "$b" \
      "$(printf '%s.%s' "$h" "$b" | openssl dgst -sha256 -hmac "$2" -binary | b64)"
  }
  EXPIRED=$(mint "{\"iss\":\"supabase-demo\",\"role\":\"authenticated\",\"sub\":\"$U1\",\"exp\":1000000000,\"aud\":\"authenticated\"}" "$JWT_SECRET")
  NOSUB=$(mint "{\"iss\":\"supabase-demo\",\"role\":\"authenticated\",\"exp\":4102444800,\"aud\":\"authenticated\"}" "$JWT_SECRET")
  DOWNGRADE=$(mint "{\"iss\":\"supabase-demo\",\"role\":\"anon\",\"sub\":\"$U1\",\"exp\":4102444800,\"aud\":\"authenticated\"}" "$JWT_SECRET")
  BADSIG=$(mint "{\"iss\":\"supabase-demo\",\"role\":\"authenticated\",\"sub\":\"$U1\",\"exp\":4102444800,\"aud\":\"authenticated\"}" "wrong-secret-$RUN_ID")
  NOALG="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.$(printf '{"iss":"supabase-demo","role":"authenticated","sub":"%s","exp":4102444800,"aud":"authenticated"}' "$U1" | b64)."

  ST=$(rest "forged-garbage-token" GET "accounts?select=*")
  check "garbage bearer token -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
  ST=$(rest "$NOALG" GET "accounts?select=*")
  check "alg=none token -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
  ST=$(rest "$EXPIRED" GET "accounts?select=*")
  check "expired token -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
  ST=$(rest "$BADSIG" GET "accounts?select=*")
  check "wrong-signature token claiming U1 -> rejected" $(deny_ok "$ST" && echo 0 || echo 1)
  ST=$(rest "$NOSUB" GET "accounts?select=*")
  check "authenticated role without sub claim -> no identity, no rows" \
    $([ "$ST" = "200" ] && [ "$(json "len(d)")" = "0" ] && echo 0 || echo 1)
  # auth.uid() keys on the sub claim, not the role claim: a token signed with
  # the server key and sub=U1 IS a U1 credential whichever role it asserts
  # (minting requires the signing key — identity, not escalation).
  ST=$(rest "$DOWNGRADE" GET "accounts?id=eq.$ACC&select=id")
  check "role=anon claim with sub=U1 (signed) acts as U1 — sub is the identity" \
    $([ "$ST" = "200" ] && [ "$(json "len(d)")" = "1" ] && echo 0 || echo 1)
else
  echo "   (JWT_SECRET not exported by `supabase status` — forging section skipped)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
if [ "$FAILURES" -gt 0 ]; then
  echo "PostgREST security suite: $FAILURES/$CHECKS checks FAILED"
  exit 1
fi
echo "PostgREST security suite: all $CHECKS checks passed."
