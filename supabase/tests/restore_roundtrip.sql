-- Round trip: seed a full dataset, export it to a payload, damage the live
-- data, restore, and assert every table matches the export exactly —
-- including balances (ledger model), recurring transactions, and
-- self-referential categories.
\set ON_ERROR_STOP on

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- Seed: accounts with opening balances, parent+child categories,
-- transactions across types, budget, exchange rate, investment plan, recurring.
insert into accounts (id, name, type, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', 'checking', 'checking', 'USD', 1000),
  ('a0000000-0000-0000-0000-000000000002', 'cash',     'cash',     'USD', 50);

insert into categories (id, name, type, color, parent_id) values
  ('c0000000-0000-0000-0000-000000000001', 'Food',      'expense', '#111', null),
  ('c0000000-0000-0000-0000-000000000002', 'Groceries', 'expense', '#222', 'c0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'Salary',    'income',  '#333', null);

insert into transactions (id, account_id, category_id, type, amount, currency, base_amount, base_currency, date, description) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'income',   2000, 'USD', 2000, 'USD', date '2026-01-01', 'salary'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'expense',   120, 'USD',  120, 'USD', date '2026-01-02', 'groceries'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', null,                                    'transfer',   40, 'USD',   40, 'USD', date '2026-01-03', 'to cash'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', null,                                    'income',     40, 'USD',   40, 'USD', date '2026-01-03', 'from checking');

insert into budgets (id, category_ids, name, amount, period, start_date) values
  ('b0000000-0000-0000-0000-000000000001', array['c0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002']::uuid[], 'Food budget', 400, 'monthly', date '2026-01-01');

insert into exchange_rates (id, from_currency, to_currency, rate, date) values
  ('e0000000-0000-0000-0000-000000000001', 'USD', 'EUR', 0.92, date '2026-01-01');

insert into investment_plans (id, name, type, initial_amount, monthly_contribution, annual_return_rate, currency) values
  ('f0000000-0000-0000-0000-000000000001', 'Index', 'index_fund', 5000, 200, 7.5, 'USD');

insert into recurring_transactions (id, account_id, category_id, type, amount, currency, description, frequency, interval_value, next_date, is_active) values
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'expense', 150, 'USD', 'weekly groceries', 'weekly', 1, date '2026-02-01', true);

-- Export: exactly what Settings.handleExport produces (whole rows as jsonb).
create temp table exported as
  select 'accounts' k, coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) v from accounts a
  union all select 'categories', coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from categories c
  union all select 'transactions', coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]') from transactions t
  union all select 'budgets', coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]') from budgets b
  union all select 'exchange_rates', coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]') from exchange_rates e
  union all select 'investment_plans', coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]') from investment_plans p
  union all select 'recurring_transactions', coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]') from recurring_transactions r;

create temp table snapshot as select k, v from exported;

-- Damage the live data: edit amounts, delete rows, shift opening balances.
update transactions set amount = amount + 999 where id = 'd0000000-0000-0000-0000-000000000001';
delete from recurring_transactions;
delete from budgets;
delete from exchange_rates where id = 'e0000000-0000-0000-0000-000000000001';
update accounts set opening_balance = opening_balance + 12345 where id = 'a0000000-0000-0000-0000-000000000002';

-- Restore the export.
select restore_user_data(jsonb_build_object(
  'version', 3,
  'exportedAt', '2026-01-04T00:00:00Z',
  'accounts',               (select v from exported where k = 'accounts'),
  'categories',             (select v from exported where k = 'categories'),
  'transactions',           (select v from exported where k = 'transactions'),
  'budgets',                (select v from exported where k = 'budgets'),
  'exchange_rates',         (select v from exported where k = 'exchange_rates'),
  'investment_plans',       (select v from exported where k = 'investment_plans'),
  'recurring_transactions', (select v from exported where k = 'recurring_transactions')
)) as result \gset
select test_assert(:'result'::jsonb = jsonb_build_object(
  'accounts', 2, 'categories', 3, 'transactions', 4, 'budgets', 1,
  'exchange_rates', 1, 'investment_plans', 1, 'recurring_transactions', 1),
  'RPC should return the restored row counts');

-- Every table must match the pre-damage snapshot exactly (whole rows, order-insensitive).
do $$
declare
  r record;
  live jsonb;
begin
  for r in select k, v from snapshot loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) order by x.id), ''[]''::jsonb) from %I x', r.k)
      into live;
    if live is distinct from r.v then
      raise exception 'ASSERT FAILED: table % differs after restore: got % want %', r.k, live, r.v;
    end if;
  end loop;
end $$;

-- Ledger invariant holds after restore (balance = opening + effects).
select test_assert(
  (select bool_and(balance = opening_balance + account_ledger_effects(id)) from accounts),
  'ledger invariant must hold after restore');
