-- Malformed payloads, FK errors, and mid-restore failures must abort the whole
-- restore and leave the user's data exactly as it was.
\set ON_ERROR_STOP on

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', 'checking', 'checking', 'USD', 500);
insert into categories (id, name, type, color) values
  ('c0000000-0000-0000-0000-000000000001', 'Food', 'expense', '#111');
insert into transactions (id, account_id, category_id, type, amount, currency, base_amount, base_currency, date) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'income', 100, 'USD', 100, 'USD', date '2026-01-01');
insert into budgets (id, name, amount, period) values
  ('b0000000-0000-0000-0000-000000000001', 'Food', 200, 'monthly');
insert into recurring_transactions (id, account_id, type, amount, frequency, next_date) values
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'expense', 30, 'monthly', date '2026-02-01');

-- Fingerprint of the untouched state: counts + balances + a canary row.
create temp table state as
  select 'accounts' k, count(*)::int n from accounts
  union all select 'categories', count(*)::int from categories
  union all select 'transactions', count(*)::int from transactions
  union all select 'budgets', count(*)::int from budgets
  union all select 'recurring_transactions', count(*)::int from recurring_transactions;
create temp table balance_snapshot as select id, balance from accounts;

create or replace function assert_untouched(label text) returns void as $$
declare r record; s record;
begin
  for r in
    select 'accounts' k, count(*)::int n from accounts
    union all select 'categories', count(*)::int from categories
    union all select 'transactions', count(*)::int from transactions
    union all select 'budgets', count(*)::int from budgets
    union all select 'recurring_transactions', count(*)::int from recurring_transactions
  loop
    select into s n from state where k = r.k;
    if r.n is distinct from s.n then
      raise exception 'ASSERT FAILED (%): % count changed from % to %', label, r.k, s.n, r.n;
    end if;
  end loop;
  if exists (
    select 1 from balance_snapshot b join accounts a on a.id = b.id
    where a.balance is distinct from b.balance
  ) then
    raise exception 'ASSERT FAILED (%): account balances changed', label;
  end if;
end;
$$ language plpgsql;

-- 1. Malformed payloads.
do $$
begin
  begin
    perform restore_user_data('not even json');
    raise exception 'ASSERT FAILED: non-json payload should fail (never reached: psql casts first)';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise exception '%', sqlerrm; end if;
  end;
end $$;

select test_restore_raises('[]'::jsonb, 'payload must be a JSON object');
select test_restore_raises('{"accounts": [], "transactions": []}', 'missing version');
select test_restore_raises('{"version": 1, "accounts": [], "transactions": []}', 'unsupported version 1');
select test_restore_raises('{"version": 4, "accounts": [], "transactions": []}', 'unsupported version 4');
select test_restore_raises('{"version": "2", "accounts": [], "transactions": []}', 'non-numeric version');
select test_restore_raises('{"version": 3, "transactions": []}', 'missing required accounts');
select test_restore_raises('{"version": 3, "accounts": []}', 'missing required transactions');
select test_restore_raises('{"version": 3, "accounts": {}, "transactions": []}', 'accounts must be an array');
select test_restore_raises(
  '{"version": 3, "accounts": ["nope"], "transactions": []}',
  'row must be an object with a string id');
select test_restore_raises(
  '{"version": 3, "accounts": [{"name": "x"}], "transactions": []}',
  'row must be an object with a string id (missing id)');
select test_restore_raises(
  '{"version": 3, "accounts": [], "transactions": [], "budgets": 5}',
  'budgets must be an array');

-- 2. Ownership: a foreign user_id anywhere aborts.
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "user_id": "22222222-2222-2222-2222-222222222222"}], "transactions": []}',
  'rows belonging to another user (accounts)');
select test_restore_raises(
  jsonb_build_object('version', 3,
    'accounts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from accounts a),
    'transactions', (select jsonb_agg(jsonb_set(to_jsonb(t), '{user_id}', to_jsonb('22222222-2222-2222-2222-222222222222'::uuid))) from transactions t)),
  'rows belonging to another user (transactions)');

-- 3. FK errors: references must resolve inside the payload (dangling refs are
-- rejected before any delete, even when the target exists in the database).
select test_restore_raises(
  '{"version": 3, "accounts": [], "transactions": [{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000001", "type": "income", "amount": 1, "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-01"}]}',
  'transaction referencing an account that only exists in the DB (would be deleted)');
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash"}], "transactions": [{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000001", "type": "income", "amount": 1, "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-01"}]}',
  'transaction referencing an account not in the payload');
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash"}], "transactions": [{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000009", "category_id": "c0000000-0000-0000-0000-000000000001", "type": "income", "amount": 1, "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-01"}]}',
  'category_id referencing a DB category not in the payload');
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash"}], "transactions": [], "recurring_transactions": [{"id": "d1000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000099", "type": "expense", "amount": 1, "frequency": "monthly"}]}',
  'recurring record referencing an unknown account');
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash"}], "transactions": [], "budgets": [{"id": "b0000000-0000-0000-0000-000000000009", "name": "b", "amount": 1, "period": "monthly", "category_ids": ["c0000000-0000-0000-0000-000000000001"]}]}',
  'budget referencing a DB category not in the payload');
-- malformed uuid in a reference
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "not-a-uuid", "name": "x", "type": "cash"}], "transactions": []}'::jsonb,
  'malformed uuid id');

-- 4. Mid-restore failures: validation passes, an insert fails after the
-- deletes — the transaction must roll back everything.
-- 4a. Duplicate transaction id (PK violation).
select test_restore_raises((
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash", "currency": "USD", "opening_balance": 1}], "transactions": [' ||
  '{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000009", "type": "income", "amount": 1, "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-01"},' ||
  '{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000009", "type": "expense", "amount": 1, "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-02"}]}'
)::jsonb,
  'duplicate transaction id mid-restore');
-- 4b. CHECK constraint violation (budget period).
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash", "opening_balance": 1}], "transactions": [], "budgets": [{"id": "b0000000-0000-0000-0000-000000000009", "name": "b", "amount": 1, "period": "weekly"}]}'::jsonb,
  'invalid budget period mid-restore');
-- 4c. NOT NULL violation mid-restore (account missing a required field with
-- a default: explicit NULL from jsonb_to_recordset overrides it).
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash", "opening_balance": 1}], "transactions": []}'::jsonb,
  'account missing currency mid-restore');
-- 4d. NOT NULL violation (transaction amount null).
select test_restore_raises(
  '{"version": 3, "accounts": [{"id": "a0000000-0000-0000-0000-000000000009", "name": "x", "type": "cash", "opening_balance": 1}], "transactions": [{"id": "d0000000-0000-0000-0000-000000000009", "account_id": "a0000000-0000-0000-0000-000000000009", "type": "income", "currency": "USD", "base_amount": 1, "base_currency": "USD", "date": "2026-01-01"}]}'::jsonb,
  'null amount mid-restore');

-- 5. Over the row cap.
select test_restore_raises(
  jsonb_build_object('version', 3,
    'accounts', (select jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'name', 'x', 'type', 'cash')) from generate_series(1, 10001)),
    'transactions', '[]'::jsonb),
  'row cap of 10000 enforced');

-- Every failure above left the data untouched.
select assert_untouched('after all failed restores');
select test_assert(
  (select balance = 600 from accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'balance must be untouched (500 opening + 100 income)');

-- 6. Sanity: a valid restore still works after all those failures.
select restore_user_data(jsonb_build_object('version', 3, 'accounts', '[]'::jsonb, 'transactions', '[]'::jsonb)) as result \gset
select test_assert(:'result'::jsonb = jsonb_build_object(
  'accounts', 0, 'categories', 0, 'transactions', 0, 'budgets', 0,
  'exchange_rates', 0, 'investment_plans', 0, 'recurring_transactions', 0),
  'empty restore returns zero counts');
select test_assert(
  (select count(*) = 0 from transactions),
  'empty payload wipes transactions (restore = full replace)');
