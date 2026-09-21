#!/usr/bin/env bash
# Query-index plan comparison (issue #17, Audit 13) against real PostgreSQL.
#
# Modeled on run_report_aggregates.sh: bootstraps a private throwaway cluster
# when no server is reachable, applies ALL migrations, seeds a representative
# multi-user dataset (30,250 transactions, ~34% owned by the measured user),
# then captures EXPLAIN ANALYZE for the PR #30 query inventory as the
# non-superuser `authenticated` role via SET ROLE + the app.test_user_id GUC.
#
# Phases:
#   1. baseline plans    — existing (initial-schema) indexes only
#   2. shape evaluation  — (user_id, date, id) asc vs (user_id, date desc, id)
#                          on the list-page sort, per the issue's acceptance
#                          criteria; the loser is dropped
#   3. after plans       — applies 20260919000002_query_indexes.sql, re-captures
#   4. asserts + idempotency — index set, plan usage, migration re-apply
#
# Usage: supabase/tests/run_query_index_tests.sh
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; query-index DB tests not run" >&2
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
  20260918000002_report_aggregates.sql
)
INDEX_MIGRATION=20260919000002_query_indexes.sql
U1=11111111-1111-1111-1111-111111111111

run_sql() { # $1=db, rest = files or -c commands
  local db=$1; shift
  $PSQL "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q -d "$db" "$@"
}

T1="abacus_query_indexes_$$"

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

install_grants() { # $1=db — Supabase projects configure equivalent default
  # privileges for the authenticated role; the stub cluster grants explicitly.
  run_sql "$1" -c 'grant usage on schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant all on all tables in schema public to authenticated;' >/dev/null
}

new_db "$T1"
for m in "${MIGRATIONS[@]}"; do
  run_sql "$T1" -f "supabase/migrations/$m" >/dev/null
done
install_grants "$T1"

echo "== 1. seed representative dataset ($T1) =="
run_sql "$T1" -f supabase/tests/query_index_seed.sql >/dev/null
$PSQL "${PSQL_ARGS[@]}" -d "$T1" -tAc \
  "select '   transactions: ' || count(*) || ' total, ' ||
          (select count(*) from transactions where user_id = '$U1') || ' for measured user'
   from transactions"

echo "== 2. BEFORE plans (initial-schema indexes) =="
run_sql "$T1" -v phase="BEFORE (initial-schema indexes)" -f supabase/tests/query_index_plans.sql

echo "== 3. index-shape evaluation for the list-page sort =="
# Issue acceptance requires evaluating (user_id, date, id): the plain ASC
# variant cannot satisfy `order by date desc, id asc` — a backward scan would
# flip the id tiebreak too, forcing a Sort node. Capture both, keep the DESC
# variant in the migration.
run_sql "$T1" -c "create index idx_eval_user_date_asc on transactions(user_id, date, id);"
run_sql "$T1" <<'SQL'
set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
\echo '--- EVAL (user_id, date, id) asc: page 1 (expect Sort node)'
explain (analyze, costs) select id from transactions
order by date desc, id asc limit 50;
SQL
run_sql "$T1" -c "drop index idx_eval_user_date_asc;"
run_sql "$T1" -c "create index idx_eval_user_date_desc on transactions(user_id, date desc, id);"
run_sql "$T1" <<'SQL'
set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
\echo '--- EVAL (user_id, date desc, id): page 1 (expect index scan, no Sort)'
explain (analyze, costs) select id from transactions
order by date desc, id asc limit 50;
SQL
run_sql "$T1" -c "drop index idx_eval_user_date_desc;"

echo "== 4. applying $INDEX_MIGRATION =="
run_sql "$T1" -f "supabase/migrations/$INDEX_MIGRATION" >/dev/null

echo "== 5. AFTER plans (new query indexes) =="
run_sql "$T1" -v phase="AFTER (20260919000002_query_indexes.sql)" -f supabase/tests/query_index_plans.sql

echo "== 6. index-set + plan-usage asserts =="
run_sql "$T1" -f supabase/tests/query_index_asserts.sql | tail -1
echo "   index set, dropped redundancies, plan usage: OK"

echo "== 7. idempotency ($T1) =="
run_sql "$T1" -f "supabase/migrations/$INDEX_MIGRATION" >/dev/null
run_sql "$T1" -f supabase/tests/query_index_asserts.sql | tail -1
echo "   idempotency: OK (migration re-applied cleanly, index set unchanged)"

echo "All query-index DB tests passed. (Full BEFORE/EVAL/AFTER plans above.)"
