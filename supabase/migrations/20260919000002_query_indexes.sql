-- Audit 13 (issue #17): indexes matching the finalized list/report query
-- shapes. The authoritative query inventory is PR #30 ("Index-relevant query
-- inventory"): every client read is paged through PostgREST under RLS
-- (user_id = auth.uid() injected into every query), and the report RPCs
-- (20260918000002) aggregate transactions over user-scoped date windows.
-- Measured before/after EXPLAIN ANALYZE evidence with a 10k-row seeded
-- dataset: supabase/tests/run_query_index_tests.sh (plans captured in the PR).
--
-- Initial-schema indexes led with standalone columns (type, date, category_id,
-- period) that no shipped query filters on its own — all access is user-scoped
-- first — while the user_id predicates that DO gate every query had no index
-- on most tables. Composites below lead with user_id and then follow each
-- query's sort/filter shape.
--
-- Locking note: plain CREATE INDEX takes a SHARE lock (writes blocked, reads
-- allowed) and DROP INDEX an ACCESS EXCLUSIVE lock for the build duration.
-- CREATE INDEX CONCURRENTLY cannot run inside the transactional migration
-- style used here. On a personal-finance dataset these index builds are
-- sub-second; apply during a quiet window if the table is already large.

-- ============================================================================
-- User-scoped access paths (RLS filter on every store load and export page)
-- ============================================================================

-- accounts/categories/budgets/investment_plans list views and exports:
-- filter user_id (RLS), sort id asc, range pages (PR #30 items 2-4, 6, 8).
create index if not exists idx_accounts_user_id on accounts(user_id);
create index if not exists idx_categories_user_id on categories(user_id);
create index if not exists idx_budgets_user_id on budgets(user_id);
create index if not exists idx_investment_plans_user_id on investment_plans(user_id);

-- budget_categories association table (20260917000004): the budgetsStore
-- association merge and the v3 export select (budget_id, category_id) under
-- the RLS user filter, ordered budget_id asc, category_id asc. The PK
-- (budget_id, category_id) keeps serving the budget-side joins and cascade
-- checks; idx_budget_categories_category_id keeps serving the category-side
-- FK check.
create index if not exists idx_budget_categories_user_budget_category
  on budget_categories(user_id, budget_id, category_id);

-- ============================================================================
-- transactions: list pages and report RPC windows
-- ============================================================================

-- Transactions list pages (PR #30 item 1): RLS user filter + order by
-- date desc, id asc (crudStore appends the id tiebreak), LIMIT 50 pages with
-- deep offsets. Desc on date makes a forward index scan satisfy the exact
-- mixed-direction sort — a plain (user_id, date, id) index forces a Sort node
-- (backward scan would flip the id tiebreak too). Also serves the report RPCs
-- (item 9): user-scoped date >= / date <= windows, and user_id FK cascade
-- scans when an auth user is deleted.
create index if not exists idx_transactions_user_date_id
  on transactions(user_id, date desc, id);

-- budget_spending join path (PR #30 item 10): transactions joined on
-- category_id = bc.category_id and type = 'expense' within each budget's
-- period window. The composite lets the join seek (category, expense, date
-- range) per association instead of scanning every row of the category via
-- the old single-column index. Its leading column also serves the
-- category-delete FK check that idx_transactions_category_id covered.
create index if not exists idx_transactions_category_type_date
  on transactions(category_id, type, date);

-- Recurring transactions list (PR #30 item 7): filter user_id (RLS), sort
-- next_date asc, id asc. Replaces the two single-column indexes: user_id is
-- their shared predicate and next_date is never filtered without it.
create index if not exists idx_recurring_transactions_user_next_date
  on recurring_transactions(user_id, next_date);

-- ============================================================================
-- Redundant single-column indexes (dropped with measured evidence; the
-- replacement composites cover every shipped access path, and no query
-- filters these columns standalone — all access is user-scoped via RLS)
-- ============================================================================

-- Superseded by idx_transactions_user_date_id: date is only ever filtered
-- under a user_id predicate (RLS policy on every query, report RPC windows).
drop index if exists idx_transactions_date;

-- Superseded by the leading column of idx_transactions_category_type_date
-- (same FK-check and budget-join paths); a 3-value column with no
-- standalone-type query.
drop index if exists idx_transactions_category_id;

-- No query filters type alone (3-value column); user+type pages are served
-- by idx_transactions_user_date_id with a residual filter, and budget_spending
-- by idx_transactions_category_type_date.
drop index if exists idx_transactions_type;

-- No query filters period (2-value column); budgets are always loaded whole
-- under the user_id RLS filter (now idx_budgets_user_id).
drop index if exists idx_budgets_period;

-- No query filters investment plans by type; loads are user-scoped
-- (now idx_investment_plans_user_id).
drop index if exists idx_investment_plans_type;

-- Both superseded by idx_recurring_transactions_user_next_date (user_id is
-- its leading column; next_date is only ever filtered with it).
drop index if exists idx_recurring_transactions_user_id;
drop index if exists idx_recurring_transactions_next_date;
