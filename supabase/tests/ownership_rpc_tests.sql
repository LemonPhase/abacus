-- Atomicity + ownership tests for replace_budget_categories (PR #27 review P2).
-- Run by supabase/tests/run_ownership_tests.sh in the enforcement database
-- (all migrations applied, grants installed). Complements the store-level
-- failure test in src/test/stores/stores.test.ts: these run against real
-- PostgreSQL as the non-superuser authenticated role.
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

set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- U1 budget with two own categories; U2 owns the foreign one.
insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000011', 'u1 a', 'expense', '#111111'),
       ('cccccccc-0000-0000-0000-000000000012', 'u1 b', 'expense', '#111111');
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000021', 'u2 a', 'expense', '#111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
insert into budgets (id, name, amount, period)
values ('bbbbbbbb-0000-0000-0000-000000000011', 'u1 rpc budget', 100, 'monthly');
select public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011',
  array['cccccccc-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000012']::uuid[]);

select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011') = 2,
  'valid same-user replace must insert both associations');

-- 1. Foreign category in the payload: the insert fails AFTER the delete — the
--    whole call must roll back and leave the prior associations intact.
do $$ begin
  perform public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011',
    array['cccccccc-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000021']::uuid[]);
  raise exception 'ASSERT FAILED: foreign category in replace must be rejected';
exception when foreign_key_violation then null; end $$;

select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011') = 2,
  'failed replace must leave prior associations intact');
select test_assert(
  (select count(*) from budget_categories
   where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011'
     and category_id = 'cccccccc-0000-0000-0000-000000000012') = 1,
  'prior association must survive the failed replace');

-- 2. Another user's budget: the ownership guard must reject the call.
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
do $$ begin
  perform public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011',
    array['cccccccc-0000-0000-0000-000000000021']::uuid[]);
  raise exception 'ASSERT FAILED: replacing another user''s budget must be rejected';
exception
  when others then
    if sqlerrm <> 'budget does not belong to this user' then
      raise exception 'ASSERT FAILED: unexpected error: %', sqlerrm;
    end if;
end $$;

-- Asserts must run as the owner: RLS hides U1''s rows from U2.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011') = 2,
  'foreign budget replace must not touch associations');

-- 3. Back to U1: empty replace clears; duplicate ids collapse to one row.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
select public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011', '{}'::uuid[]);
select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011') = 0,
  'empty replace must clear associations');

select public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011',
  array['cccccccc-0000-0000-0000-000000000011', 'cccccccc-0000-0000-0000-000000000011']::uuid[]);
select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000011') = 1,
  'duplicate ids must collapse to a single association row');

-- Leave one association in place for the concurrency phase in the harness.
select public.replace_budget_categories('bbbbbbbb-0000-0000-0000-000000000011',
  array['cccccccc-0000-0000-0000-000000000011']::uuid[]);
