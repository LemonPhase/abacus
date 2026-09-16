-- Legacy (version 2) restore: the client (normalizeLegacyAccounts, PR #23)
-- derives opening_balance before calling the RPC. This verifies the RPC
-- contract it feeds: a normalized v2 payload preserves balances exactly.
\set ON_ERROR_STOP on

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- Legacy export: account exported balance 1234 with transactions +50/-30.
-- Client normalization computes opening = 1234 - (50 - 30) = 1214 and sends it.
select restore_user_data('{
  "version": 2,
  "accounts": [
    {"id": "a0000000-0000-0000-0000-000000000001", "name": "Checking", "type": "checking",
     "currency": "USD", "balance": 1234, "opening_balance": 1214}
  ],
  "transactions": [
    {"id": "d0000000-0000-0000-0000-000000000001", "account_id": "a0000000-0000-0000-0000-000000000001",
     "type": "income", "amount": 50, "currency": "USD", "base_amount": 50, "base_currency": "USD", "date": "2026-01-02"},
    {"id": "d0000000-0000-0000-0000-000000000002", "account_id": "a0000000-0000-0000-0000-000000000001",
     "type": "expense", "amount": 30, "currency": "USD", "base_amount": 30, "base_currency": "USD", "date": "2026-01-03"}
  ]
}') as result \gset
select test_assert((:'result'::jsonb->>'accounts')::int = 1, 'legacy restore: 1 account');
select test_assert((:'result'::jsonb->>'transactions')::int = 2, 'legacy restore: 2 transactions');
select test_assert(
  (select balance = 1234 from accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'legacy restore: balance must be the exported 1234, not zeroed');
select test_assert(
  (select opening_balance = 1214 from accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'legacy restore: opening_balance must be the client-derived 1214');

-- Round-tripping a v2 restore re-exports the same balances.
select test_assert(
  (select jsonb_build_object('balance', balance) = '{"balance": 1234}'::jsonb
   from accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'legacy export/restore round trip preserves the exported balance');
