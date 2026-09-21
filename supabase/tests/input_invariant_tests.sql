-- Input invariant tests (issue #13) against real PostgreSQL.
-- Run by supabase/tests/run_input_invariant_tests.sh with ALL migrations
-- (including 20260918000001_input_invariants.sql) applied and grants installed
-- for the `authenticated` role. Runs AS that non-superuser role (SET ROLE) so
-- RLS is enforced like in production. Exits non-zero on the first failure
-- (\set ON_ERROR_STOP + test_assert / expected-exception DO blocks).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values ('11111111-1111-1111-1111-111111111111'); -- U1

set role authenticated;

-- ===========================================================================
-- A. Valid same-user flows must keep working (incl. cross-currency transfer).
-- ===========================================================================
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency, opening_balance) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'checking', 'checking', 'USD', 100),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'euro',     'cash',     'EUR', 50),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'travel',   'cash',     'USD', 0);
insert into categories (id, name, type, color) values
  ('cccccccc-0000-0000-0000-000000000001', 'food', 'expense', '#111111');

-- 2-decimal money is accepted; the ledger applies signed effects.
insert into transactions (account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'income', 10.55, 'USD', 10.55, 'USD', current_date);
insert into transactions (account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'expense', 3.2, 'USD', 3.2, 'USD', current_date);
select test_assert(
  (select balance from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 107.35,
  'ledger still applies signed effects for valid rows');

-- Cross-currency transfer: each leg carries its OWN account's currency (out
-- leg -10 moves the USD balance to 97.35).
select * from public.create_transfer(
  'aaaaaaaa-0000-0000-0000-0000000000aa',
  'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
  10, 9.5, null, current_date, 'cross currency', null,
  -10, 'USD', null, null, false,
  9.5, 'USD', 0.95, current_date, false);
select test_assert(
  (select currency from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-0000000000aa' and amount < 0) = 'USD'
  and (select currency from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-0000000000aa' and amount > 0) = 'EUR',
  'cross-currency transfer keeps per-leg account currencies');

-- Legacy untagged one-sided transfer legs (signed) keep working.
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'transfer', 3, 'EUR', 3, 'EUR', current_date);

-- A budget/investment/recurring row on the domain boundary is accepted.
insert into budgets (id, name, amount, period) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'food', 100.55, 'monthly');
insert into investment_plans (id, name, type, initial_amount, monthly_contribution, annual_return_rate, currency) values
  ('f0000000-0000-0000-0000-000000000001', 'index', 'index_fund', 0, 0, -30, 'USD');
insert into recurring_transactions (id, account_id, category_id, type, amount, currency, frequency,
                                    interval_value, day_of_month, start_date, end_date, next_date) values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'expense', 150, 'USD', 'monthly',
   2, 31, current_date, current_date + 365, current_date);
insert into exchange_rates (from_currency, to_currency, rate, date)
values ('USD', 'EUR', 0.92, current_date);

-- Account currency stays editable while no transaction pins it.
update accounts set currency = 'GBP' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select test_assert(
  (select currency from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000003') = 'GBP',
  'account currency editable while no transaction pins it');

-- ===========================================================================
-- B. Direct-API writes violating the invariants must be rejected.
--    (exception class in a comment per case)
-- ===========================================================================

-- income amount must be a positive magnitude (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', -5, 'USD', -5, 'USD', current_date);
  raise exception 'ASSERT FAILED: negative income must be rejected';
exception when check_violation then null; end $$;

-- expense amount 0 (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 0, 'USD', 0, 'USD', current_date);
  raise exception 'ASSERT FAILED: zero expense must be rejected';
exception when check_violation then null; end $$;

-- NaN amount (check_violation — NaN compares greater than every number, only
-- isfinite() catches it).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 'NaN', 'USD', 1, 'USD', current_date);
  raise exception 'ASSERT FAILED: NaN amount must be rejected';
exception when check_violation then null; end $$;

-- Infinity amount (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 'Infinity', 'USD', 1, 'USD', current_date);
  raise exception 'ASSERT FAILED: Infinity amount must be rejected';
exception when check_violation then null; end $$;

-- Sub-cent amount (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 10.999, 'USD', 10.999, 'USD', current_date);
  raise exception 'ASSERT FAILED: sub-cent amount must be rejected';
exception when check_violation then null; end $$;

-- Sub-cent base_amount (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 10, 'USD', 9.999, 'USD', current_date);
  raise exception 'ASSERT FAILED: sub-cent base_amount must be rejected';
exception when check_violation then null; end $$;

-- Transaction currency not the account's currency (foreign_key_violation) —
-- while cross-currency TRANSFERS (above) stay legal.
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 5, 'EUR', 5, 'USD', current_date);
  raise exception 'ASSERT FAILED: mismatched transaction currency must be rejected';
exception when foreign_key_violation then null; end $$;

-- Lowercase base_currency (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 5, 'USD', 5, 'usd', current_date);
  raise exception 'ASSERT FAILED: lowercase base_currency must be rejected';
exception when check_violation then null; end $$;

-- Negative fx_rate (check_violation).
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, fx_rate, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'income', 5, 'USD', 5, 'USD', -2, current_date);
  raise exception 'ASSERT FAILED: negative fx_rate must be rejected';
exception when check_violation then null; end $$;

-- Editing a valid row into an invalid one is rejected too (check_violation).
do $$ begin
  update transactions set amount = -1
  where account_id = 'aaaaaaaa-0000-0000-0000-000000000001' and type = 'income';
  raise exception 'ASSERT FAILED: UPDATE to negative income must be rejected';
exception when check_violation then null; end $$;

-- Rejected writes never touch the ledger.
select test_assert(
  (select balance from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 97.35,
  'rejected writes must not change balances');

-- Account currency is pinned by its transactions (foreign_key_violation).
do $$ begin
  update accounts set currency = 'EUR' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'ASSERT FAILED: currency change under pinned transactions must be rejected';
exception when foreign_key_violation then null; end $$;

-- Currency identifiers: lowercase and non-alpha-3 (check_violation).
do $$ begin
  insert into accounts (name, type, currency) values ('bad', 'cash', 'usd');
  raise exception 'ASSERT FAILED: lowercase account currency must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into accounts (name, type, currency) values ('bad', 'cash', 'US$');
  raise exception 'ASSERT FAILED: non-ISO account currency must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into accounts (name, type, currency, opening_balance) values ('bad', 'cash', 'USD', 'NaN');
  raise exception 'ASSERT FAILED: NaN opening_balance must be rejected';
exception when check_violation then null; end $$;

-- Budgets: positive, finite, 2dp (check_violation).
do $$ begin
  insert into budgets (name, amount, period) values ('zero', 0, 'monthly');
  raise exception 'ASSERT FAILED: zero budget must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into budgets (name, amount, period) values ('negative', -5, 'monthly');
  raise exception 'ASSERT FAILED: negative budget must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into budgets (name, amount, period) values ('subcent', 10.999, 'monthly');
  raise exception 'ASSERT FAILED: sub-cent budget must be rejected';
exception when check_violation then null; end $$;

-- Investments: non-negative amounts, rate >= -100, finite, ISO currency.
do $$ begin
  insert into investment_plans (name, type, initial_amount, currency) values ('neg', 'stock', -1, 'USD');
  raise exception 'ASSERT FAILED: negative initial_amount must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into investment_plans (name, type, monthly_contribution, currency) values ('neg', 'stock', -1, 'USD');
  raise exception 'ASSERT FAILED: negative monthly_contribution must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into investment_plans (name, type, annual_return_rate, currency) values ('impossible', 'stock', -150, 'USD');
  raise exception 'ASSERT FAILED: annual_return_rate below -100 must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into investment_plans (name, type, initial_amount, currency) values ('nan', 'stock', 'NaN', 'USD');
  raise exception 'ASSERT FAILED: NaN initial_amount must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into investment_plans (name, type, currency) values ('lowercase', 'stock', 'usd');
  raise exception 'ASSERT FAILED: lowercase investment currency must be rejected';
exception when check_violation then null; end $$;

-- Recurring: positive magnitude per its type, interval >= 1, day 1..31,
-- date ranges ordered, currency pinned to the account.
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 0, 'USD', 'monthly');
  raise exception 'ASSERT FAILED: zero recurring amount must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', -3, 'USD', 'monthly');
  raise exception 'ASSERT FAILED: negative recurring amount must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency, interval_value)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'USD', 'daily', 0);
  raise exception 'ASSERT FAILED: zero recurring interval must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency, day_of_month)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'USD', 'monthly', 0);
  raise exception 'ASSERT FAILED: day_of_month 0 must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency, day_of_month)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'USD', 'monthly', 32);
  raise exception 'ASSERT FAILED: day_of_month 32 must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency,
                                      start_date, end_date, next_date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'USD',
          'monthly', current_date, current_date - 1, current_date);
  raise exception 'ASSERT FAILED: end_date before start_date must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency,
                                      start_date, next_date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'USD',
          'monthly', current_date, current_date - 1);
  raise exception 'ASSERT FAILED: next_date before start_date must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, currency, frequency)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'expense', 5, 'EUR', 'monthly');
  raise exception 'ASSERT FAILED: recurring currency not the account currency must be rejected';
exception when foreign_key_violation then null; end $$;

-- FX quote cache: usable quotes only.
do $$ begin
  insert into exchange_rates (from_currency, to_currency, rate, date)
  values ('USD', 'JPY', 0, current_date);
  raise exception 'ASSERT FAILED: zero FX rate must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into exchange_rates (from_currency, to_currency, rate, date)
  values ('USD', 'JPY', -1, current_date);
  raise exception 'ASSERT FAILED: negative FX rate must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into exchange_rates (from_currency, to_currency, rate, date)
  values ('USD', 'JPY', 'NaN', current_date);
  raise exception 'ASSERT FAILED: NaN FX rate must be rejected';
exception when check_violation then null; end $$;
do $$ begin
  insert into exchange_rates (from_currency, to_currency, rate, date)
  values ('usD', 'JPY', 1, current_date);
  raise exception 'ASSERT FAILED: non-ISO FX currency must be rejected';
exception when check_violation then null; end $$;

-- Transfer RPC backstop: the RPC's own guard rejects negative magnitudes
-- (raise_exception), but a NaN magnitude slips past numeric comparisons and
-- is caught by the row constraint (check_violation).
do $$ begin
  perform public.create_transfer(
    'aaaaaaaa-0000-0000-0000-0000000000bb',
    'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
    -10, 9.5, null, current_date, 'negative', null,
    -10, 'USD', null, null, false,
    9.5, 'USD', 0.95, current_date, false);
  raise exception 'ASSERT FAILED: negative transfer amount must be rejected';
exception when raise_exception then null; end $$;
do $$ begin
  perform public.create_transfer(
    'aaaaaaaa-0000-0000-0000-0000000000cc',
    'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
    'NaN', 9.5, null, current_date, 'nan', null,
    -10, 'USD', null, null, false,
    9.5, 'USD', 0.95, current_date, false);
  raise exception 'ASSERT FAILED: NaN transfer amount must be rejected';
exception when check_violation then null; end $$;
select test_assert(
  not exists (select 1 from transactions
    where transfer_id in ('aaaaaaaa-0000-0000-0000-0000000000bb',
                          'aaaaaaaa-0000-0000-0000-0000000000cc')),
  'rejected RPC calls must leave no partial transfer legs');
