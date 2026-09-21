-- Audit 07 (issue #11): database-side report aggregates.
-- Run by supabase/tests/run_report_aggregates.sh in a database with ALL
-- migrations applied (the aggregate functions depend on the currency
-- provenance columns and the composite-FK schema). Runs as the non-superuser
-- `authenticated` role via SET ROLE + the app.test_user_id GUC, so RLS holds.
--
-- Covers, against real PostgreSQL:
--   1. report_summary / report_monthly / report_by_category: exact sums over
--      a >1000-row dataset with tied dates, provenance semantics (identity
--      rows trusted, stale/foreign-currency base rows excluded and counted as
--      unconverted, transfers ignored), month bucketing and category grouping
--   2. reporting-currency as an explicit parameter (switching currency
--      excludes not-yet-converted rows instead of reinterpreting them)
--   3. budget_spending: monthly vs yearly period windows, shared categories,
--      stale exclusion, empty budgets
--   4. RLS: aggregates only ever see the calling user's rows
--   5. deterministic offset pagination with tied dates (date desc, id asc)
--   6. anon role cannot execute the RPCs; migration is idempotent
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'), -- U1
  ('22222222-2222-2222-2222-222222222222')  -- U2
on conflict do nothing;

-- Make the whole suite re-runnable: the idempotency step in the harness
-- re-applies the migration and re-runs this file on the same database.
truncate table transactions, budget_categories, budgets, categories, accounts cascade;

set role authenticated;

-- ============================================================================
-- Seed: U1 gets 1500 bulk transactions (tied dates, ~17 per day across Jan 1
-- – Mar 30 2026, amount = i, income on even i) plus a curated set exercising
-- every provenance branch. Bulk rows are uncategorized so budget tests can
-- assert on the curated set alone.
-- ============================================================================
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency, opening_balance)
values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'u1 usd', 'checking', 'USD', 0),
       ('aaaaaaaa-0000-0000-0000-0000000000a2', 'u1 eur', 'checking', 'EUR', 0);

insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-0000000000c1', 'Groceries', 'expense', '#111111'),
       ('cccccccc-0000-0000-0000-0000000000c2', 'Salary', 'income', '#222222'),
       ('cccccccc-0000-0000-0000-0000000000c3', 'Shared', 'expense', '#333333'),
       ('cccccccc-0000-0000-0000-0000000000c9', 'Other', 'expense', '#999999');

insert into transactions (account_id, category_id, type, amount, currency,
                          base_amount, base_currency, base_amount_stale, date, description)
select 'aaaaaaaa-0000-0000-0000-0000000000a1',
       null,
       case when g % 2 = 0 then 'income' else 'expense' end,
       g::numeric,
       'USD',
       g::numeric,
       'USD',
       false,
       date '2026-01-01' + (g % 90),
       'bulk ' || g
from generate_series(1, 1500) g;

-- C1..C9: curated provenance cases (see asserts below).
insert into transactions (account_id, category_id, type, amount, currency,
                          base_amount, base_currency, base_amount_stale, date, description) values
  -- plain reliable rows
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000c1', 'income',  100, 'USD', 100, 'USD', false, '2026-01-15', 'C1'),
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000c1', 'expense',   40, 'USD',  40, 'USD', false, '2026-02-20', 'C2'),
  -- identity row with a stale base: currency matches reporting currency, so
  -- the raw amount is trusted regardless of the stale flag
  ('aaaaaaaa-0000-0000-0000-0000000000a1', null,                               'income',  100, 'USD', 100, 'XXX', true,  '2026-02-10', 'C3'),
  -- converted row with fresh provenance: base_amount counts
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000c3', 'expense',  100, 'EUR', 110, 'USD', false, '2026-03-05', 'C4'),
  -- converted row with stale provenance: excluded from sums, counted unconverted
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000c1', 'expense',  100, 'EUR', 100, 'EUR', true,  '2026-03-06', 'C5'),
  -- transfers never enter report sums or the unconverted count
  ('aaaaaaaa-0000-0000-0000-0000000000a1', null,                               'transfer', -50, 'USD', -50, 'USD', false, '2026-03-07', 'C6'),
  -- uncategorized expense: groups under the null category
  ('aaaaaaaa-0000-0000-0000-0000000000a1', null,                               'expense',   30, 'USD',  30, 'USD', false, '2026-03-10', 'C7'),
  -- EUR account identity vs USD reporting: fresh conversion base_amount counts
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'cccccccc-0000-0000-0000-0000000000c2', 'income',   70, 'EUR',  77, 'USD', false, '2026-01-05', 'C8'),
  -- expense outside every budget
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-0000000000c9', 'expense',   25, 'USD',  25, 'USD', false, '2026-03-20', 'C9');

insert into budgets (id, name, amount, period, start_date) values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'B1 monthly', 500,  'monthly', '2026-03-01'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'B2 yearly',  5000, 'yearly',  '2026-01-01'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'B3 empty',   100,  'monthly', '2026-03-01');

insert into budget_categories (budget_id, category_id) values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'cccccccc-0000-0000-0000-0000000000c1'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000c1'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-0000000000c3');

-- ============================================================================
-- 1. report_summary: full-range totals (hard-coded for the bulk sums plus the
--    curated set), provenance branches, unconverted/total accounting.
-- ============================================================================
select * from public.report_summary('2026-01-01', '2026-12-31', 'USD');

select test_assert(
  (select income from public.report_summary('2026-01-01', '2026-12-31', 'USD')) = 563250 + 100 + 100 + 77,
  'summary income = bulk even-i sum 563250 + C1 100 + C3 100 (identity, stale base still trusted) + C8 77');

select test_assert(
  (select expense from public.report_summary('2026-01-01', '2026-12-31', 'USD')) = 562500 + 40 + 110 + 30 + 25,
  'summary expense = bulk odd-i sum 562500 + C2 40 + C4 110 (fresh base_amount) + C7 30 + C9 25; C5 stale excluded');

select test_assert(
  (select unconverted from public.report_summary('2026-01-01', '2026-12-31', 'USD')) = 1,
  'summary unconverted = C5 only (stale EUR base); identity-stale C3 and transfers never count');

select test_assert(
  (select total from public.report_summary('2026-01-01', '2026-12-31', 'USD')) = 1509,
  'summary total counts every row in range including transfers (1500 bulk + 9 curated)');

-- Range narrowing: March only.
select test_assert(
  (select income from public.report_summary('2026-03-01', '2026-03-31', 'USD'))
    = (select coalesce(sum(amount), 0) from transactions
       where type = 'income' and currency = 'USD' and date >= '2026-03-01' and date <= '2026-03-31'),
  'March summary income matches an independent recomputation over the same rows');

select test_assert(
  (select expense from public.report_summary('2026-03-01', '2026-03-31', 'USD'))
    = (select coalesce(sum(case when t.currency = 'USD' then t.amount
                                when t.base_currency = 'USD' and not t.base_amount_stale then t.base_amount
                           end), 0)
       from transactions t
       where t.type = 'expense' and t.date >= '2026-03-01' and t.date <= '2026-03-31'),
  'March summary expense applies provenance per row (independent recomputation)');

select test_assert(
  (select total from public.report_summary('2026-03-01', '2026-03-31', 'USD'))
    = (select count(*) from transactions where date >= '2026-03-01' and date <= '2026-03-31'),
  'summary total is independent of type/currency (empty-period detection)');

-- Open ranges (null bounds).
select test_assert(
  (select total from public.report_summary(null, null, 'USD')) = 1509,
  'null range bounds are open');

-- ============================================================================
-- 2. Reporting currency is an explicit parameter: switching to EUR trusts
--    identity-EUR rows only; nothing is reinterpreted.
-- ============================================================================
select test_assert(
  (select income from public.report_summary('2026-01-01', '2026-12-31', 'EUR')) = 70,
  'EUR reporting: only C8 (EUR identity) counts as income; USD/EUR-converted rows are not reinterpreted');

select test_assert(
  (select expense from public.report_summary('2026-01-01', '2026-12-31', 'EUR')) = 200,
  'EUR reporting: C4 and C5 are EUR identity rows (100 each, even the stale one)');

select test_assert(
  (select unconverted from public.report_summary('2026-01-01', '2026-12-31', 'EUR')) = 1505,
  'EUR reporting: 1500 bulk + C1 + C2 + C3 + C7 + C9 (5 curated) are not yet converted to EUR');

-- ============================================================================
-- 3. report_monthly: bucketing and month-boundary inclusivity.
-- ============================================================================
select test_assert(
  (select count(*) from public.report_monthly('2026-01-01', '2026-12-31', 'USD')) = 3,
  'monthly returns exactly the three seeded months');

select test_assert(
  (select income from public.report_monthly('2026-01-01', '2026-12-31', 'USD')
   where month_start = date '2026-01-01')
    = 100 + 77 + (select coalesce(sum(amount), 0) from transactions
                  where type = 'income' and currency = 'USD' and date <= '2026-01-31'
                    and description like 'bulk%'),
  'January bucket = bulk January income (description-filtered recomputation) + C1 + C8');

select test_assert(
  (select expense from public.report_monthly('2026-01-01', '2026-12-31', 'USD')
   where month_start = date '2026-03-01')
    = (select coalesce(sum(case when t.currency = 'USD' then t.amount
                                when t.base_currency = 'USD' and not t.base_amount_stale then t.base_amount
                           end), 0)
       from transactions t
       where t.type = 'expense' and t.date >= '2026-03-01' and t.date <= '2026-03-31'),
  'March bucket expense matches independent per-row provenance recomputation');

select test_assert(
  (select count(*) from public.report_monthly('2026-02-01', '2026-02-28', 'USD')) = 1,
  'narrow range yields only the February bucket (inclusive bounds)');

-- ============================================================================
-- 4. report_by_category: grouping, uncategorized null group, transfers out.
-- ============================================================================
select test_assert(
  (select income from public.report_by_category('2026-01-01', '2026-12-31', 'USD')
   where category_name = 'Groceries') = 100,
  'Groceries income = C1 only');

select test_assert(
  (select expense from public.report_by_category('2026-01-01', '2026-12-31', 'USD')
   where category_name = 'Groceries') = 40,
  'Groceries expense = C2; stale C5 excluded');

select test_assert(
  (select expense from public.report_by_category('2026-01-01', '2026-12-31', 'USD')
   where category_id is null) = 562500 + 30,
  'null category group carries bulk expenses + uncategorized C7 (transfers excluded)');

select test_assert(
  (select income from public.report_by_category('2026-01-01', '2026-12-31', 'USD')
   where category_id is null) = 563250 + 100,
  'null category group carries bulk income + C3 (uncategorized, identity-still-trusted)');

select test_assert(
  (select expense from public.report_by_category('2026-01-01', '2026-12-31', 'USD')
   where category_name = 'Shared') = 110,
  'Shared expense = C4 fresh base_amount');

select test_assert(
  (select count(*) from public.report_by_category('2026-01-01', '2026-12-31', 'EUR')
   where category_name = 'Shared') = 1,
  'category breakdown respects the reporting-currency parameter');

-- ============================================================================
-- 5. budget_spending: period windows, shared categories, stale exclusion.
-- ============================================================================
select test_assert(
  (select spent from public.budget_spending('2026-03-15', 'USD')
   where budget_id = 'bbbbbbbb-0000-0000-0000-0000000000b1') = 0,
  'B1 monthly March window: C2 is February and stale C5 is excluded — nothing countable');

select test_assert(
  (select spent from public.budget_spending('2026-02-15', 'USD')
   where budget_id = 'bbbbbbbb-0000-0000-0000-0000000000b1') = 40,
  'B1 monthly: February window picks up C2');

select test_assert(
  (select spent from public.budget_spending('2026-03-15', 'USD')
   where budget_id = 'bbbbbbbb-0000-0000-0000-0000000000b2') = 150,
  'B2 yearly: C2 40 (Feb Groceries) + C4 110 (Mar Shared) across both categories; stale C5 excluded');

select test_assert(
  (select spent from public.budget_spending('2026-03-15', 'USD')
   where budget_id = 'bbbbbbbb-0000-0000-0000-0000000000b3') = 0,
  'B3 with no categories reports 0');

select test_assert(
  (select count(*) from public.budget_spending('2026-03-15', 'USD')) = 3,
  'every budget of the user is returned');

-- A 2027 "today" verifies the window is a pure function of p_today.
select test_assert(
  (select spent from public.budget_spending('2027-03-15', 'USD')
   where budget_id = 'bbbbbbbb-0000-0000-0000-0000000000b2') = 0,
  'B2 yearly: 2027 window is empty');

-- ============================================================================
-- 6. Deterministic offset pagination with tied dates: iterating
--    (date desc, id asc) pages of 50 must cover exactly once, and the same
--    page must be byte-identical across independent queries.
-- ============================================================================
do $$
declare
  v_offset int := 0;
  v_total bigint;
  v_collected uuid[] := '{}';
  v_page uuid[];
  v_distinct bigint;
begin
  select count(*) into v_total from transactions;
  loop
    select array(select id from transactions order by date desc, id asc offset v_offset limit 50)
      into v_page;
    v_collected := v_collected || coalesce(v_page, '{}');
    exit when coalesce(array_length(v_page, 1), 0) < 50;
    v_offset := v_offset + 50;
  end loop;
  select count(distinct x) into v_distinct from unnest(v_collected) x;
  if v_distinct <> v_total then
    raise exception 'ASSERT FAILED: paged iteration covered % distinct ids, expected %', v_distinct, v_total;
  end if;
end $$;

select test_assert(
  (select array(select id from transactions order by date desc, id asc offset 50 limit 50))
  = (select array(select id from transactions order by date desc, id asc offset 50 limit 50)),
  'page 2 (tied dates, ~17 rows per date) is identical across independent queries');

-- ============================================================================
-- 7. RLS: aggregates only see the calling user's rows.
-- ============================================================================
set app.test_user_id = '22222222-2222-2222-2222-222222222222';

select test_assert(
  (select total from public.report_summary(null, null, 'USD')) = 0
  and (select count(*) from public.report_by_category(null, null, 'USD')) = 0
  and (select count(*) from public.budget_spending('2026-03-15', 'USD')) = 0,
  'user B (no data) sees zero everywhere; user A rows are invisible under RLS');

set app.test_user_id = '11111111-1111-1111-1111-111111111111';
select test_assert(
  (select total from public.report_summary(null, null, 'USD')) = 1509,
  'user A totals unchanged after user B queried (no cross-session leakage)');

-- ============================================================================
-- 8. anon role cannot execute the report RPCs.
-- ============================================================================
set role anon;
do $$ begin
  perform public.report_summary(null, null, 'USD');
  raise exception 'ASSERT FAILED: anon must not execute report_summary';
exception when insufficient_privilege then null; end $$;
set role authenticated;
