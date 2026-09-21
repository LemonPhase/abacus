-- Atomic restore RPC tests: round trip, malformed payloads, mid-restore
-- failure, ownership. Run by supabase/tests/run_restore_tests.sh with all
-- migrations applied and a stub auth schema installed. Exits non-zero on the
-- first failure.
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- Runs restore_user_data(p) expecting failure; fails the test when it
-- succeeds or when no error was raised. The error itself may be a validation
-- raise (restore_user_data: ...) or a raw constraint violation from a
-- mid-restore insert — both must leave the database untouched, which the
-- caller verifies separately.
create or replace function test_restore_raises(p jsonb, msg text) returns void as $$
begin
  perform restore_user_data(p);
  raise exception 'ASSERT FAILED: restore should have failed: %', msg;
exception
  when others then
    if sqlerrm like 'ASSERT FAILED%' then
      raise exception '%', sqlerrm;
    end if;
end;
$$ language plpgsql;
