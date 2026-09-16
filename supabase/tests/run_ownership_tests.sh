#!/usr/bin/env bash
# Ownership enforcement tests (issue #12) against real PostgreSQL.
#
# Unlike run_ledger_tests.sh (which runs as superuser and therefore bypasses
# RLS), these tests run as a non-superuser `authenticated` role via SET ROLE —
# the PR #23 review noted superuser stubs are insufficient. auth.uid() is
# stubbed to read the per-session app.test_user_id GUC, so each "user" is one
# GUC switch inside the same role.
#
#   1. enforcement: as two authenticated users, cross-user references on
#      INSERT and UPDATE are rejected by the composite FKs, RLS hides foreign
#      rows, deletion interference is impossible, and valid same-user
#      relationships keep working (ownership_cross_user.sql)
#   2. remediation: seed invalid cross-user rows on the pre-migration schema,
#      apply 20260917000004_ownership_enforcement.sql, and assert user data is
#      preserved and references repaired (ownership_remediation_seed.sql +
#      ownership_remediation_assert.sql)
#   3. idempotency: re-apply the migration; data state must be unchanged
#
# Usage: supabase/tests/run_ownership_tests.sh
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; ownership DB tests not run" >&2
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

OWN_MIGRATION=20260917000004_ownership_enforcement.sql
MIGRATIONS=(
  20260509000000_initial_schema.sql
  20260511182423_fix_balance_trigger_ownership.sql
  20260516000000_recurring_transactions.sql
  20260916000000_opening_balance_ledger.sql
  "$OWN_MIGRATION"
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
    end $$;' >/dev/null
}

apply_migrations() { # $1=db, $2=count prefix
  local db=$1 n=$2 i=0
  for m in "${MIGRATIONS[@]}"; do
    [ "$i" -ge "$n" ] && break
    run_sql "$db" -f "supabase/migrations/$m" >/dev/null
    i=$((i + 1))
  done
}

install_grants() { # $1=db — Supabase projects configure equivalent default
  # privileges for the authenticated role; the stub cluster grants explicitly.
  run_sql "$1" -c 'grant usage on schema public to authenticated;
    grant usage on schema auth to authenticated;
    grant execute on all functions in schema auth to authenticated;
    grant all on all tables in schema public to authenticated;' >/dev/null
}

T1="abacus_ownership_enforce_$$"
T2="abacus_ownership_remed_$$"

echo "== 1. enforcement ($T1) =="
new_db "$T1"
apply_migrations "$T1" 5
install_grants "$T1"
run_sql "$T1" -f supabase/tests/ownership_cross_user.sql >/dev/null
echo "   enforcement: OK (cross-user INSERT/UPDATE rejected, RLS holds, same-user flows work)"

echo "== 2. remediation ($T2) =="
new_db "$T2"
apply_migrations "$T2" 4
run_sql "$T2" -f supabase/tests/ownership_remediation_seed.sql >/dev/null
run_sql "$T2" -f "supabase/migrations/$OWN_MIGRATION" >/dev/null
install_grants "$T2"
run_sql "$T2" -f supabase/tests/ownership_remediation_assert.sql >/dev/null
echo "   remediation: OK (cross-user rows reassigned, foreign refs nulled, arrays converted)"

echo "== 3. idempotency ($T2) =="
run_sql "$T2" -f "supabase/migrations/$OWN_MIGRATION" >/dev/null
run_sql "$T2" -f supabase/tests/ownership_remediation_assert.sql >/dev/null
echo "   idempotency: OK (migration re-applied cleanly, data unchanged)"

echo "All ownership DB tests passed."
