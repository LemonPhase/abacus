-- Ownership enforcement: user B can never restore user A's payload, and the
-- operation is bound to auth.uid() on both the delete and insert sides.
\set ON_ERROR_STOP on

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- User A seeds data and exports it.
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
insert into accounts (id, name, type, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', 'A checking', 'checking', 'USD', 300);
insert into transactions (id, account_id, type, amount, currency, base_amount, base_currency, date) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'income', 70, 'USD', 70, 'USD', date '2026-01-01');

create temp table a_export as
  select jsonb_build_object(
    'version', 3,
    'accounts',     (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) from accounts a),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from transactions t)
  ) payload;

-- User B seeds their own data.
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
insert into accounts (id, name, type, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000002', 'B savings', 'savings', 'USD', 900);

-- B restoring A's export must fail: the payload rows carry A's user_id.
do $$
begin
  begin
    perform restore_user_data((select payload from a_export));
    raise exception 'ASSERT FAILED: cross-user restore should have been rejected';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise exception '%', sqlerrm; end if;
      if sqlerrm not like 'restore_user_data:%' or sqlerrm not like '%another user%' then
        raise exception 'ASSERT FAILED: unexpected error for cross-user restore: %', sqlerrm;
      end if;
  end;
end $$;

-- B's data and A's data are both untouched. (psql runs as superuser, so
-- filter by user_id explicitly rather than relying on RLS.)
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
select test_assert(
  (select count(*) = 1 from accounts where user_id = '11111111-1111-1111-1111-111111111111')
  and (select balance = 370 from accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'user A data must be untouched');
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
select test_assert(
  (select count(*) = 1 from accounts where user_id = '22222222-2222-2222-2222-222222222222')
  and (select balance = 900 from accounts where id = 'a0000000-0000-0000-0000-000000000002'),
  'user B data must be untouched');

-- Rows stripped of user_id restore under B (auth.uid() fills user_id). Fresh
-- ids: a restore only deletes the caller's rows, so A's live ids would collide.
select restore_user_data(
  (select jsonb_build_object(
     'version', 3,
     'accounts',     jsonb_build_array(jsonb_build_object(
       'id', 'a0000000-0000-0000-0000-000000000009', 'name', 'Imported', 'type', 'checking',
       'currency', 'USD', 'opening_balance', 300, 'balance', 370)),
     'transactions', jsonb_build_array(jsonb_build_object(
       'id', 'd0000000-0000-0000-0000-000000000009', 'account_id', 'a0000000-0000-0000-0000-000000000009',
       'type', 'income', 'amount', 70, 'currency', 'USD', 'base_amount', 70, 'base_currency', 'USD', 'date', '2026-01-01'))
   ))
) as result \gset
select test_assert((:'result'::jsonb->>'accounts')::int = 1, 'stripped payload restores 1 account');
select test_assert(
  (select count(*) = 1 from accounts
   where user_id = '22222222-2222-2222-2222-222222222222'
     and name = 'Imported'),
  'restored rows must belong to B, never to A');
select test_assert(
  (select balance = 370 from accounts where name = 'Imported'),
  'restored balance must be exact under B (300 + 70)');
