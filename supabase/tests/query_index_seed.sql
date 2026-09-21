-- Audit 13 (issue #17): representative dataset for the query-index plan
-- comparison. Run by supabase/tests/run_query_index_tests.sh in a database
-- with every migration EXCEPT 20260919000002_query_indexes.sql applied, so
-- the harness can capture "before" plans first.
--
-- Seeding runs as superuser with session_replication_role = replica: trigger
-- and FK overhead is skipped (the balance trigger would otherwise run one
-- UPDATE per row) while CHECK constraints (amount domains, currency format)
-- stay enforced, so seeded rows satisfy the same invariants as client writes.
-- user_id is set explicitly (the set_user_id trigger does not fire). Plan
-- capture itself runs as `authenticated` under RLS — see query_index_plans.sql.
\set ON_ERROR_STOP on

set session_replication_role = replica;

-- Main user U1 (the measured workload) and a control user U2.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- 500 background users so the small tables are multi-tenant scale: per-user
-- fractions are ~0.2-1%, so the planner faces a real choice between a
-- user_id index scan and a whole-table scan on every RLS-scoped load.
insert into auth.users (id)
select ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 500) g;

-- U1: 3 accounts (a1 USD, a2 EUR, a3 USD), 5 categories (c1-c4 expense,
-- c5 income), 2 monthly + 1 yearly budget, 6 associations, 5 recurring.
insert into accounts (id, user_id, name, type, currency, balance, opening_balance) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'checking', 'checking', 'USD', 0, 0),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'euro',     'checking', 'EUR', 0, 0),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'savings',  'savings',  'USD', 0, 0);

insert into categories (id, user_id, name, type, color) values
  ('cccccccc-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'Groceries', 'expense', '#111111'),
  ('cccccccc-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111', 'Dining',    'expense', '#222222'),
  ('cccccccc-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-111111111111', 'Transport', 'expense', '#333333'),
  ('cccccccc-0000-0000-0000-0000000000c4', '11111111-1111-1111-1111-111111111111', 'Leisure',   'expense', '#444444'),
  ('cccccccc-0000-0000-0000-0000000000c5', '11111111-1111-1111-1111-111111111111', 'Salary',    'income',  '#555555');

insert into budgets (id, user_id, name, amount, period, start_date) values
  ('dddddddd-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'Food',     600, 'monthly', '2026-01-01'),
  ('dddddddd-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111', 'Mobility', 150, 'monthly', '2026-01-01'),
  ('dddddddd-0000-0000-0000-0000000000d3', '11111111-1111-1111-1111-111111111111', 'Yearly',  5000, 'yearly',  '2026-01-01');

insert into budget_categories (budget_id, category_id, user_id) values
  ('dddddddd-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-0000000000d1', 'cccccccc-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'cccccccc-0000-0000-0000-0000000000c2', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-0000000000d2', 'cccccccc-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-0000000000d3', 'cccccccc-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111'),
  ('dddddddd-0000-0000-0000-0000000000d3', 'cccccccc-0000-0000-0000-0000000000c4', '11111111-1111-1111-1111-111111111111');

insert into recurring_transactions (id, user_id, account_id, category_id, type, amount,
                                    currency, description, frequency, start_date, next_date) values
  ('eeeeeeee-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000c5', 'income',   3000, 'USD', 'Salary',  'monthly', '2026-08-01', '2026-09-25'),
  ('eeeeeeee-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000c1', 'expense',    85, 'USD', 'Groceries', 'weekly',  '2026-08-01', '2026-09-18'),
  ('eeeeeeee-0000-0000-0000-0000000000f3', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a3', null,                                   'expense',   950, 'USD', 'Rent',    'monthly', '2026-08-01', '2026-09-30'),
  ('eeeeeeee-0000-0000-0000-0000000000f4', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a2', null,                                   'expense',    40, 'EUR', 'Transit', 'monthly', '2026-08-01', '2026-09-01'),
  ('eeeeeeee-0000-0000-0000-0000000000f5', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a1', null,                                   'expense',   120, 'USD', 'Annual',  'yearly',  '2026-08-01', '2026-12-01');

insert into exchange_rates (user_id, from_currency, to_currency, rate, date)
select '11111111-1111-1111-1111-111111111111',
       'USD', 'EUR', 1.08, date '2026-01-01' + g
from generate_series(0, 39) g;

-- U2: 1 account, 2 categories, 1 budget + association, 2 recurring, 50 rows.
insert into accounts (id, user_id, name, type, currency, balance, opening_balance) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'u2 checking', 'checking', 'USD', 0, 0);
insert into categories (id, user_id, name, type, color) values
  ('cccccccc-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222', 'u2 food', 'expense', '#666666'),
  ('cccccccc-0000-0000-0000-0000000000e2', '22222222-2222-2222-2222-222222222222', 'u2 fun',  'expense', '#777777');
insert into budgets (id, user_id, name, amount, period, start_date) values
  ('dddddddd-0000-0000-0000-0000000000d4', '22222222-2222-2222-2222-222222222222', 'u2 budget', 100, 'monthly', '2026-01-01');
insert into budget_categories (budget_id, category_id, user_id) values
  ('dddddddd-0000-0000-0000-0000000000d4', 'cccccccc-0000-0000-0000-0000000000e1', '22222222-2222-2222-2222-222222222222');
insert into recurring_transactions (id, user_id, account_id, category_id, type, amount,
                                    currency, description, frequency, start_date, next_date) values
  ('eeeeeeee-0000-0000-0000-0000000000f6', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000b1', null, 'expense', 15, 'USD', 'u2 sub', 'monthly', '2026-08-01', '2026-09-10'),
  ('eeeeeeee-0000-0000-0000-0000000000f7', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-0000000000b1', null, 'expense', 30, 'USD', 'u2 gym', 'monthly', '2026-08-01', '2026-09-20');
insert into exchange_rates (user_id, from_currency, to_currency, rate, date)
select '22222222-2222-2222-2222-222222222222', 'USD', 'EUR', 1.09, date '2026-01-01' + g
from generate_series(0, 2) g;

-- Background users: 1 account, 2 categories, 1 budget + association,
-- 1 investment plan, 2 recurring, 2 rates, 40 transactions each.
insert into accounts (id, user_id, name, type, currency, balance, opening_balance)
select ('bbbbbbbb-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'acct', 'checking', 'USD', 0, 0
from generate_series(1, 500) g;

insert into categories (id, user_id, name, type, color)
select ('cccccccc-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'cat ' || g, 'expense', '#888888'
from generate_series(1, 500) g;
insert into categories (id, user_id, name, type, color)
select ('cccccccc-4444-4444-4444-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'cat income ' || g, 'income', '#888888'
from generate_series(1, 500) g;

insert into budgets (id, user_id, name, amount, period, start_date)
select ('dddddddd-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'budget ' || g, 100, 'monthly', '2026-01-01'
from generate_series(1, 500) g;
insert into budget_categories (budget_id, category_id, user_id)
select ('dddddddd-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('cccccccc-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 500) g;

insert into investment_plans (id, user_id, name, type, currency)
select ('ffffffff-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'plan ' || g, 'index_fund', 'USD'
from generate_series(1, 500) g;

insert into recurring_transactions (id, user_id, account_id, type, amount, currency,
                                    description, frequency, start_date, next_date)
select ('eeeeeeee-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('bbbbbbbb-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'expense', 10, 'USD', 'recurring', 'monthly', '2026-08-01', date '2026-09-01' + (g % 30)
from generate_series(1, 500) g;
insert into recurring_transactions (id, user_id, account_id, type, amount, currency,
                                    description, frequency, start_date, next_date)
select ('eeeeeeee-4444-4444-4444-' || lpad(g::text, 12, '0'))::uuid,
       ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       ('bbbbbbbb-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid,
       'expense', 20, 'USD', 'recurring', 'weekly', '2026-08-01', date '2026-09-01' + (g % 30)
from generate_series(1, 500) g;

insert into exchange_rates (user_id, from_currency, to_currency, rate, date)
select ('33333333-3333-3333-3333-' || lpad(g::text, 12, '0'))::uuid,
       'USD', 'EUR', 1.08, date '2026-01-01' + g % 30
from generate_series(1, 500) g;

-- ============================================================================
-- Transactions. U1: 10,200 rows over 990 days ending 2026-09-15 (~10/day):
-- 70% expense / 20% income / 10% transfer, 3 accounts, ~56% categorized
-- across c1-c4, 85% USD identity / 7.5% EUR converted / 7.5% GBP stale.
-- Background users: 40 rows each (20,000) so the table is 30,250 rows with
-- U1 owning ~34% — per-user selectivity the planner must reason about.
-- ============================================================================
insert into transactions (user_id, account_id, category_id, type, amount, currency,
                          base_amount, base_currency, base_amount_stale, fx_rate, fx_date,
                          date, description)
select
  '11111111-1111-1111-1111-111111111111',
  case s.g % 3 when 0 then 'aaaaaaaa-0000-0000-0000-0000000000a1'
               when 1 then 'aaaaaaaa-0000-0000-0000-0000000000a2'
               else        'aaaaaaaa-0000-0000-0000-0000000000a3' end::uuid,
  case when s.g % 10 in (0, 1, 9) or s.g % 5 = 0 then null
       else 'cccccccc-0000-0000-0000-0000000000c' || ((s.g % 4) + 1)::text end::uuid,
  case when s.g % 10 in (0, 1) then 'income' when s.g % 10 = 9 then 'transfer' else 'expense' end,
  s.amt,
  case s.g % 20 when 0 then 'EUR' when 1 then 'GBP' else 'USD' end,
  case s.g % 20 when 0 then round(s.amt * 1.08, 2) when 1 then round(s.amt * 1.27, 2) else s.amt end,
  'USD',
  case s.g % 20 when 0 then false when 1 then true else false end,
  case s.g % 20 when 0 then 1.08 when 1 then 1.27 else null end,
  case s.g % 20 when 0 then s.d when 1 then s.d else null end,
  s.d,
  'seed row ' || s.g
from (
  select g,
         round(((g * 37) % 20000)::numeric / 100, 2) + 5 as amt,
         date '2026-09-15' - (g % 990) as d
  from generate_series(1, 10200) g
) s;

insert into transactions (user_id, account_id, category_id, type, amount, currency,
                          base_amount, base_currency, base_amount_stale, date, description)
select
  ('33333333-3333-3333-3333-' || lpad(u.g::text, 12, '0'))::uuid,
  ('bbbbbbbb-0000-0000-0000-' || lpad(u.g::text, 12, '0'))::uuid,
  null,
  case when t.k % 5 = 0 then 'income' else 'expense' end,
  round(((t.k * 13) % 9000)::numeric / 100, 2) + 2,
  'USD',
  round(((t.k * 13) % 9000)::numeric / 100, 2) + 2,
  'USD',
  false,
  date '2026-09-15' - (t.k % 730),
  'bg row'
from generate_series(1, 500) u(g)
cross join generate_series(1, 40) t(k);

-- U2 control rows (50): prove plans stay user-scoped (index cond binds U1).
insert into transactions (user_id, account_id, type, amount, currency,
                          base_amount, base_currency, base_amount_stale, date, description)
select '22222222-2222-2222-2222-222222222222',
       'aaaaaaaa-0000-0000-0000-0000000000b1',
       'expense', 9.99, 'USD', 9.99, 'USD', false,
       date '2026-09-15' - g, 'u2 row'
from generate_series(1, 50) g;

-- Fresh statistics: the throwaway cluster's autovacuum has not run.
analyze transactions;
analyze accounts;
analyze categories;
analyze budgets;
analyze budget_categories;
analyze recurring_transactions;
analyze investment_plans;
analyze exchange_rates;

reset session_replication_role;
