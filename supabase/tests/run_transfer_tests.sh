#!/usr/bin/env bash
# Atomic transfer RPC tests (issue #9) against real local PostgreSQL.
#
# Creates a scratch database, applies supabase/migrations in order (with a
# stub auth schema and the roles the grants reference), and runs:
#   1. semantics: create/edit/delete/convert, idempotent retries, anchored
#      conversion, ownership of both accounts, validation failures, paired-leg
#      enforcement, caller-rollback atomicity, legacy backfill
#      (transfer_operations.sql)
#   2. concurrency A: opposite-direction transfers (A→B racing B→A) —
#      deterministic account lock order, no deadlock, no lost update
#   3. concurrency B: two sessions creating a pair with the SAME idempotency
#      key — exactly one pair commits; the other session either errors
#      (unique leg index) or converges; a retry returns the committed pair
#   4. concurrency C: different keys on the same accounts — both succeed,
#      balances serialize exactly
#
# Usage: supabase/tests/run_transfer_tests.sh
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
cleanup() {
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; transfer DB tests not run" >&2
    exit 0
  fi
  TEST_TMP=$(mktemp -d /tmp/abacus-transfer-pgtest.XXXXXX)
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
  20260917000002_atomic_transfers.sql
)

run_sql() { # $1=db, rest = files or -c commands
  local db=$1; shift
  $PSQL "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q -d "$db" "$@"
}

T1="abacus_transfer_$$"
dropdb --if-exists "${PSQL_ARGS[@]}" "$T1" 2>/dev/null || true
createdb "${PSQL_ARGS[@]}" "$T1"

# Stub auth schema (auth.uid() reads the session GUC) and the Postgres roles
# the migration's revoke/grant statements reference.
run_sql "$T1" -c 'create schema if not exists auth;
  create table if not exists auth.users(id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('"'"'app.test_user_id'"'"', true), '"'"''"'"')::uuid
  $fn$;
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = '"'"'anon'"'"') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = '"'"'authenticated'"'"') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = '"'"'service_role'"'"') then
      create role service_role nologin;
    end if;
  end $$;' >/dev/null

echo "== 1. semantics ($T1) =="
for m in "${MIGRATIONS[@]}"; do
  run_sql "$T1" -f "supabase/migrations/$m" >/dev/null
done
run_sql "$T1" -f supabase/tests/transfer_operations.sql >/dev/null
echo "   semantics: OK"

echo "== 2. concurrency: opposite transfers, no deadlock =="
run_sql "$T1" -c "set app.test_user_id = '$TEST_USER';
  insert into accounts (name, type, currency, opening_balance)
  values ('conc-a', 'checking', 'USD', 1000) returning id as acc_a" \
  --csv | tail -1 | cut -d, -f1 > /tmp/abacus_ta_$$
run_sql "$T1" -c "set app.test_user_id = '$TEST_USER';
  insert into accounts (name, type, currency, opening_balance)
  values ('conc-b', 'checking', 'USD', 1000) returning id as acc_b" \
  --csv | tail -1 | cut -d, -f1 > /tmp/abacus_tb_$$
ACC_A=$(cat /tmp/abacus_ta_$$)
ACC_B=$(cat /tmp/abacus_tb_$$)
rm -f /tmp/abacus_ta_$$ /tmp/abacus_tb_$$

KEY1=$(run_sql "$T1" -tAc "select gen_random_uuid()")
KEY2=$(run_sql "$T1" -tAc "select gen_random_uuid()")
# A→B and B→A at the same time: without a deterministic lock order these
# deadlock (each balance trigger locks the accounts in opposite order).
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -v ON_ERROR_STOP=1 -c "
  set app.test_user_id = '$TEST_USER';
  select create_transfer('$KEY1'::uuid, '$ACC_A'::uuid, '$ACC_B'::uuid, 10, 10);" >/dev/null &
S1_PID=$!
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -v ON_ERROR_STOP=1 -c "
  set app.test_user_id = '$TEST_USER';
  select create_transfer('$KEY2'::uuid, '$ACC_B'::uuid, '$ACC_A'::uuid, 20, 20);" >/dev/null &
S2_PID=$!
S1_OK=1; S2_OK=1
wait $S1_PID || S1_OK=0
wait $S2_PID || S2_OK=0
if [ "$S1_OK" != "1" ] || [ "$S2_OK" != "1" ]; then
  echo "ASSERT FAILED: opposite transfers must both succeed (deadlock abort)" >&2
  exit 1
fi
BAL_A=$(run_sql "$T1" -tAc "select balance from accounts where id = '$ACC_A'")
BAL_B=$(run_sql "$T1" -tAc "select balance from accounts where id = '$ACC_B'")
if [ "$BAL_A" != "1010" ] || [ "$BAL_B" != "990" ]; then
  echo "ASSERT FAILED: opposite-transfer balances wrong: a=$BAL_A b=$BAL_B (expected 1010/990)" >&2
  exit 1
fi
echo "   concurrency A: OK (both directions committed; a=$BAL_A b=$BAL_B)"

echo "== 3. concurrency: same idempotency key, no synchronization =="
# Two sessions fire the same create_transfer simultaneously. Exactly one pair
# must exist afterwards; the session that loses the paired-leg unique index
# converges onto the winner's pair inside its unique_violation handler.
KEY3=$(run_sql "$T1" -tAc "select gen_random_uuid()")
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -v ON_ERROR_STOP=1 -c "
  set app.test_user_id = '$TEST_USER';
  select count(*) from create_transfer('$KEY3'::uuid, '$ACC_A'::uuid, '$ACC_B'::uuid, 50, 50);" >/dev/null &
S3_PID=$!
S4_OUT=$($PSQL "${PSQL_ARGS[@]}" -d "$T1" -v ON_ERROR_STOP=1 -tA -c "
  set app.test_user_id = '$TEST_USER';
  select count(*) from create_transfer('$KEY3'::uuid, '$ACC_A'::uuid, '$ACC_B'::uuid, 50, 50);" 2>&1) || S4_FAIL=1
S4_FAIL=${S4_FAIL:-0}
wait $S3_PID

PAIRS=$(run_sql "$T1" -tAc "select count(distinct transfer_id) from transactions where transfer_id = '$KEY3'")
LEGS=$(run_sql "$T1" -tAc "select count(*) from transactions where transfer_id = '$KEY3'")
if [ "$PAIRS" != "1" ] || [ "$LEGS" != "2" ]; then
  echo "ASSERT FAILED: same-key race produced $PAIRS pairs / $LEGS legs (expected 1 pair, 2 legs)" >&2
  exit 1
fi
if [ "$(echo "$S4_OUT" | tail -1)" != "2" ] || [ "$S4_FAIL" != "0" ]; then
  echo "ASSERT FAILED: racing session did not converge onto the committed pair (out=$S4_OUT fail=$S4_FAIL)" >&2
  exit 1
fi
BAL_A=$(run_sql "$T1" -tAc "select balance from accounts where id = '$ACC_A'")
if [ "$BAL_A" != "960" ]; then
  echo "ASSERT FAILED: same-key race double-applied the effect: a=$BAL_A (expected 960)" >&2
  exit 1
fi
echo "   concurrency B: OK (exactly one pair; racing session returned the committed 2 legs; a=$BAL_A)"

echo "== 4. concurrency: different keys serialize on account locks =="
KEY4=$(run_sql "$T1" -tAc "select gen_random_uuid()")
KEY5=$(run_sql "$T1" -tAc "select gen_random_uuid()")
$PSQL "${PSQL_ARGS[@]}" -q -d "$T1" -v ON_ERROR_STOP=1 -c "
  set app.test_user_id = '$TEST_USER';
  begin;
  select create_transfer('$KEY4'::uuid, '$ACC_A'::uuid, '$ACC_B'::uuid, 30, 30);
  select pg_sleep(1.0);
  commit;" >/dev/null &
S4_PID=$!
sleep 0.3
START=$(date +%s%N)
run_sql "$T1" -c "set app.test_user_id = '$TEST_USER';
  select create_transfer('$KEY5'::uuid, '$ACC_A'::uuid, '$ACC_B'::uuid, 5, 5);" >/dev/null
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
wait $S4_PID
BAL_A=$(run_sql "$T1" -tAc "select balance from accounts where id = '$ACC_A'")
BAL_B=$(run_sql "$T1" -tAc "select balance from accounts where id = '$ACC_B'")
if [ "$BAL_A" != "925" ] || [ "$BAL_B" != "1075" ]; then
  echo "ASSERT FAILED: serialized balances wrong: a=$BAL_A b=$BAL_B (expected 925/1075)" >&2
  exit 1
fi
if [ "$ELAPSED_MS" -lt 500 ]; then
  echo "ASSERT FAILED: second transfer finished in ${ELAPSED_MS}ms — did not serialize behind the first" >&2
  exit 1
fi
echo "   concurrency C: OK (waited ${ELAPSED_MS}ms; a=$BAL_A b=$BAL_B, no lost update)"

echo "All transfer DB tests passed."
