#!/usr/bin/env bash
# Atomic JSON restore tests (issue #8) against real local PostgreSQL.
#
# Creates scratch databases, applies supabase/migrations in order (with a stub
# auth schema), and runs:
#   1. round trip:  full dataset exported, damaged, restored — every table
#      matches the export exactly, balances preserved via the ledger model
#      (restore_roundtrip.sql)
#   2. legacy:      client-normalized v2 payload keeps balances (restore_legacy.sql)
#   3. malformed:   bad version/shape/relationships/FKs — rejected before any
#      write (restore_malformed.sql)
#   4. atomicity:   mid-restore constraint failures roll back everything,
#      pre-failure state intact (restore_malformed.sql)
#   5. ownership:   cross-user restore rejected; rows always written under
#      auth.uid() (restore_ownership.sql)
#
# Usage: supabase/tests/run_restore_tests.sh
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
    echo "SKIP: no reachable PostgreSQL and initdb not found; restore DB tests not run" >&2
    exit 0
  fi
  TEST_TMP=$(mktemp -d /tmp/abacus-pgrestore.XXXXXX)
  echo "Bootstrapping private PostgreSQL cluster in $TEST_TMP" >&2
  initdb -D "$TEST_TMP/pgdata" --auth=trust -U postgres >/dev/null
  pg_ctl -D "$TEST_TMP/pgdata" \
    -o "-p 5434 -k $TEST_TMP -c listen_addresses=''" \
    -l "$TEST_TMP/pg.log" start >/dev/null
  export PGHOST="$TEST_TMP" PGPORT=5434 PGUSER=postgres
  PSQL_ARGS=(-h "$TEST_TMP" -p 5434 -U postgres)
fi

MIGRATIONS=(
  20260509000000_initial_schema.sql
  20260511182423_fix_balance_trigger_ownership.sql
  20260516000000_recurring_transactions.sql
  20260916000000_opening_balance_ledger.sql
  20260917000001_atomic_restore.sql
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
      -- Supabase standard role set; grants/revokes in migrations (e.g.
      -- 20260917000001, 20260917000005) expect these roles to exist.
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

TEST_DB="abacus_restore_$$"
new_db "$TEST_DB"
apply_migrations "$TEST_DB"
run_sql "$TEST_DB" -f supabase/tests/restore_helpers.sql >/dev/null

# P3-2 hardening: anon must not be able to execute the RPC (permission denied
# before the in-function auth.uid() guard is even reached).
if run_sql "$TEST_DB" -c 'set role anon; select restore_user_data("{}"::jsonb);' >/dev/null 2>&1; then
  echo "ASSERT FAILED: anon must not be able to execute restore_user_data" >&2
  exit 1
fi

dropdb "${PSQL_ARGS[@]}" "$TEST_DB"

run_case() { # $1=case name, $2=file
  echo "== $1 =="
  new_db "$TEST_DB"
  apply_migrations "$TEST_DB"
  run_sql "$TEST_DB" -f supabase/tests/restore_helpers.sql >/dev/null
  run_sql "$TEST_DB" -f "$2" >/dev/null
  dropdb "${PSQL_ARGS[@]}" "$TEST_DB"
}

run_case "1. export/restore round trip" supabase/tests/restore_roundtrip.sql
echo "   round trip: OK (all tables byte-identical to the export; balances preserved)"

run_case "2. legacy (v2) export restore" supabase/tests/restore_legacy.sql
echo "   legacy: OK (normalized v2 payload preserves the exported balance)"

run_case "3+4. malformed payloads, FK errors, mid-restore rollback" supabase/tests/restore_malformed.sql
echo "   malformed: OK (version/shape/ownership/relationships/FKs rejected before any write)"
echo "   atomicity: OK (constraint failures rolled back; pre-restore state intact)"

run_case "5. ownership enforcement" supabase/tests/restore_ownership.sql
echo "   ownership: OK (cross-user restore rejected; rows written under auth.uid())"

echo "All restore DB tests passed."
