-- Audit 07 (issue #11): move aggregate report computation into the database.
--
-- The Dashboard/Reports pages previously loaded the full transactions table
-- into the client (capped at max_rows=1000 by PostgREST) and aggregated in
-- JavaScript loops, so large datasets silently produced wrong totals. These
-- RPCs aggregate across the full matching dataset under RLS instead.
--
-- Currency semantics (20260917000003_currency_provenance.sql): a row's
-- reliable reporting-currency amount mirrors the client's
-- reliableBaseAmount():
--   - identity rows (t.currency = p_currency) are trusted as-is;
--   - otherwise base_amount counts only when it was computed for the
--     requested reporting currency (t.base_currency = p_currency) and is not
--     flagged stale.
-- Rows with no reliable amount are excluded from sums and counted in the
-- `unconverted` columns so the UI can surface the same notice it showed when
-- aggregating client-side. The reporting currency is an explicit parameter:
-- stored aggregates are never reinterpreted for a different currency.
--
-- All functions are SECURITY INVOKER (RLS applies as the calling role) with a
-- pinned empty search_path; every relation is schema-qualified.

-- Income/expense/net totals for a date range, plus row accounting:
--   unconverted: income/expense rows in range with no reliable amount
--   total:       all rows in range (any type) — lets the UI distinguish
--                "empty period" from "nothing sumable"
create or replace function public.report_summary(
  p_from date,
  p_to date,
  p_currency text
)
returns table (income numeric, expense numeric, unconverted bigint, total bigint)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(sum(case when x.type = 'income' then x.reliable end), 0) as income,
    coalesce(sum(case when x.type = 'expense' then x.reliable end), 0) as expense,
    count(*) filter (where x.type <> 'transfer' and x.reliable is null) as unconverted,
    count(*) as total
  from (
    select t.type,
      case
        when t.currency = p_currency then t.amount
        when t.base_currency = p_currency and t.base_amount_stale = false then t.base_amount
      end as reliable
    from public.transactions t
    where (p_from is null or t.date >= p_from)
      and (p_to is null or t.date <= p_to)
  ) x;
$$;

-- Monthly income/expense buckets (first-of-month dates) for a date range.
-- Only months containing rows are returned; the client merges them into its
-- axis skeleton.
create or replace function public.report_monthly(
  p_from date,
  p_to date,
  p_currency text
)
returns table (month_start date, income numeric, expense numeric, unconverted bigint)
language sql
stable
set search_path = ''
as $$
  select
    date_trunc('month', x.d)::date as month_start,
    coalesce(sum(case when x.type = 'income' then x.reliable end), 0) as income,
    coalesce(sum(case when x.type = 'expense' then x.reliable end), 0) as expense,
    count(*) filter (where x.type <> 'transfer' and x.reliable is null) as unconverted
  from (
    select t.date as d,
      t.type,
      case
        when t.currency = p_currency then t.amount
        when t.base_currency = p_currency and t.base_amount_stale = false then t.base_amount
      end as reliable
    from public.transactions t
    where (p_from is null or t.date >= p_from)
      and (p_to is null or t.date <= p_to)
  ) x
  group by date_trunc('month', x.d)
  order by date_trunc('month', x.d);
$$;

-- Per-category income/expense for a date range. Uncategorized rows and rows
-- pointing at a category the caller cannot see (RLS) group under a null
-- category; the client labels them "Unknown"/"Other".
create or replace function public.report_by_category(
  p_from date,
  p_to date,
  p_currency text
)
returns table (category_id uuid, category_name text, category_color text, category_icon text, income numeric, expense numeric)
language sql
stable
set search_path = ''
as $$
  select
    t.category_id as category_id,
    max(c.name) as category_name,
    max(c.color) as category_color,
    max(c.icon) as category_icon,
    coalesce(sum(case when t.type = 'income' then
      case
        when t.currency = p_currency then t.amount
        when t.base_currency = p_currency and t.base_amount_stale = false then t.base_amount
      end
    end), 0) as income,
    coalesce(sum(case when t.type = 'expense' then
      case
        when t.currency = p_currency then t.amount
        when t.base_currency = p_currency and t.base_amount_stale = false then t.base_amount
      end
    end), 0) as expense
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where (p_from is null or t.date >= p_from)
    and (p_to is null or t.date <= p_to)
  group by t.category_id;
$$;

-- Per-budget current-period spending (expenses in the budget's categories).
-- p_today is the client's local date: monthly budgets count the calendar
-- month containing it, yearly budgets the calendar year. Passing the date as
-- a parameter keeps client-local month boundaries and makes the function
-- deterministic to test. Rows with no reliable amount are excluded; budgets
-- with no categories or no matching expenses report 0.
create or replace function public.budget_spending(p_today date, p_currency text)
returns table (budget_id uuid, budget_name text, budget_amount numeric, budget_period text, spent numeric)
language sql
stable
set search_path = ''
as $$
  select
    b.id as budget_id,
    b.name as budget_name,
    b.amount as budget_amount,
    b.period as budget_period,
    coalesce(sum(
      case
        when t.currency = p_currency then t.amount
        when t.base_currency = p_currency and t.base_amount_stale = false then t.base_amount
      end
    ), 0) as spent
  from public.budgets b
  left join public.budget_categories bc
    on bc.budget_id = b.id and bc.user_id = b.user_id
  left join public.transactions t
    on t.category_id = bc.category_id
   and t.type = 'expense'
   and (
     (b.period = 'monthly'
       and t.date >= date_trunc('month', p_today)::date
       and t.date < (date_trunc('month', p_today) + interval '1 month')::date)
     or
     (b.period = 'yearly'
       and t.date >= date_trunc('year', p_today)::date
       and t.date < (date_trunc('year', p_today) + interval '1 year')::date)
   )
  group by b.id
  order by b.name;
$$;

-- User-scoped RPCs: no anonymous access; authenticated gets EXECUTE via
-- Supabase's default privileges, restated explicitly here (same pattern as
-- 20260917000005_replace_budget_categories_rpc.sql).
revoke execute on function public.report_summary(date, date, text)
  from public, anon;
revoke execute on function public.report_monthly(date, date, text)
  from public, anon;
revoke execute on function public.report_by_category(date, date, text)
  from public, anon;
revoke execute on function public.budget_spending(date, text)
  from public, anon;
grant execute on function public.report_summary(date, date, text)
  to authenticated, service_role;
grant execute on function public.report_monthly(date, date, text)
  to authenticated, service_role;
grant execute on function public.report_by_category(date, date, text)
  to authenticated, service_role;
grant execute on function public.budget_spending(date, text)
  to authenticated, service_role;
