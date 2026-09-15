-- Assertions after applying 20260916000000_opening_balance_ledger.sql
-- on top of the legacy state seeded by backfill_seed.sql.
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

-- Existing financial data preserved bit-for-bit.
select test_assert(balance = 1000, 'backfill must preserve the existing balance exactly') from accounts where name = 'legacy';

-- Opening balance derived, not guessed: 1000 (preserved balance) - 100 (ledger effects).
select test_assert(opening_balance = 900, 'opening balance should be derived as balance - ledger effects') from accounts where name = 'legacy';

-- The invariant now holds for the legacy account.
select test_assert(
  balance = opening_balance + account_ledger_effects(id),
  'invariant must hold after backfill'
) from accounts where name = 'legacy';

-- Corrections via the explicit path still work on migrated data.
update accounts set opening_balance = 950 where name = 'legacy';
select test_assert(balance = 1050, 'opening-balance correction should re-derive balance') from accounts where name = 'legacy';
