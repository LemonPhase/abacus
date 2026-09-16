#!/usr/bin/env bash
# Recurring engine tests (issue #15) against real PostgreSQL.
#
# Modeled on run_ownership_tests.sh: runs as a non-superuser `authenticated`
# role via SET ROLE — RLS is enforced, auth.uid() is stubbed to read the
# per-session app.test_user_id GUC, so each "user" is one GUC switch inside
# the same role.
#
#   1. engine semantics: atomic apply+advance, retry idempotency, end dates,
#      overdue catch-up (daily and monthly), paused templates, ownership,
#      RLS-guarded occurrence ledger, month/year schedule arithmetic
#      (recurring_engine_tests.sql)
#   2. concurrency: two sessions applying the same due template — the row
#      lock serializes them and exactly one occurrence is produced
#   3. idempotency: re-apply the migration; data state must be unchanged
#
# Usage: supabase/tests/run_recurring_engine_tests.sh
# Requires psql + a reachable PostgreSQL server (default: local socket).
# Skips with exit 0 (message on stderr) when no server is reachable.

set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL=${PSQL:-psql}
PSQL_ARGS=()
[ -n "${PGHOST:-}" ] && PSQL_ARGS+=(-h "$PGHOST")
[ -n "${PGPORT:-}" ] && PSQL_ARGS+=(-p "$PGPORT")
ADMIN_DB=${ADMIN_DB:-postgres}

TEST_TMP=
PGCTL_PID=
cleanup() {
  [ -n "$PGCTL_PID" ] && kill "$PGCTL_PID" 2>/dev/null
  if [ -n "$TEST_TMP" ]; then
    pg_ctl -D "$TEST_TMP/pgdata" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$TEST_TMP"
  fi
  [ -n "${T1:-}" ] && dropdb --if-exists "${PSQL_ARGS[@]+"${PSQL_ARGS[@]}"}" "$T1" 2>/dev/null || true
  [ -n "${T2:-}" ] && dropdb --if-exists "${PSQL_ARGS[@]+"${PSQL_ARGS[@]}"}" "$T2" 2>/dev/null || true
}
trap cleanup EXIT

# Use a reachable server if the current user can connect; otherwise bootstrap a
# private throwaway cluster (still real PostgreSQL, hermetic).
if ! $PSQL "${PSQL_ARGS[@]}" -d "$ADMIN_DB" -tAc 'select 1' >/dev/null 2>&1; then
  if ! command -v initdb >/dev/null; then
    for d in /usr/lib/postgresql/*/bin; do [ -x "$d/initdb" ] && PATH="$d:$PATH"; done
    export PATH
  fi
  if ! command -v initdb >/dev/null; then
    echo "SKIP: no reachable PostgreSQL and initdb not found; recurring engine DB tests not run" >&2
    exit 0
  fi
  TEST_TMP=$(mktemp -d /tmp/abacus-pgtest.XXXXXX)
  echo "Bootstrapping private PostgreSQL cluster in $TEST_TMP" >&2
  initdb -D "$TEST_TMP/pgdata" --auth=trust -U postgres >/dev/null
  pg_ctl -D "$TEST_TMP/pgdata" \
    -o "-p 5433 -k $TEST_TMP -c listen_addresses=''" \
    -l "$TEST_TMP/pg.log" start >/dev/null
  export PGHOST="$TEST_TMP" PGPORT=5433 PGUSER=postgres
  PSQL_ARGS=(-h "$TEST_TMP" -p 5433 -U postgres)
fi

MIGRATION=20260919000001_recurring_engine.sql
MIGRATIONS=(
  20260509000000_initial_schema.sql
  20260511182423_fix_balance_trigger_ownership.sql
  20260516000000_recurring_transactions.sql
  20260916000000_opening_balance_ledger.sql
  20260917000001_atomic_restore.sql
  20260917000002_atomic_transfers.sql
  20260917000003_currency_provenance.sql
  20260917000004_ownership_enforcement.sql
  20260917000005_replace_budget_categories_rpc.sql
  20260918000001_input_invariants.sql
  "$MIGRATION"
)

run_sql() { # $1=db, rest = files or -c commands
  local db=$1; shift
  $PSQL "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q -d "$db" "$@"
}

new_db() { # $1=name
  dropdb --if-exists "${PSQL_ARGS[@]}" "$1" 2>/dev/null || true
  createdb "${PSQL_ARGS[@]}" "$1"
  run_sql "$1" -c 'create schema if not exists auth;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('"'"'app.test_user_id'"'"', true), '"'"''"'"')::uuid
    $fn$;
    do $$ begin
      -- Supabase standard role set; grants/revokes in migrations (e.g.
      -- 20260917000005) expect these roles to exist.
      if not exists (select 1 from pg_roles where rolname = '"'"'authenticated'"'"') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = '"'"'anon'"'"') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = '"'"'service_role'"'"') then
        create role service_role nologin;
      end if;
    end $$;' >/dev/null
}

apply_migrations() { # $1=db
  local db=$1
  for m in "${MIGRATIONS[@]}"; do
    run_sql "$db" -f "supabase/migrations/$m" >/dev/null
  done
}

install_grants() { # $1=db — Supabase projects configure equivalent default
  # privileges for the authenticated role; the stub cluster grants explicitly.
  run_sql "$1" -c 'grant usage on schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant all on all tables in schema public to authenticated;' >/dev/null
}

T1="abacus_recurring_engine_$$"
T2="abacus_recurring_idem_$$"
U1='11111111-1111-1111-1111-111111111111'
ACC='aaaaaaaa-0000-0000-0000-000000000001'
T_E1='eeeeeeee-0000-0000-0000-000000000001'

echo "== 1. engine semantics ($T1) =="
new_db "$T1"
apply_migrations "$T1"
install_grants "$T1"
run_sql "$T1" -f supabase/tests/recurring_engine_tests.sql >/dev/null
echo "   semantics: OK (atomic apply+advance, retry no-op, end dates, overdue catch-up, paused, ownership, RLS ledger, month/year boundaries)"

echo "== 2. concurrency ($T1) =="
# Fresh due template on a fresh account, then two sessions race to apply it.
run_sql "$T1" -c "
  set role authenticated;
  set app.test_user_id = '$U1';
  insert into accounts (id, name, type, currency, opening_balance, balance)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'race', 'checking', 'USD', 0, 0);
  insert into recurring_transactions
    (id, account_id, type, amount, currency, description, frequency, interval_value,
     start_date, next_date)
  values
    ('eeeeeeee-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000002',
     'expense', 7, 'USD', 'Race', 'daily', 1, current_date, current_date);" >/dev/null

# Session A applies inside an open transaction and holds the template row
# lock (FOR UPDATE in the RPC) for 1.5s; session B's apply must serialize
# behind it, then find the template no longer due and apply 0 — no duplicate.
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -c "
  set role authenticated;
  set app.test_user_id = '$U1';
  begin;
  select public.apply_recurring_occurrence('$T_E1', 15, 'USD', false);
  select public.apply_recurring_occurrence('eeeeeeee-0000-0000-0000-000000000010', 7, 'USD', false);
  select pg_sleep(1.5);
  commit;" >/dev/null &
A_PID=$!
sleep 0.4

START=$(date +%s%N)
B_RESULT=$(run_sql "$T1" -tAc "set role authenticated;
  set app.test_user_id = '$U1';
  select public.apply_recurring_occurrence('eeeeeeee-0000-0000-0000-000000000010', 7, 'USD', false);")
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
wait $A_PID

if [ "$ELAPSED_MS" -lt 1000 ]; then
  echo "ASSERT FAILED: concurrent apply finished in ${ELAPSED_MS}ms — it did not serialize behind session A" >&2
  exit 1
fi
if [ "$B_RESULT" != "0" ]; then
  echo "ASSERT FAILED: concurrent apply returned '$B_RESULT', expected 0 (loser of the race must apply nothing)" >&2
  exit 1
fi
OCC=$(run_sql "$T1" -tAc "select count(*) from recurring_occurrences
  where recurring_id = 'eeeeeeee-0000-0000-0000-000000000010'")
TXS=$(run_sql "$T1" -tAc "select count(*) from transactions
  where description = 'Race'")
if [ "$OCC" != "1" ] || [ "$TXS" != "1" ]; then
  echo "ASSERT FAILED: concurrent double-apply produced $TXS transactions / $OCC occurrences, expected exactly 1 each" >&2
  exit 1
fi
echo "   concurrency: OK (B waited ${ELAPSED_MS}ms behind A, applied 0; exactly one transaction and one occurrence)"

echo "== 3. idempotency ($T2) =="
new_db "$T2"
apply_migrations "$T2"
install_grants "$T2"
BEFORE=$(run_sql "$T2" -tAc "
  select (select count(*) from recurring_transactions)
       || '/' || (select count(*) from transactions)
       || '/' || (select count(*) from recurring_occurrences)")
run_sql "$T2" -f "supabase/migrations/$MIGRATION" >/dev/null
install_grants "$T2"
AFTER=$(run_sql "$T2" -tAc "
  select (select count(*) from recurring_transactions)
       || '/' || (select count(*) from transactions)
       || '/' || (select count(*) from recurring_occurrences)")
if [ "$BEFORE" != "$AFTER" ]; then
  echo "ASSERT FAILED: migration re-apply changed data ($BEFORE -> $AFTER)" >&2
  exit 1
fi
run_sql "$T2" -f supabase/tests/recurring_engine_tests.sql >/dev/null
echo "   idempotency: OK (migration re-applied cleanly, data unchanged, suite passes again)"

echo "All recurring engine DB tests passed."
