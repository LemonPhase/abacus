-- Backfill reconciliation: existing balances must be preserved exactly and
-- opening balances derived, never guessed.
-- Run by supabase/tests/run_ledger_tests.sh: migrations 1-3 are applied,
-- LEGACY data is seeded (balance manually edited away from ledger effects),
-- then the opening_balance_ledger migration is applied and asserted.
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- Legacy state (pre-migration schema):
-- ledger effects from transactions only account for +100 (income 300, expense
-- 200), but the user manually edited the balance to 1000 — the drift the
-- opening-balance model must reconcile without losing data.
insert into accounts (name, type, currency) values ('legacy', 'checking', 'USD');
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
select id, 'income', 300, 'USD', 300, 'USD', current_date from accounts where name = 'legacy';
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
select id, 'expense', 200, 'USD', 200, 'USD', current_date from accounts where name = 'legacy';
-- Manual balance edit, possible before the invariant existed:
update accounts set balance = 1000 where name = 'legacy';

select test_assert(balance = 1000, 'legacy balance should be 1000 before migration') from accounts where name = 'legacy';
