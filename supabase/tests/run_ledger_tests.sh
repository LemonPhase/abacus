#!/usr/bin/env bash
# Ledger reconciliation tests (issue #7) against real local PostgreSQL.
#
# Creates scratch databases, applies supabase/migrations in order (with a stub
# auth schema), and runs:
#   1. semantics: inserts/edits/deletes/opening-balance corrections/invariant
#      enforcement/ownership checks  (ledger_reconciliation.sql)
#   2. backfill: legacy balances preserved exactly, opening balances derived
#      (backfill_seed.sql + backfill_assert.sql)
#   3. concurrency: two sessions inserting transactions on the same account —
#      serialized by the account row lock, no lost update
#   4. GUC bypass: within one transaction, a legitimate transaction insert
#      followed by a direct balance write — the write is rejected and the
#      committed balance stays reconstructable (ledger_guc_bypass.sql)
#
# Usage: supabase/tests/run_ledger_tests.sh
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; ledger DB tests not run" >&2
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

TEST_USER='11111111-1111-1111-1111-111111111111'
MIGRATIONS=(
  20260509000000_initial_schema.sql
  20260511182423_fix_balance_trigger_ownership.sql
  20260516000000_recurring_transactions.sql
  20260916000000_opening_balance_ledger.sql
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
    $fn$;' >/dev/null
}

apply_migrations() { # $1=db, $2=count prefix
  local db=$1 n=$2 i=0
  for m in "${MIGRATIONS[@]}"; do
    [ "$i" -ge "$n" ] && break
    run_sql "$db" -f "supabase/migrations/$m" >/dev/null
    i=$((i + 1))
  done
}

T1="abacus_ledger_semantics_$$"
T2="abacus_ledger_backfill_$$"

echo "== 1. semantics ($T1) =="
new_db "$T1"
apply_migrations "$T1" 4
run_sql "$T1" -f supabase/tests/ledger_reconciliation.sql >/dev/null
echo "   semantics: OK"

echo "== 2. backfill reconciliation ($T2) =="
new_db "$T2"
apply_migrations "$T2" 3
run_sql "$T2" -f supabase/tests/backfill_seed.sql >/dev/null
apply_migrations "$T2" 4
run_sql "$T2" -f supabase/tests/backfill_assert.sql >/dev/null
echo "   backfill: OK (existing balances preserved, opening derived)"

echo "== 3. concurrency ($T1) =="
run_sql "$T1" -c "set app.test_user_id = '$TEST_USER';
  insert into accounts (name, type, currency, opening_balance)
  values ('concurrent', 'checking', 'USD', 1000) returning id as acc_id" \
  --csv | tail -1 | cut -d, -f1 > /tmp/abacus_acc_id_$$
ACC=$(cat /tmp/abacus_acc_id_$$)
rm -f /tmp/abacus_acc_id_$$

# Session A: income 50 inside an open transaction, holding the account row lock.
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -c "
  set app.test_user_id = '$TEST_USER';
  begin;
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('$ACC', 'income', 50, 'USD', 50, 'USD', current_date);
  select pg_sleep(1.5);
  commit;" >/dev/null &
A_PID=$!
sleep 0.4

# Session B: income 20; blocks on the account row lock until A commits.
START=$(date +%s%N)
run_sql "$T1" -c "set app.test_user_id = '$TEST_USER';
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('$ACC', 'income', 20, 'USD', 20, 'USD', current_date);" >/dev/null
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
wait $A_PID

if [ "$ELAPSED_MS" -lt 1000 ]; then
  echo "ASSERT FAILED: session B finished in ${ELAPSED_MS}ms — it did not serialize behind session A" >&2
  exit 1
fi

BAL=$(run_sql "$T1" -c "select balance from accounts where id = '$ACC'" --csv | tail -1 | cut -d, -f1)
if [ "$BAL" != "1070" ]; then
  echo "ASSERT FAILED: concurrent balance is $BAL, expected 1070 (no lost update)" >&2
  exit 1
fi
echo "   concurrency: OK (B waited ${ELAPSED_MS}ms behind A; balance = 1070, no lost update)"

echo "== 4. GUC bypass ($T1) =="
run_sql "$T1" -f supabase/tests/ledger_guc_bypass.sql >/dev/null
echo "   bypass: OK (direct write after insert rejected; balance reconstructable after commit)"

echo "All ledger DB tests passed."
