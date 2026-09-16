-- Atomic transfer RPC semantics against real PostgreSQL.
-- Run by supabase/tests/run_transfer_tests.sh with all migrations applied
-- and a stub auth schema installed. Exits non-zero on the first failure
-- (\set ON_ERROR_STOP + test_assert).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values ('11111111-1111-1111-1111-111111111111');
insert into auth.users values ('22222222-2222-2222-2222-222222222222');
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (name, type, currency, opening_balance)
values ('checking', 'checking', 'USD', 1000) returning id as src_id \gset
insert into accounts (name, type, currency, opening_balance)
values ('savings', 'savings', 'EUR', 500) returning id as dst_id \gset
insert into accounts (name, type, currency, opening_balance)
values ('foreign', 'checking', 'USD', 10) returning id as foreign_id \gset
update accounts set user_id = '22222222-2222-2222-2222-222222222222' where id = :'foreign_id';

create temp table transfer_legs as
  select * from transactions where false;

-- Provenance params simulate the client store (transactionsStore.computeBase):
-- the reporting currency is USD, out legs (USD) are identity conversions, and
-- in legs (EUR) use a EUR→USD quote of 2.0 recorded with fx_rate/fx_date.
-- A leg with no available rate is passed with its own amount/currency and
-- base_amount_stale = true — the RPC stores provenance verbatim, never 1:1.

-- ===== 1. create_transfer: pair, linkage, balances, provenance =====
insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000001', :'src_id', :'dst_id',
  100, 90, null, current_date, 'first transfer',
  null,
  -100, 'USD', null, null, false,
  180, 'USD', 2, current_date, false);
select count(*) as n,
       min(amount) as out_amt, max(amount) as in_amt,
       count(*) filter (where correlative_id is not null) as linked
from transfer_legs \gset
select test_assert(:'n' = 2, 'create_transfer should produce exactly two legs');
select test_assert(:'out_amt' = -100, 'outgoing leg must be -amount');
select test_assert(:'in_amt' = 90, 'incoming leg must be +converted');
select test_assert(:'linked' = 2, 'both legs must cross-link via correlative_id');
select test_assert(
  (select currency from transfer_legs where amount < 0) = 'USD'
  and (select currency from transfer_legs where amount > 0) = 'EUR',
  'currencies must come from the accounts, not the client');
select test_assert(
  (select base_amount from transfer_legs where amount < 0) = -100
  and (select base_currency from transfer_legs where amount < 0) = 'USD'
  and (select fx_rate from transfer_legs where amount < 0) is null
  and (select fx_date from transfer_legs where amount < 0) is null
  and (select base_amount_stale from transfer_legs where amount < 0) = false,
  'out leg stores the client-computed identity provenance');
select test_assert(
  (select base_amount from transfer_legs where amount > 0) = 180
  and (select base_currency from transfer_legs where amount > 0) = 'USD'
  and (select fx_rate from transfer_legs where amount > 0) = 2
  and (select fx_date from transfer_legs where amount > 0) = current_date
  and (select base_amount_stale from transfer_legs where amount > 0) = false,
  'in leg stores the client-computed FX provenance');
select test_assert(
  (select balance from accounts where id = :'src_id') = 900,
  'source balance 1000 -> 900 after transfer out of 100');
select test_assert(
  (select balance from accounts where id = :'dst_id') = 590,
  'destination balance 500 -> 590 after transfer in of 90');
select test_assert(
  (select balance from accounts where id = :'src_id')
    = (select opening_balance from accounts where id = :'src_id') + account_ledger_effects(:'src_id')
  and (select balance from accounts where id = :'dst_id')
    = (select opening_balance from accounts where id = :'dst_id') + account_ledger_effects(:'dst_id'),
  'balance invariant holds on both accounts after create');
delete from transfer_legs;

-- ===== 2. Idempotent retry: same key returns the committed pair =====
insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000001', :'src_id', :'dst_id', 100, 90,
  null, current_date, null, null,
  -100, 'USD', null, null, false, 180, 'USD', 2, current_date, false);
select count(*) as retry_n from transfer_legs \gset
select test_assert(:'retry_n' = 2, 'retry with same key must not duplicate legs');
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 2,
  'retry must leave exactly the original pair in the table');
select test_assert(
  (select balance from accounts where id = :'src_id') = 900,
  'retry must not double-apply the balance effect');
delete from transfer_legs;

-- ===== 3. edit_transfer: re-point accounts and amounts atomically =====
insert into transfer_legs
select * from edit_transfer(
  'aaaaaaaa-0000-0000-0000-000000000001', :'dst_id', :'src_id', 40, 41,
  null, current_date, null,
  -40, 'EUR', 2, current_date, false,
  82, 'USD', null, null, false);
select min(amount) as e_out, max(amount) as e_in from transfer_legs \gset
select test_assert(:'e_out' = -40 and :'e_in' = 41, 'edit must rewrite legs to -40 / +41');
select test_assert(
  (select base_amount from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount < 0) = -40
  and (select fx_rate from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount < 0) = 2
  and (select base_amount from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount > 0) = 82,
  'edit must store the fresh per-leg provenance');
select test_assert(
  (select account_id from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount < 0) = :'dst_id'
  and (select account_id from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001' and amount > 0) = :'src_id',
  'edit must move the legs onto the new accounts');
select test_assert(
  (select balance from accounts where id = :'src_id') = 1041
  and (select balance from accounts where id = :'dst_id') = 460,
  'balances after edit: src 1041 (1000+41 incoming), dst 460 (500-40 outgoing)');
select test_assert(
  (select balance from accounts where id = :'src_id')
    = (select opening_balance from accounts where id = :'src_id') + account_ledger_effects(:'src_id')
  and (select balance from accounts where id = :'dst_id')
    = (select opening_balance from accounts where id = :'dst_id') + account_ledger_effects(:'dst_id'),
  'balance invariant holds on both accounts after edit');
delete from transfer_legs;

-- ===== 4. delete_transfer removes the whole pair and restores balances =====
select delete_transfer('aaaaaaaa-0000-0000-0000-000000000001') as deleted \gset
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'delete must remove both legs');
select test_assert(
  (select balance from accounts where id = :'src_id') = 1000
  and (select balance from accounts where id = :'dst_id') = 500,
  'balances restored after delete');
select delete_transfer('aaaaaaaa-0000-0000-0000-000000000001') as retried \gset
select test_assert(true, 'retried delete of a missing pair is a no-op');

-- ===== 5. Anchored create: an existing row becomes the outgoing leg =====
insert into transactions (account_id, type, amount, currency, base_amount, base_currency, date)
values (:'src_id', 'expense', 60, 'USD', 60, 'USD', current_date)
returning id as anchor_id \gset
select test_assert((select balance from accounts where id = :'src_id') = 940, 'expense 60 applied');

insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000002', :'src_id', :'dst_id',
  60, 55, null, current_date, 'anchored', :'anchor_id',
  -60, 'USD', null, null, false,
  110, 'USD', 2, current_date, false);
select count(*) as anchored_n from transfer_legs \gset
select test_assert(:'anchored_n' = 2, 'anchored create returns both legs');
select test_assert(
  (select amount from transactions where id = :'anchor_id') = -60
  and (select type from transactions where id = :'anchor_id') = 'transfer'
  and (select transfer_id from transactions where id = :'anchor_id') = 'aaaaaaaa-0000-0000-0000-000000000002'
  and (select base_amount from transactions where id = :'anchor_id') = -60
  and (select base_amount_stale from transactions where id = :'anchor_id') = false,
  'anchor row must become the outgoing leg of the new pair with fresh provenance');
select test_assert(
  (select balance from accounts where id = :'src_id') = 940
  and (select balance from accounts where id = :'dst_id') = 555,
  'balances after anchored create: src 940, dst 555');
select test_assert(
  (select count(*) from transactions where account_id = :'src_id' and type = 'expense') = 0,
  'anchor row must no longer be an expense');
delete from transfer_legs;

-- ===== 6. convert_transfer_to_plain: partner deleted, row rewritten =====
select convert_transfer_to_plain(
  :'anchor_id', 'income', 75, :'src_id', null, current_date, 'refunded',
  75, 'USD', null, null, false
) as converted_id \gset
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0,
  'convert must clear the transfer group');
select test_assert(
  (select type from transactions where id = :'anchor_id') = 'income'
  and (select amount from transactions where id = :'anchor_id') = 75
  and (select currency from transactions where id = :'anchor_id') = 'USD'
  and (select base_amount from transactions where id = :'anchor_id') = 75
  and (select base_amount_stale from transactions where id = :'anchor_id') = false,
  'converted row must be a plain 75 USD income with identity provenance');
select test_assert(
  (select balance from accounts where id = :'src_id') = 1075
  and (select balance from accounts where id = :'dst_id') = 500,
  'balances after convert: src 1075 (940+75+partner reversal), dst 500');

-- ===== 7. Stale provenance: a leg without an available rate is kept as-is =====
delete from transfer_legs;
insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000007', :'src_id', :'dst_id',
  10, 9, null, current_date, 'no rate available', null,
  -10, 'USD', null, null, false,
  9, 'EUR', null, null, true);
select test_assert(
  (select base_amount from transfer_legs where amount > 0) = 9
  and (select base_currency from transfer_legs where amount > 0) = 'EUR'
  and (select fx_rate from transfer_legs where amount > 0) is null
  and (select base_amount_stale from transfer_legs where amount > 0) = true,
  'in leg with no available rate must keep its own amount/currency, flagged stale');
select test_assert(
  (select base_amount from transfer_legs where amount < 0) = -10
  and (select base_amount_stale from transfer_legs where amount < 0) = false,
  'out leg provenance is unaffected by the stale partner');
delete from transfer_legs;
select delete_transfer('aaaaaaaa-0000-0000-0000-000000000007') as stale_deleted \gset

-- ===== 8. Validation and ownership failures leave nothing behind =====
do $$
begin
  -- Foreign destination account.
  perform create_transfer(
    'aaaaaaaa-0000-0000-0000-000000000003',
    (select id from accounts where name = 'checking'),
    (select id from accounts where name = 'foreign'),
    10, 10, null, current_date, null, null,
    -10, 'USD', null, null, false, 10, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: foreign destination must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
do $$
begin
  -- Foreign source account.
  perform create_transfer(
    'aaaaaaaa-0000-0000-0000-000000000003',
    (select id from accounts where name = 'foreign'),
    (select id from accounts where name = 'checking'),
    10, 10, null, current_date, null, null,
    -10, 'USD', null, null, false, 10, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: foreign source must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
do $$
begin
  perform create_transfer(
    'aaaaaaaa-0000-0000-0000-000000000003',
    (select id from accounts where name = 'checking'),
    (select id from accounts where name = 'checking'),
    10, 10, null, current_date, null, null,
    -10, 'USD', null, null, false, 10, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: same-account transfer must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
do $$
begin
  perform create_transfer(
    'aaaaaaaa-0000-0000-0000-000000000003',
    (select id from accounts where name = 'checking'),
    (select id from accounts where name = 'savings'),
    0, 10, null, current_date, null, null,
    -10, 'USD', null, null, false, 10, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: zero amount must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000003') = 0,
  'failed creates must leave no legs behind');
select test_assert(
  (select balance from accounts where id = :'src_id') = 1075
  and (select balance from accounts where id = :'dst_id') = 500,
  'failed creates must not move any balance');

-- ===== 9. Cross-user isolation on existing pairs =====
insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000004', :'src_id', :'dst_id', 10, 9,
  null, current_date, null, null,
  -10, 'USD', null, null, false, 18, 'USD', 2, current_date, false);
delete from transfer_legs;
do $$
begin
  set app.test_user_id = '22222222-2222-2222-2222-222222222222';
  perform edit_transfer(
    'aaaaaaaa-0000-0000-0000-000000000004',
    (select id from accounts where name = 'checking'),
    (select id from accounts where name = 'savings'), 5, 5,
    null, current_date, null,
    -5, 'USD', null, null, false, 5, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: foreign edit must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
do $$
begin
  set app.test_user_id = '22222222-2222-2222-2222-222222222222';
  perform delete_transfer('aaaaaaaa-0000-0000-0000-000000000004');
end $$;
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000004') = 2,
  'another user cannot delete my pair (their delete is a no-op)');
do $$
begin
  set app.test_user_id = '22222222-2222-2222-2222-222222222222';
  perform convert_transfer_to_plain(
    (select id from transactions where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000004' limit 1),
    'expense', 5,
    (select id from accounts where name = 'foreign'),
    null, current_date, null,
    5, 'USD', null, null, false);
  raise exception 'ASSERT FAILED: foreign convert must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- ===== 10. Anchored create refuses a row already owned by another pair =====
do $$
begin
  perform create_transfer(
    'aaaaaaaa-0000-0000-0000-000000000005',
    (select id from accounts where name = 'checking'),
    (select id from accounts where name = 'savings'),
    3, 3, null, current_date, 'steal attempt',
    (select id from transactions where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000004' limit 1),
    -3, 'USD', null, null, false, 6, 'USD', 2, current_date, false);
  raise exception 'ASSERT FAILED: stealing a paired row must be rejected';
exception
  when others then
    if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
end $$;
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000005') = 0,
  'rejected anchor-steal leaves no partial pair');

-- ===== 11. Paired-leg enforcement applies to direct SQL too =====
do $$
begin
  insert into transactions (user_id, account_id, type, amount, currency, base_amount, base_currency, date, transfer_id)
  values (
    '11111111-1111-1111-1111-111111111111',
    (select id from accounts where name = 'checking'),
    'transfer', -7, 'USD', -7, 'USD', current_date,
    'aaaaaaaa-0000-0000-0000-000000000004'); -- already has a negative leg
  raise exception 'ASSERT FAILED: second outgoing leg must violate the unique index';
exception
  when unique_violation then null;
end $$;

-- ===== 12. Atomicity: a caller rollback discards everything =====
begin;
insert into transfer_legs
select * from create_transfer(
  'aaaaaaaa-0000-0000-0000-000000000006', :'src_id', :'dst_id', 500, 490,
  null, current_date, null, null,
  -500, 'USD', null, null, false, 980, 'USD', 2, current_date, false);
select count(*) as in_txn from transfer_legs \gset
select test_assert(:'in_txn' = 2, 'pair visible inside the caller transaction');
rollback;
select test_assert(
  (select count(*) from transactions
    where transfer_id = 'aaaaaaaa-0000-0000-0000-000000000006') = 0,
  'caller rollback must discard the whole pair');
select test_assert(
  (select balance from accounts where id = :'src_id') = 1065,
  'caller rollback must not leave a balance delta');

-- ===== 13. Legacy backfill: mutual correlative pairs gained a stable id =====
insert into transactions (user_id, account_id, type, amount, currency, base_amount, base_currency, date, correlative_id)
values
  ('11111111-1111-1111-1111-111111111111', :'src_id', 'transfer', -20, 'USD', -20, 'USD', current_date, null)
returning id as legacy_out \gset
insert into transactions (user_id, account_id, type, amount, currency, base_amount, base_currency, date, correlative_id)
values ('11111111-1111-1111-1111-111111111111', :'src_id', 'transfer', 20, 'USD', 20, 'USD', current_date, :'legacy_out')
returning id as legacy_in \gset
update transactions set correlative_id = :'legacy_in' where id = :'legacy_out';
-- Re-run the migration's backfill statement body against current data.
with pairs as (
  select distinct least(t.id, t.correlative_id) as lo,
         greatest(t.id, t.correlative_id) as hi
  from transactions t
  where t.type = 'transfer'
    and t.correlative_id is not null
    and t.transfer_id is null
    and exists (
      select 1 from transactions c
      where c.id = t.correlative_id
        and c.correlative_id = t.id
        and c.type = 'transfer'
        and t.amount * c.amount < 0
    )
),
tagged as (select lo, hi, gen_random_uuid() as gid from pairs)
update transactions x set transfer_id = t.gid
from tagged t where x.id in (t.lo, t.hi);
select test_assert(
  (select transfer_id from transactions where id = :'legacy_out') is not null
  and (select transfer_id from transactions where id = :'legacy_out')
    = (select transfer_id from transactions where id = :'legacy_in'),
  'legacy mutual pair must share one transfer_id after backfill');
-- And the RPCs manage it: delete both legs of the legacy pair.
select delete_transfer(
  (select transfer_id from transactions where id = :'legacy_out')) as legacy_deleted \gset
select test_assert(
  (select count(*) from transactions where id in (:'legacy_out', :'legacy_in')) = 0,
  'delete_transfer removes a backfilled legacy pair');

select test_assert(
  (select balance from accounts where id = :'src_id')
    = (select opening_balance from accounts where id = :'src_id') + account_ledger_effects(:'src_id')
  and (select balance from accounts where id = :'dst_id')
    = (select opening_balance from accounts where id = :'dst_id') + account_ledger_effects(:'dst_id'),
  'final balance invariant check');
