-- Audit 13 (issue #17): regression asserts for 20260919000002_query_indexes.sql.
-- Run by supabase/tests/run_query_index_tests.sh after applying the migration
-- (and again after re-applying it to prove idempotency).
--
-- Asserts the exact index set the migration promises: new composites present,
-- redundant single-column indexes dropped, unrelated kept indexes untouched —
-- plus a plan check that the transactions list page actually walks
-- idx_transactions_user_date_id under RLS (order date desc, id asc satisfied
-- by the index itself, no Sort node).
--
-- The small-table user_id indexes (accounts/categories/budgets/
-- investment_plans/budget_categories/recurring) are existence-asserted but
-- deliberately NOT plan-asserted: at representative per-user sizes (tens of
-- rows) the planner rightly prefers seq scans; they serve user-scoped loads
-- as total table size grows with user count and the user-delete FK cascade.
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- ============================================================================
-- New indexes exist
-- ============================================================================
do $$
declare expected text[] := array[
  'idx_accounts_user_id',
  'idx_categories_user_id',
  'idx_budgets_user_id',
  'idx_investment_plans_user_id',
  'idx_budget_categories_user_budget_category',
  'idx_transactions_user_date_id',
  'idx_transactions_category_type_date',
  'idx_recurring_transactions_user_next_date'
];
begin
  for i in 1 .. array_length(expected, 1) loop
    perform test_assert(
      exists (select 1 from pg_indexes where indexname = expected[i]),
      'expected index missing: ' || expected[i]);
  end loop;
end $$;

-- ============================================================================
-- Redundant indexes dropped
-- ============================================================================
do $$
declare dropped text[] := array[
  'idx_transactions_date',
  'idx_transactions_category_id',
  'idx_transactions_type',
  'idx_budgets_period',
  'idx_investment_plans_type',
  'idx_recurring_transactions_user_id',
  'idx_recurring_transactions_next_date'
];
begin
  for i in 1 .. array_length(dropped, 1) loop
    perform test_assert(
      not exists (select 1 from pg_indexes where indexname = dropped[i]),
      'redundant index still present: ' || dropped[i]);
  end loop;
end $$;

-- ============================================================================
-- Unrelated indexes kept
-- ============================================================================
do $$
declare kept text[] := array[
  'idx_transactions_account_id',
  'idx_transactions_transfer_id',
  'idx_transactions_transfer_out_leg',
  'idx_transactions_transfer_in_leg',
  'idx_budget_categories_category_id',
  'idx_exchange_rates_user_currency_date'
];
begin
  for i in 1 .. array_length(kept, 1) loop
    perform test_assert(
      exists (select 1 from pg_indexes where indexname = kept[i]),
      'kept index missing: ' || kept[i]);
  end loop;
end $$;

-- ============================================================================
-- Plan check: the transactions list page uses the new composite under RLS.
-- Runs as `authenticated` via the app.test_user_id GUC so the RLS policy
-- injects user_id = auth.uid() exactly like production access.
-- ============================================================================
set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

do $$
declare plan text;
begin
  -- format json: single row, so EXECUTE INTO captures the whole tree.
  execute 'explain (format json) select id from transactions
           order by date desc, id asc limit 50' into plan;
  perform test_assert(position('idx_transactions_user_date_id' in plan) > 0,
    'transactions list page does not use idx_transactions_user_date_id; plan: ' || chr(10) || plan);
  perform test_assert(position('"Node Type": "Sort"' in plan) = 0,
    'transactions list page still sorts (index order not exploited); plan: ' || chr(10) || plan);
end $$;

reset role;

select 'query_index_asserts: OK' as status;
