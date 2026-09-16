-- Seeds invalid cross-user data on the PRE-migration schema (migrations 1-4)
-- for the remediation test. Run by supabase/tests/run_ownership_tests.sh as
-- postgres. Rows here model what the issue #12 bug allowed: transactions and
-- recurring templates referencing another user's account/category, foreign
-- category parents, and budget arrays containing foreign/dangling UUIDs.
\set ON_ERROR_STOP on

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'), -- U1
  ('22222222-2222-2222-2222-222222222222'); -- U2

-- U1's clean resources.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
insert into accounts (id, user_id, name, type, currency)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'u1 checking', 'checking', 'USD');
insert into categories (id, user_id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'u1 food', 'expense', '#111111');

-- U2's foreign resources (the attack targets).
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
insert into accounts (id, user_id, name, type, currency)
values ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'u2 checking', 'checking', 'USD');
insert into categories (id, user_id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'u2 foreign', 'expense', '#111111');

-- Clean U1 transaction + recurring (own account/category) — must be untouched.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
insert into transactions (id, user_id, account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'expense', 3, 'USD', 3, 'USD', current_date);
insert into recurring_transactions (id, user_id, account_id, category_id, type, amount, frequency)
values ('ffffffff-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
        'expense', 3, 'monthly');

-- INVALID: U2 transaction referencing U1's account (pre-20260511182423
-- residue; the balance trigger would reject it today, so bypass it).
alter table transactions disable trigger user;
insert into transactions (id, user_id, account_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001', 'expense', 5, 'USD', 5, 'USD', current_date);
alter table transactions enable trigger user;

-- INVALID: U2 recurring template referencing U1's account.
insert into recurring_transactions (id, user_id, account_id, type, amount, frequency)
values ('ffffffff-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001', 'expense', 5, 'monthly');

-- INVALID: clean U1 rows referencing U2's foreign category.
insert into transactions (id, user_id, account_id, category_id, type, amount, currency, base_amount, base_currency, date)
values ('eeeeeeee-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
        'expense', 2, 'USD', 2, 'USD', current_date);
insert into recurring_transactions (id, user_id, account_id, category_id, type, amount, frequency)
values ('ffffffff-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
        'expense', 2, 'monthly');

-- INVALID: U1 category parented under U2's category.
insert into categories (id, user_id, name, type, color, parent_id)
values ('cccccccc-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'u1 badparent', 'expense', '#111111', 'cccccccc-0000-0000-0000-000000000002');

-- Budget array mixing a valid entry, a foreign entry, and a dangling UUID.
insert into budgets (id, user_id, name, amount, period, category_ids)
values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'u1 mixed budget', 100, 'monthly',
        array['cccccccc-0000-0000-0000-000000000001'::uuid,
              'cccccccc-0000-0000-0000-000000000002'::uuid,
              'dddddddd-0000-0000-0000-0000000000dd'::uuid]);

-- Keep the ledger truthful: the bypassed trigger skipped one balance effect.
alter table accounts disable trigger user;
update accounts set balance = opening_balance + account_ledger_effects(id);
alter table accounts enable trigger user;
