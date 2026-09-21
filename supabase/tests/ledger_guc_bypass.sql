-- Regression (PR #23 review, P2): the app.balance_maintenance marker set by
-- update_account_balance() must not leak past the trigger. Before the fix,
-- within one SQL transaction a legitimate transaction insert left the marker
-- enabled, so a direct UPDATE accounts SET balance silently bypassed the
-- invariant. The direct write must be rejected and the committed balance must
-- stay reconstructable as opening_balance + ledger effects.
\set ON_ERROR_STOP on
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (name, type, currency, opening_balance)
values ('bypass', 'checking', 'USD', 100)
returning id as bypass_account_id \gset

begin;

-- A legitimate transaction insert (marker enabled only inside its trigger).
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values (:'bypass_account_id', 'income', 50, 'USD', 50, 'USD', current_date);

-- Direct balance write in the same transaction must now be rejected.
do $$
begin
  update accounts set balance = 0 where id = (select id from accounts where name = 'bypass');
  raise exception 'ASSERT FAILED: direct balance write after insert should be rejected';
exception
  when others then
    if sqlerrm not like 'account balance is derived%' then
      raise exception 'ASSERT FAILED: unexpected error: %', sqlerrm;
    end if;
end $$;

commit;

select test_assert(balance = 150, 'committed balance must equal opening_balance + ledger effects (100 + 50)')
  from accounts where id = :'bypass_account_id';
select test_assert(balance = opening_balance + account_ledger_effects(id),
  'committed balance must stay reconstructable')
  from accounts where id = :'bypass_account_id';
