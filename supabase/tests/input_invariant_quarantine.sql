-- Quarantine asserts (issue #13): legacy rows that no constraint can faithfully
-- repair stay visible, but ANY update of them re-checks the constraints, so
-- the invalid value must be fixed before the row can be edited. Run by
-- supabase/tests/run_input_invariant_tests.sh (non-mutating: the file may run
-- again after a re-applied migration).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- NaN amount row: editing anything re-checks the amount domain.
do $$ begin
  update transactions set description = 'x'
  where id = 'eeeeeeee-0000-0000-0000-000000000005';
  raise exception 'ASSERT FAILED: quarantined NaN row must reject unrelated updates';
exception when check_violation then null; end $$;

-- Sub-cent amount row.
do $$ begin
  update transactions set description = 'x'
  where id = 'eeeeeeee-0000-0000-0000-000000000006';
  raise exception 'ASSERT FAILED: quarantined sub-cent row must reject unrelated updates';
exception when check_violation then null; end $$;

-- Negative expense row.
do $$ begin
  update transactions set description = 'x'
  where id = 'eeeeeeee-0000-0000-0000-000000000007';
  raise exception 'ASSERT FAILED: quarantined negative-expense row must reject unrelated updates';
exception when check_violation then null; end $$;

-- Out-of-bound recurring schedule row: fixing one field is not enough.
do $$ begin
  update recurring_transactions set interval_value = 1
  where id = 'd1000000-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: quarantined recurring row must reject partial fixes';
exception when check_violation then null; end $$;

-- The rows are still exactly as seeded.
select test_assert(
  (select amount::text from transactions where id = 'eeeeeeee-0000-0000-0000-000000000005') = 'NaN'
  and (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000006') = 10.999
  and (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000007') = -5
  and (select interval_value from recurring_transactions
         where id = 'd1000000-0000-0000-0000-000000000002') = 0,
  'quarantined rows must be unchanged by rejected updates');
