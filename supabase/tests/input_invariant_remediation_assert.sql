-- Remediation asserts for issue #13, run by
-- supabase/tests/run_input_invariant_tests.sh AFTER
-- 20260918000001_input_invariants.sql was applied to the seeded database.
-- Re-run after a second (idempotency) application of the migration, so every
-- assertion here must hold both times.
\set ON_ERROR_STOP on

-- Post-migration write tests below go through the set_user_id trigger, which
-- fills user_id from auth.uid() (stubbed to this GUC by the harness).
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- --- Faithful repairs -------------------------------------------------------

-- Case-normalized identifiers.
select test_assert(
  (select currency from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'USD'
  and (select base_currency from transactions where id = 'eeeeeeee-0000-0000-0000-000000000002') = 'USD'
  and (select currency from investment_plans where id = 'f0000000-0000-0000-0000-000000000001') = 'EUR'
  and (select from_currency from exchange_rates where id = 'e0000000-0000-0000-0000-000000000001') = 'USD',
  'lowercase currency identifiers must be upper-cased');

-- Transaction/recurring currency reassigned to the account currency, amounts
-- preserved bit-for-bit (row kept, no value rewritten except currency).
select test_assert(
  (select currency from transactions where id = 'eeeeeeee-0000-0000-0000-000000000003') = 'USD'
  and (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000003') = 10,
  'mismatched transaction currency must be reassigned to the account currency');
select test_assert(
  (select currency from transactions where id = 'eeeeeeee-0000-0000-0000-000000000004') = 'USD'
  and (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000004') = -10,
  'mismatched transfer leg currency must be reassigned to the account currency');
select test_assert(
  (select currency from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000005') = 'EUR'
  and (select currency from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000006') = 'EUR',
  'mismatched/lowercase recurring currencies must be repaired');

-- Contradictory recurring date ranges repaired.
select test_assert(
  (select end_date from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000003') is null
  and (select start_date from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000003')
      = current_date,
  'end_date before start_date must be dropped (schedule kept)');
select test_assert(
  (select next_date from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000004')
      = (select start_date from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000004'),
  'next_date before start_date must be reset to start_date');

-- --- Data preservation: clean rows untouched, quarantined rows intact ------

select test_assert(
  (select currency from transactions where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'USD'
  and (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000001') = 50,
  'clean transaction must be untouched');
select test_assert(
  (select currency from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000001') = 'USD'
  and (select interval_value from recurring_transactions
       where id = 'd1000000-0000-0000-0000-000000000001') = 1,
  'clean recurring row must be untouched');

select test_assert(
  (select amount::text from transactions where id = 'eeeeeeee-0000-0000-0000-000000000005') = 'NaN',
  'NaN amount row must be preserved (quarantined, not deleted)');
select test_assert(
  (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000006') = 10.999,
  'sub-cent amount row must be preserved');
select test_assert(
  (select amount from transactions where id = 'eeeeeeee-0000-0000-0000-000000000007') = -5,
  'negative expense row must be preserved');
select test_assert(
  (select interval_value from recurring_transactions
     where id = 'd1000000-0000-0000-0000-000000000002') = 0
  and (select day_of_month from recurring_transactions
     where id = 'd1000000-0000-0000-0000-000000000002') = 32,
  'out-of-bound recurring schedule row must be preserved');
select test_assert(
  (select amount from recurring_transactions where id = 'd1000000-0000-0000-0000-000000000007') = -3,
  'negative recurring amount row must be preserved');
select test_assert(
  (select amount from budgets where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 0,
  'zero budget row must be preserved');
select test_assert(
  (select rate from exchange_rates where id = 'e0000000-0000-0000-0000-000000000002') = -1,
  'negative FX rate row must be preserved');

-- Row counts: nothing deleted by remediation.
select test_assert(
  (select count(*) from transactions) = 7
  and (select count(*) from recurring_transactions) = 7
  and (select count(*) from accounts) = 3
  and (select count(*) from exchange_rates) = 2,
  'remediation must preserve every row');

-- --- Ledger integrity: amounts were never rewritten, so balances are -------
-- --- exactly opening_balance + signed effects, with openings unchanged. -----

select test_assert(
  (select opening_balance from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 100
  and (select opening_balance from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000002') = 200,
  'opening balances must be untouched');
select test_assert(
  (select bool_and(balance = opening_balance + account_ledger_effects(id))
     from accounts where id in ('aaaaaaaa-0000-0000-0000-000000000001',
                                'aaaaaaaa-0000-0000-0000-000000000002')),
  'ledger invariant must hold after remediation (balances preserved)');

-- --- Constraints are live for new writes ------------------------------------

do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 5, 'EUR', 5, 'EUR', current_date);
  raise exception 'ASSERT FAILED: post-migration currency mismatch must be rejected';
exception when foreign_key_violation then null; end $$;

do $$ begin
  insert into recurring_transactions (account_id, type, amount, currency, frequency,
                                      start_date, next_date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 5, 'USD', 'monthly',
          current_date, current_date - 1);
  raise exception 'ASSERT FAILED: post-migration next_date < start_date must be rejected';
exception when check_violation then null; end $$;

select test_assert(
  (select count(*) from transactions) = 7 and (select count(*) from recurring_transactions) = 7,
  'rejected post-migration writes must not persist');
