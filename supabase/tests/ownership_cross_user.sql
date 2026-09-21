-- Ownership enforcement tests (issue #12) against real PostgreSQL.
-- Run by supabase/tests/run_ownership_tests.sh with all migrations applied and
-- grants installed for the `authenticated` role. Runs AS that non-superuser
-- role (SET ROLE) so RLS is actually enforced — a superuser session would
-- bypass RLS and hide violations (PR #23 review). Exits non-zero on the first
-- failure (\set ON_ERROR_STOP + test_assert / expected-exception DO blocks).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- Fixed identities. The issue #12 threat model assumes the attacker knows the
-- victim's UUIDs, so every cross-user attempt below uses U1's literal ids.
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'), -- U1
  ('22222222-2222-2222-2222-222222222222'); -- U2

set role authenticated;

-- ===========================================================================
-- A. Valid same-user relationships (U1) must keep working.
-- ===========================================================================
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'u1 checking', 'checking', 'USD');
insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000001', 'u1 food', 'expense', '#111111');
insert into categories (id, name, type, color, parent_id)
values ('cccccccc-0000-0000-0000-000000000003', 'u1 snacks', 'expense', '#111111',
        'cccccccc-0000-0000-0000-000000000001');
insert into budgets (id, name, amount, period)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'u1 budget', 100, 'monthly');
insert into budget_categories (budget_id, category_id)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001');
insert into transactions (account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'expense', 10, 'USD', 10, 'USD', current_date);
insert into recurring_transactions (account_id, category_id, type, amount, frequency)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'expense', 10, 'monthly');

select test_assert(
  (select user_id from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001')
    = '11111111-1111-1111-1111-111111111111',
  'set_user_id trigger must stamp the session user');
select test_assert(
  (select count(*) from budget_categories
   where budget_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'same-user budget association must insert');

-- ===========================================================================
-- B. U2's own baseline (valid same-user rows to attack from).
-- ===========================================================================
set app.test_user_id = '22222222-2222-2222-2222-222222222222';

insert into accounts (id, name, type, currency)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'u2 checking', 'checking', 'USD');
insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000002', 'u2 food', 'expense', '#111111');
insert into transactions (id, account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
        'cccccccc-0000-0000-0000-000000000002', 'expense', 5, 'USD', 5, 'USD', current_date);
insert into recurring_transactions (id, account_id, category_id, type, amount, frequency)
values ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
        'cccccccc-0000-0000-0000-000000000002', 'expense', 5, 'monthly');
insert into budgets (id, name, amount, period)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'u2 budget', 50, 'monthly');
insert into budget_categories (budget_id, category_id)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002');

-- ===========================================================================
-- C. Cross-user INSERT references must be rejected (composite FKs bypass-RLS
--    checks now require the parent row to belong to the same user).
-- ===========================================================================

-- C1: transaction referencing U1's account.
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 1, 'USD', 1, 'USD', current_date);
  raise exception 'ASSERT FAILED: cross-user transaction account_id must be rejected';
exception when foreign_key_violation then null; end $$;

-- C2: transaction referencing U1's category.
do $$ begin
  insert into transactions (account_id, category_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
          'expense', 1, 'USD', 1, 'USD', current_date);
  raise exception 'ASSERT FAILED: cross-user transaction category_id must be rejected';
exception when foreign_key_violation then null; end $$;

-- C3: category with a parent owned by U1.
do $$ begin
  insert into categories (name, type, color, parent_id)
  values ('u2 attack child', 'expense', '#111111', 'cccccccc-0000-0000-0000-000000000001');
  raise exception 'ASSERT FAILED: cross-user category parent_id must be rejected';
exception when foreign_key_violation then null; end $$;

-- C4: recurring transaction referencing U1's account.
do $$ begin
  insert into recurring_transactions (account_id, type, amount, frequency)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 1, 'monthly');
  raise exception 'ASSERT FAILED: cross-user recurring account_id must be rejected';
exception when foreign_key_violation then null; end $$;

-- C5: recurring transaction referencing U1's category.
do $$ begin
  insert into recurring_transactions (account_id, category_id, type, amount, frequency)
  values ('aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001',
          'expense', 1, 'monthly');
  raise exception 'ASSERT FAILED: cross-user recurring category_id must be rejected';
exception when foreign_key_violation then null; end $$;

-- C6: budget association referencing U1's category.
do $$ begin
  insert into budget_categories (budget_id, category_id)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001');
  raise exception 'ASSERT FAILED: cross-user budget category reference must be rejected';
exception when foreign_key_violation then null; end $$;

-- ===========================================================================
-- D. Cross-user UPDATE references must be rejected too.
-- ===========================================================================

-- D1: move own transaction to U1's account.
do $$ begin
  update transactions set account_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'eeeeeeee-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user account_id UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D2: point own transaction at U1's category.
do $$ begin
  update transactions set category_id = 'cccccccc-0000-0000-0000-000000000001'
  where id = 'eeeeeeee-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user category_id UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D3: re-parent own category under U1's category.
do $$ begin
  update categories set parent_id = 'cccccccc-0000-0000-0000-000000000001'
  where id = 'cccccccc-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user parent_id UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D4: move own recurring transaction to U1's account.
do $$ begin
  update recurring_transactions set account_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = 'ffffffff-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user recurring account_id UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D5: point own recurring transaction at U1's category.
do $$ begin
  update recurring_transactions set category_id = 'cccccccc-0000-0000-0000-000000000001'
  where id = 'ffffffff-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user recurring category_id UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D6: repoint own budget association at U1's category.
do $$ begin
  update budget_categories set category_id = 'cccccccc-0000-0000-0000-000000000001'
  where budget_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user budget association UPDATE must be rejected';
exception when foreign_key_violation then null; end $$;

-- D7: steal the row by rewriting user_id (RLS with-check and/or the composite
-- FK must stop it — either is a hard rejection).
do $$ begin
  update transactions set user_id = '11111111-1111-1111-1111-111111111111'
  where id = 'eeeeeeee-0000-0000-0000-000000000002';
  raise exception 'ASSERT FAILED: cross-user user_id rewrite must be rejected';
exception
  when insufficient_privilege then null; -- RLS with-check
  when foreign_key_violation then null;  -- composite FK
end $$;

-- ===========================================================================
-- E. RLS isolation: U2 can neither read nor mutate U1's rows.
-- ===========================================================================
select test_assert(
  (select count(*) from accounts
   where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'U2 must not see U1''s account');

do $$
declare n bigint;
begin
  update accounts set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT FAILED: U2 must not update U1''s account'; end if;
  delete from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT FAILED: U2 must not delete U1''s account'; end if;
end $$;

-- ===========================================================================
-- F. Deletion interference is impossible and same-user flows still work.
-- ===========================================================================

-- Valid same-user UPDATE: move own transaction to another own account.
insert into accounts (id, name, type, currency)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'u2 savings', 'savings', 'USD');
update transactions set account_id = 'aaaaaaaa-0000-0000-0000-000000000003'
where id = 'eeeeeeee-0000-0000-0000-000000000002';
select test_assert(
  (select account_id from transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000002')
    = 'aaaaaaaa-0000-0000-0000-000000000003',
  'same-user account move must succeed');

-- U1's own references still constrain deletes (existing semantics preserved):
-- the category referenced by U1's own transaction/recurring/child cannot go.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  delete from categories where id = 'cccccccc-0000-0000-0000-000000000001';
  raise exception 'ASSERT FAILED: own-referenced category delete should still be blocked';
exception when foreign_key_violation then null; end $$;

-- Unreferenced own rows delete fine (U2 holds no references — that is the fix).
delete from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from budgets where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from transactions where account_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from recurring_transactions where account_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from categories where id = 'cccccccc-0000-0000-0000-000000000003';
delete from categories where id = 'cccccccc-0000-0000-0000-000000000001';
delete from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select test_assert(
  (select count(*) from accounts
   where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'U1 must be able to delete own rows once own references are gone');

reset role;
