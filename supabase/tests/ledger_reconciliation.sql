-- Ledger reconciliation semantics against real PostgreSQL.
-- Run by supabase/tests/run_ledger_tests.sh with all migrations applied
-- and a stub auth schema installed. Exits non-zero on the first failure
-- (\set ON_ERROR_STOP + test_assert).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- 1. New account: balance derives from the opening balance.
insert into accounts (name, type, currency, opening_balance)
values ('checking', 'checking', 'USD', 100)
returning id as account_id \gset
select test_assert(balance = 100, 'new account balance should equal opening balance') from accounts where id = :'account_id';

-- 2. Inserts: income/expense/transfer signed effects.
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values (:'account_id', 'income', 50, 'USD', 50, 'USD', current_date);
select test_assert(balance = 150, 'income should add 50') from accounts where id = :'account_id';

insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values (:'account_id', 'expense', 30, 'USD', 30, 'USD', current_date);
select test_assert(balance = 120, 'expense should subtract 30') from accounts where id = :'account_id';

insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values (:'account_id', 'transfer', 10, 'USD', 10, 'USD', current_date);
select test_assert(balance = 130, 'transfer should add 10') from accounts where id = :'account_id';

-- 3. Edits: amount change.
update transactions set amount = 70 where account_id = :'account_id' and type = 'income';
select test_assert(balance = 150, 'income edit 50->70 should recompute to 150') from accounts where id = :'account_id';

-- 4. Edits: moving a transaction to another account.
insert into accounts (name, type, currency, opening_balance)
values ('savings', 'savings', 'USD', 500)
returning id as other_id \gset
update transactions set account_id = :'other_id' where account_id = :'account_id' and type = 'transfer';
select test_assert(balance = 140, 'source account should lose the transfer') from accounts where id = :'account_id';
select test_assert(balance = 510, 'target account should gain the transfer') from accounts where id = :'other_id';

-- 5. Deletes: effects reverse.
delete from transactions where account_id = :'other_id' and type = 'transfer';
select test_assert(balance = 500, 'delete should restore target balance') from accounts where id = :'other_id';

-- 6. Manual corrections are explicit: editing the opening balance re-derives balance.
update accounts set opening_balance = 140 where id = :'account_id';
select test_assert(balance = 180, 'opening balance +10 should shift balance to 180') from accounts where id = :'account_id';

-- 7. Invariant enforcement: direct balance writes are rejected.
do $$
begin
  update accounts set balance = 9999 where id = (select id from accounts where name = 'checking');
  raise exception 'ASSERT FAILED: direct balance update should have been rejected';
exception
  when others then
    if sqlerrm not like 'account balance is derived%' then
      raise exception 'ASSERT FAILED: unexpected error: %', sqlerrm;
    end if;
end $$;
select test_assert(balance = 180, 'balance must be unchanged after rejected write') from accounts where id = :'account_id';

-- 8. Joint consistent update (opening + balance in one statement) is allowed
--    because it satisfies the invariant.
update accounts set opening_balance = 140, balance = 180 where id = :'account_id';

-- 9. Reconstructability: balance = opening_balance + ledger effects everywhere.
do $$
declare
  a record;
begin
  for a in select id, name, opening_balance, balance from accounts loop
    if a.balance is distinct from a.opening_balance + account_ledger_effects(a.id) then
      raise exception 'ASSERT FAILED: ledger not reconstructable for %', a.name;
    end if;
  end loop;
end $$;

-- 10. Ownership validation still enforced.
insert into auth.users values ('22222222-2222-2222-2222-222222222222');
do $$
begin
  set local app.test_user_id = '22222222-2222-2222-2222-222222222222';
  insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
  values ((select id from accounts where name = 'checking'), 'income', 5, 'USD', 5, 'USD', current_date);
  raise exception 'ASSERT FAILED: cross-user transaction should have been rejected';
exception
  when others then
    -- Since 20260917000004 the composite FK rejects cross-user references
    -- before the balance trigger's ownership check can speak; either
    -- rejection preserves the invariant being tested here.
    if sqlerrm not like 'Account does not belong to this user%'
       and sqlerrm not like 'insert or update on table "transactions" violates foreign key constraint "transactions_account_same_user_fkey"%' then
      raise exception 'ASSERT FAILED: unexpected error: %', sqlerrm;
    end if;
end $$;

select test_assert(true, 'all ledger reconciliation assertions passed');
