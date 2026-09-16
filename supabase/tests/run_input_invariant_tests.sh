#!/usr/bin/env bash
# Input invariant tests (issue #13) against real PostgreSQL.
#
# Modeled on run_ownership_tests.sh: runs as a non-superuser `authenticated`
# role via SET ROLE so RLS is enforced, with auth.uid() stubbed to read the
# per-session app.test_user_id GUC.
#
#   1. rejection: as an authenticated user, direct-API writes violating the
#      domain invariants (amount signs, NaN/Infinity, sub-cent precision,
#      currency format, transaction/account currency consistency, recurring
#      interval/day/date bounds, budget/investment domains, FX rate domain)
#      are rejected by the constraints, while every legitimate flow — including
#      cross-currency transfers and transfer RPCs — keeps working
#      (input_invariant_tests.sql)
#   2. remediation: seed invalid rows on the pre-migration schema, apply
#      20260918000001_input_invariants.sql, and assert rows are preserved,
#      faithfully repaired (currency identifiers/currency consistency/recurring
#      date ranges) and balances untouched
#      (input_invariant_remediation_seed.sql + input_invariant_remediation_assert.sql)
#   3. quarantine: legacy rows that no constraint can faithfully repair are
#      kept but any UPDATE of them re-checks the constraints
#   4. idempotency: re-apply the migration; data state must be unchanged
#
# Usage: supabase/tests/run_input_invariant_tests.sh
# Requires psql + a reachable PostgreSQL server (default: local socket), 14+.
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; input invariant DB tests not run" >&2
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

if [ "$($PSQL "${PSQL_ARGS[@]}" -d "$ADMIN_DB" -tAc 'show server_version_num' | cut -c1-2)" -lt 14 ]; then
  echo "SKIP: PostgreSQL 14+ required (isfinite(numeric)); input invariant DB tests not run" >&2
  exit 0
fi

MIGRATION=20260918000001_input_invariants.sql
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

apply_migrations() { # $1=db, $2=count prefix (default: all)
  local db=$1 n=${2:-${#MIGRATIONS[@]}} i=0
  for m in "${MIGRATIONS[@]}"; do
    [ "$i" -ge "$n" ] && break
    run_sql "$db" -f "supabase/migrations/$m" >/dev/null
    i=$((i + 1))
  done
}

install_grants() { # $1=db — Supabase projects configure equivalent default
  # privileges for the authenticated role; the stub cluster grants explicitly.
  # Function execute is restated because 20260917000005 revokes PUBLIC.
  run_sql "$1" -c 'grant usage on schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant all on all tables in schema public to authenticated;' >/dev/null
}

T1="abacus_invariant_reject_$$"
T2="abacus_invariant_remed_$$"

echo "== 1. rejection + valid flows ($T1) =="
new_db "$T1"
apply_migrations "$T1"
run_sql "$T1" -f "supabase/migrations/$MIGRATION" >/dev/null
install_grants "$T1"
run_sql "$T1" -f supabase/tests/input_invariant_tests.sql >/dev/null
echo "   rejection: OK (invalid writes rejected, legitimate flows incl. cross-currency transfers work)"

echo "== 2. remediation ($T2) =="
new_db "$T2"
apply_migrations "$T2" 9
run_sql "$T2" -f supabase/tests/input_invariant_remediation_seed.sql >/dev/null
run_sql "$T2" -f "supabase/migrations/$MIGRATION" >/dev/null
run_sql "$T2" -f supabase/tests/input_invariant_remediation_assert.sql >/dev/null
echo "   remediation: OK (identifiers normalized, currencies reassigned, date ranges repaired, balances untouched)"

echo "== 3. quarantine ($T2) =="
run_sql "$T2" -f supabase/tests/input_invariant_quarantine.sql >/dev/null
echo "   quarantine: OK (unrepairable rows preserved; editing one without fixing it is rejected)"

echo "== 4. idempotency ($T2) =="
run_sql "$T2" -f "supabase/migrations/$MIGRATION" >/dev/null
run_sql "$T2" -f supabase/tests/input_invariant_remediation_assert.sql >/dev/null
echo "   idempotency: OK (migration re-applied cleanly, data unchanged)"

echo "All input invariant DB tests passed."
