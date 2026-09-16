-- Seeds invalid rows on the PRE-invariant schema (migrations 1-9, without
-- 20260918000001) for the remediation test. Run by
-- supabase/tests/run_input_invariant_tests.sh as postgres. Rows here model
-- what direct-API writes / client bugs allowed before issue #13: wrong-case
-- currency identifiers, transaction currencies not matching the account,
-- NaN / sub-cent / negative amounts, out-of-bound recurring schedules.
\set ON_ERROR_STOP on

insert into auth.users values ('11111111-1111-1111-1111-111111111111'); -- U1
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency, opening_balance) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'checking', 'checking', 'USD', 100),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'euro',     'cash',     'EUR', 200),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'nan canary', 'cash',  'USD', 0);

-- Clean row — must be untouched by remediation.
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'income', 50, 'USD', 50, 'USD', current_date);

-- INVALID (repairable): lowercase identifiers -> upper-cased.
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
        'income', 20, 'usd', 20, 'usd', current_date);

-- INVALID (repairable): transaction currency not the account currency ->
-- reassigned to the account currency; amount (and therefore the ledger
-- effect and balance) must be preserved bit-for-bit.
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
        'income', 10, 'EUR', 10, 'EUR', current_date);

-- Same repairs on a transfer leg.
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
        'transfer', -10, 'EUR', -10, 'EUR', current_date);

-- INVALID (unrepairable — quarantined, preserved): NaN / sub-cent / negative
-- amounts. The NaN row lives on its own account so it cannot poison the
-- asserted balances via the ledger trigger.
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003',
        'income', 'NaN', 'USD', 'NaN', 'USD', current_date);
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
        'income', 10.999, 'USD', 10.999, 'USD', current_date);
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', -5, 'USD', -5, 'USD', current_date);

-- Clean recurring row — untouched.
insert into recurring_transactions (id, account_id, type, amount, currency, frequency, interval_value)
values ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', 10, 'USD', 'monthly', 1);

-- INVALID (unrepairable — quarantined): interval/day bounds.
insert into recurring_transactions (id, account_id, type, amount, currency, frequency,
                                    interval_value, day_of_month)
values ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', 5, 'USD', 'monthly', 0, 32);

-- INVALID (repairable): contradictory date ranges.
insert into recurring_transactions (id, account_id, type, amount, currency, frequency,
                                    start_date, end_date, next_date)
values ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', 5, 'USD', 'monthly', current_date, current_date - 10, current_date);
insert into recurring_transactions (id, account_id, type, amount, currency, frequency,
                                    start_date, next_date)
values ('d1000000-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', 5, 'USD', 'monthly', current_date, current_date - 5);

-- INVALID (repairable): lowercase / mismatched recurring currency.
insert into recurring_transactions (id, account_id, type, amount, currency, frequency)
values ('d1000000-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000002',
        'expense', 5, 'eur', 'monthly');
insert into recurring_transactions (id, account_id, type, amount, currency, frequency)
values ('d1000000-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002',
        'expense', 5, 'USD', 'monthly');

-- INVALID (unrepairable — quarantined): negative recurring amount.
insert into recurring_transactions (id, account_id, type, amount, currency, frequency)
values ('d1000000-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expense', -3, 'USD', 'monthly');

-- INVALID (unrepairable — quarantined): zero budget.
insert into budgets (id, name, amount, period)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'zero', 0, 'monthly');

-- INVALID (repairable): lowercase investment currency.
insert into investment_plans (id, name, type, currency)
values ('f0000000-0000-0000-0000-000000000001', 'index', 'index_fund', 'eur');

-- INVALID (repairable / quarantined): FX cache rows.
insert into exchange_rates (id, from_currency, to_currency, rate, date)
values ('e0000000-0000-0000-0000-000000000001', 'usd', 'EUR', 0.9, current_date);
insert into exchange_rates (id, from_currency, to_currency, rate, date)
values ('e0000000-0000-0000-0000-000000000002', 'USD', 'JPY', -1, current_date);
