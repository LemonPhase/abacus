-- Audit 13 (issue #17): representative EXPLAIN ANALYZE captures for the
-- index plan comparison. Run twice by run_query_index_tests.sh — once
-- before 20260919000002_query_indexes.sql (phase=before) and once after
-- (phase=after) — on the same seeded dataset (query_index_seed.sql).
--
-- Runs as the non-superuser `authenticated` role via SET ROLE + the
-- app.test_user_id GUC, exactly like production access: every query relies
-- on the RLS policy (user_id = auth.uid()) rather than an explicit user
-- filter, matching what PostgREST sends for the PR #30 query inventory.
\set ON_ERROR_STOP on

-- auto_explain is loaded and configured while still superuser (LOAD and its
-- SUSET parameters require it; settings persist across SET ROLE). The RPC
-- section turns messages on via client_min_messages (USERSET) and restores it
-- after; a plain EXPLAIN of `select * from report_…()` would only show a
-- Function Scan node and hide the index choice inside the function.
load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_nested_statements = on;

set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

\echo ''
select '==================== ' || :'phase' || ' ====================' as run_phase;
\echo ''

-- ----------------------------------------------------------------------------
-- [1] Transactions list page 1 (Transactions page, PAGE_SIZE 50):
--     order date desc, id asc (crudStore id tiebreak), limit 50.
-- ----------------------------------------------------------------------------
\echo '--- [1] transactions page 1: order by date desc, id asc limit 50'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
order by date desc, id asc
limit 50;

-- ----------------------------------------------------------------------------
-- [2] Deep offset page (loadMore to page 101): offset 5000.
-- ----------------------------------------------------------------------------
\echo '--- [2] transactions deep page: order by date desc, id asc limit 50 offset 5000'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
order by date desc, id asc
limit 50 offset 5000;

-- ----------------------------------------------------------------------------
-- [3] Account-filtered page (filter bar: account = checking).
-- ----------------------------------------------------------------------------
\echo '--- [3] transactions page filtered by account_id'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
where account_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
order by date desc, id asc
limit 50;

-- ----------------------------------------------------------------------------
-- [4] Category-filtered page (filter bar: category = Groceries).
-- ----------------------------------------------------------------------------
\echo '--- [4] transactions page filtered by category_id'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
where category_id = 'cccccccc-0000-0000-0000-0000000000c1'
order by date desc, id asc
limit 50;

-- ----------------------------------------------------------------------------
-- [5] Type-filtered page (filter bar: type = expense).
-- ----------------------------------------------------------------------------
\echo '--- [5] transactions page filtered by type = expense'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
where type = 'expense'
order by date desc, id asc
limit 50;

-- ----------------------------------------------------------------------------
-- [6] Date-range-filtered page (filter bar: date from/to).
-- ----------------------------------------------------------------------------
\echo '--- [6] transactions page filtered by date range'
explain (analyze, costs, buffers)
select id, date, type, amount, currency, description
from transactions
where date >= '2026-09-01' and date <= '2026-09-15'
order by date desc, id asc
limit 50;

-- ----------------------------------------------------------------------------
-- [7]-[10] Report RPCs (PostgREST-style calls). auto_explain reveals the
-- nested plans: production calls execute the function body with bound
-- parameters (no literal folding), so what matters is how the RLS user
-- predicate + date-range parameters navigate the indexes.
-- ----------------------------------------------------------------------------
set client_min_messages = log;

\echo '--- [7] report_summary(2026-04-01, 2026-06-30, USD)'
explain (analyze, costs, buffers)
select * from report_summary('2026-04-01', '2026-06-30', 'USD');

\echo '--- [8] report_monthly(2024-01-01, 2026-09-15, USD)'
explain (analyze, costs, buffers)
select * from report_monthly('2024-01-01', '2026-09-15', 'USD');

\echo '--- [9] report_by_category(2026-04-01, 2026-06-30, USD)'
explain (analyze, costs, buffers)
select * from report_by_category('2026-04-01', '2026-06-30', 'USD');

-- ----------------------------------------------------------------------------
-- [10] budget_spending RPC (monthly + yearly period windows).
-- ----------------------------------------------------------------------------
\echo '--- [10] budget_spending(2026-09-15, USD)'
explain (analyze, costs, buffers)
select * from budget_spending('2026-09-15', 'USD');

reset role;
set client_min_messages = notice;
set auto_explain.log_nested_statements = off;
set auto_explain.log_min_duration = -1;
set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- ----------------------------------------------------------------------------
-- [11] budget_categories association load (budgetsStore.loadAssociations +
--      export): user-scoped via RLS, order budget_id, category_id.
-- ----------------------------------------------------------------------------
\echo '--- [11] budget_categories load: order by budget_id, category_id'
explain (analyze, costs, buffers)
select budget_id, category_id
from budget_categories
order by budget_id asc, category_id asc;

-- ----------------------------------------------------------------------------
-- [12] Small-table user loads (accounts/categories/budgets/investment_plans/
--      recurring_transactions/exchange_rates store loads and export pages).
-- ----------------------------------------------------------------------------
\echo '--- [12a] accounts load: order by id (RLS user filter)'
explain (analyze, costs, buffers)
select * from accounts order by id asc;

\echo '--- [12b] categories load: order by id (RLS user filter)'
explain (analyze, costs, buffers)
select * from categories order by id asc;

\echo '--- [12c] budgets load: order by id (RLS user filter)'
explain (analyze, costs, buffers)
select * from budgets order by id asc;

\echo '--- [12d] investment_plans load: order by id (RLS user filter)'
explain (analyze, costs, buffers)
select * from investment_plans order by id asc;

\echo '--- [12e] recurring_transactions load: order by next_date asc, id asc'
explain (analyze, costs, buffers)
select * from recurring_transactions order by next_date asc, id asc;

\echo '--- [12f] exchange_rates export page: order by id (RLS user filter)'
explain (analyze, costs, buffers)
select * from exchange_rates order by id asc;

-- ----------------------------------------------------------------------------
-- [13] FK enforcement path: category delete must find referencing
--      transactions (RI trigger runs SELECT ... WHERE category_id = $1
--      FOR KEY SHARE). Shows the composite keeps this path covered after
--      idx_transactions_category_id is dropped.
-- ----------------------------------------------------------------------------
\echo '--- [13] category-delete FK check shape: where category_id = $1'
explain (analyze, costs, buffers)
select id from transactions
where category_id = 'cccccccc-0000-0000-0000-0000000000c1'
for key share;

reset role;
