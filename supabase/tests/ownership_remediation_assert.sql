-- Remediation assertions for issue #12. Run by
-- supabase/tests/run_ownership_tests.sh against a database seeded by
-- ownership_remediation_seed.sql with 20260917000004_ownership_enforcement.sql
-- applied. Also re-run verbatim after a second application of the migration to
-- prove idempotency. Exits non-zero on the first failure.
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- Cross-user rows are reassigned to the referenced account's owner — the row
-- and its ledger effect are preserved, the reference becomes legitimate.
select test_assert(
  (select user_id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000002')
    = '11111111-1111-1111-1111-111111111111',
  'cross-user transaction must be reassigned to the account owner');
select test_assert(
  (select account_id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000002')
    = 'aaaaaaaa-0000-0000-0000-000000000001',
  'reassignment must not change the account reference');
select test_assert(
  (select user_id from recurring_transactions where id = 'ffffffff-0000-0000-0000-000000000002')
    = '11111111-1111-1111-1111-111111111111',
  'cross-user recurring template must be reassigned to the account owner');

-- Foreign nullable references are nulled; the referencing row is kept.
select test_assert(
  (select category_id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000003') is null,
  'foreign category reference on a transaction must be nulled');
select test_assert(
  (select id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000003') is not null,
  'remediation must preserve the referencing transaction row');
select test_assert(
  (select category_id from recurring_transactions where id = 'ffffffff-0000-0000-0000-000000000003') is null,
  'foreign category reference on a recurring template must be nulled');
select test_assert(
  (select parent_id from categories where id = 'cccccccc-0000-0000-0000-000000000003') is null,
  'foreign category parent must be nulled');
select test_assert(
  (select id from categories where id = 'cccccccc-0000-0000-0000-000000000003') is not null,
  'remediation must preserve the re-parented category row');

-- Valid same-user data must be untouched.
select test_assert(
  (select user_id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000001')
    = '11111111-1111-1111-1111-111111111111',
  'valid transaction owner must be untouched');
select test_assert(
  (select category_id from transactions where id = 'eeeeeeee-0000-0000-0000-000000000001')
    = 'cccccccc-0000-0000-0000-000000000001',
  'valid same-user category reference must be untouched');
select test_assert(
  (select category_id from recurring_transactions where id = 'ffffffff-0000-0000-0000-000000000001')
    = 'cccccccc-0000-0000-0000-000000000001',
  'valid same-user recurring reference must be untouched');

-- Budget array -> association conversion: only the valid entry survives.
select test_assert(
  (select count(*) from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'only the valid array entry may become an association row');
select test_assert(
  (select category_id from budget_categories where budget_id = 'bbbbbbbb-0000-0000-0000-000000000001')
    = 'cccccccc-0000-0000-0000-000000000001',
  'valid category association must be preserved');
select test_assert(
  (select count(*) from budgets where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1,
  'the budget row itself must be preserved');
select test_assert(
  not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'budgets'
                and column_name = 'category_ids'),
  'the legacy category_ids column must be dropped');

-- The composite same-user FKs are in place.
select test_assert(exists (select 1 from pg_constraint where conname = 'transactions_account_same_user_fkey'),
  'transactions.account_id composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'transactions_category_same_user_fkey'),
  'transactions.category_id composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'categories_parent_same_user_fkey'),
  'categories.parent_id composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'recurring_transactions_account_same_user_fkey'),
  'recurring_transactions.account_id composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'recurring_transactions_category_same_user_fkey'),
  'recurring_transactions.category_id composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'budget_categories_budget_id_user_id_fkey'),
  'budget_categories budget composite FK missing');
select test_assert(exists (select 1 from pg_constraint where conname = 'budget_categories_category_id_user_id_fkey'),
  'budget_categories category composite FK missing');

-- Post-remediation, the schema rejects new cross-user references — deletion
-- interference is structurally impossible. Run as the authenticated role so
-- RLS applies (superuser sessions bypass it).
set role authenticated;
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
do $$ begin
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'expense', 1, 'USD', 1, 'USD', current_date);
  raise exception 'ASSERT FAILED: cross-user reference must stay rejected after remediation';
exception when foreign_key_violation then null; end $$;
reset role;
