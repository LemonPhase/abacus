-- Audit 05 (issue #9): atomic transfer create / edit / delete.
--
-- A transfer is a pair of transaction rows: an outgoing leg (amount < 0,
-- source account) and an incoming leg (amount > 0, destination account,
-- converted amount). Historically the two legs and their correlative_id
-- linkage were written from the client as three independent requests; a
-- failure between them left a dangling credit. All transfer mutations now go
-- through security definer RPCs that perform the whole operation in a single
-- transaction, verify ownership of BOTH accounts, and are safe to retry.
--
-- Stable transfer identifier: `transactions.transfer_id` tags both legs of a
-- pair with the same value. The client passes that same value (generated once
-- per logical operation) as the RPC's idempotency key, so a retry after a
-- lost response returns the committed pair instead of creating a duplicate.
--
-- Complete paired legs are enforced for every writer (not just the RPCs) by
-- two partial unique indexes: at most one outgoing and one incoming leg per
-- transfer_id. Legacy mutual correlative pairs are backfilled with a group id
-- so the RPCs can manage them; one-sided legacy leftovers stay untagged and
-- keep working through the plain row paths.

alter table transactions add column if not exists transfer_id uuid;

-- Backfill: give each complete legacy pair (mutual correlative_id, opposite
-- signs) a stable group id. Rows are visited once per pair via distinct (lo, hi).
with pairs as (
  select distinct least(t.id, t.correlative_id) as lo,
         greatest(t.id, t.correlative_id) as hi
  from transactions t
  where t.type = 'transfer'
    and t.correlative_id is not null
    and exists (
      select 1 from transactions c
      where c.id = t.correlative_id
        and c.correlative_id = t.id
        and c.type = 'transfer'
        and t.amount * c.amount < 0
    )
),
tagged as (
  select lo, hi, gen_random_uuid() as gid from pairs
)
update transactions x
set transfer_id = t.gid
from tagged t
where x.id in (t.lo, t.hi);

create index if not exists idx_transactions_transfer_id
  on transactions(transfer_id) where transfer_id is not null;

-- Enforce complete paired legs: exactly one outgoing (+) and one incoming (-)
-- leg per transfer id, for any writer.
create unique index if not exists idx_transactions_transfer_out_leg
  on transactions(transfer_id) where transfer_id is not null and amount < 0;
create unique index if not exists idx_transactions_transfer_in_leg
  on transactions(transfer_id) where transfer_id is not null and amount > 0;

-- A zero-amount leg is neither an out nor an in leg; reject new ones. NOT
-- VALID: enforced for new writes without scanning/validating legacy data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_transfer_amount_nonzero'
      and conrelid = 'transactions'::regclass
  ) then
    alter table transactions
      add constraint transactions_transfer_amount_nonzero
      check (type <> 'transfer' or amount <> 0) not valid;
  end if;
end $$;

-- Shared guard: fetch an account and require it to belong to the caller.
-- Security definer so the ownership check cannot be bypassed by RLS gaps;
-- EXECUTE is revoked (below) — only the transfer RPCs call it internally.
create or replace function assert_owned_account(p_account_id uuid, p_user_id uuid)
returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.accounts;
begin
  select * into v_account from public.accounts where id = p_account_id;
  if v_account.id is null then
    raise exception 'account % not found', p_account_id;
  end if;
  if v_account.user_id is distinct from p_user_id then
    raise exception 'account % does not belong to the caller', p_account_id;
  end if;
  return v_account;
end;
$$;

-- Create a transfer pair atomically.
--
-- Amounts are positive magnitudes: the outgoing leg is stored as -p_amount
-- (source currency), the incoming leg as +p_converted_amount (destination
-- currency, client-complied exchange conversion). Currencies are read from
-- the accounts table, never trusted from the client.
--
-- Idempotency: p_idempotency_key doubles as the pair's transfer_id. If the
-- pair already exists (retry after a lost response, or a concurrent call with
-- the same key), the committed rows are returned unchanged — never duplicated.
--
-- p_out_transaction_id optionally converts an existing row (a non-transfer
-- being edited into a transfer, or a legacy unlinked leg) into the outgoing
-- leg instead of inserting a new one.
create or replace function create_transfer(
  p_idempotency_key uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_converted_amount numeric,
  p_category_id uuid default null,
  p_date date default current_date,
  p_description text default null,
  p_out_transaction_id uuid default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_out public.transactions;
  v_in_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_converted_amount is null or p_converted_amount <= 0 then
    raise exception 'transfer amounts must be positive';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'source and destination accounts must differ';
  end if;

  v_from := public.assert_owned_account(p_from_account_id, v_user);
  v_to := public.assert_owned_account(p_to_account_id, v_user);

  -- Idempotent retry: the pair for this key already committed.
  if exists (
    select 1 from public.transactions
    where transfer_id = p_idempotency_key and user_id = v_user
  ) then
    return query
      select * from public.transactions
      where transfer_id = p_idempotency_key and user_id = v_user
      order by amount;
    return;
  end if;

  -- Lock both accounts up front in deterministic (id) order. The balance
  -- trigger locks account rows as it applies deltas; concurrent opposite
  -- transfers (A→B racing B→A) would otherwise lock in opposite orders and
  -- deadlock.
  perform 1 from public.accounts
  where id in (v_from.id, v_to.id)
  order by id
  for update;

  begin
    if p_out_transaction_id is not null then
      select * into v_out from public.transactions
      where id = p_out_transaction_id
      for update;
      if v_out.id is null or v_out.user_id is distinct from v_user then
        raise exception 'transaction % not found or not owned by caller', p_out_transaction_id;
      end if;
      if v_out.transfer_id is not null and v_out.transfer_id <> p_idempotency_key then
        raise exception 'transaction already belongs to another transfer';
      end if;

      update public.transactions set
        account_id = v_from.id,
        category_id = p_category_id,
        type = 'transfer',
        amount = -p_amount,
        currency = v_from.currency,
        base_amount = -p_amount,
        base_currency = v_from.currency,
        date = p_date,
        description = p_description,
        transfer_id = p_idempotency_key,
        correlative_id = null
      where id = v_out.id
      returning * into v_out;
    else
      insert into public.transactions
        (user_id, account_id, category_id, type, amount, currency, base_amount, base_currency,
         date, description, transfer_id)
      values
        (v_user, v_from.id, p_category_id, 'transfer', -p_amount, v_from.currency, -p_amount,
         v_from.currency, p_date, p_description, p_idempotency_key)
      returning * into v_out;
    end if;

    insert into public.transactions
      (user_id, account_id, category_id, type, amount, currency, base_amount, base_currency,
       date, description, transfer_id, correlative_id)
    values
      (v_user, v_to.id, p_category_id, 'transfer', p_converted_amount, v_to.currency,
       p_converted_amount, v_to.currency, p_date, p_description, p_idempotency_key, v_out.id)
    returning id into v_in_id;

    update public.transactions set correlative_id = v_in_id where id = v_out.id;
  exception
    when unique_violation then
      -- A concurrent call committed this key first; its transaction (any
      -- partial work of ours included) is rolled back by the handler. Return
      -- the winner's pair — the operation is still applied exactly once.
      return query
        select * from public.transactions
        where transfer_id = p_idempotency_key and user_id = v_user
        order by amount;
      if not found then
        raise;
      end if;
      return;
  end;

  return query
    select * from public.transactions
    where id in (v_out.id, v_in_id)
    order by amount;
end;
$$;

-- Edit both legs of an existing transfer pair atomically. The outgoing leg is
-- re-pointed at p_from_account_id with -p_amount, the incoming leg at
-- p_to_account_id with +p_converted_amount; shared fields apply to both.
create or replace function edit_transfer(
  p_transfer_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_converted_amount numeric,
  p_category_id uuid default null,
  p_date date default current_date,
  p_description text default null
)
returns setof public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_from public.accounts;
  v_to public.accounts;
  v_out public.transactions;
  v_in public.transactions;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_transfer_id is null then
    raise exception 'transfer id is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_converted_amount is null or p_converted_amount <= 0 then
    raise exception 'transfer amounts must be positive';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception 'source and destination accounts must differ';
  end if;

  v_from := public.assert_owned_account(p_from_account_id, v_user);
  v_to := public.assert_owned_account(p_to_account_id, v_user);

  perform 1 from public.accounts
  where id in (v_from.id, v_to.id)
  order by id
  for update;

  select * into v_out from public.transactions
  where transfer_id = p_transfer_id and user_id = v_user and amount < 0
  for update;
  select * into v_in from public.transactions
  where transfer_id = p_transfer_id and user_id = v_user and amount > 0
  for update;
  if v_out.id is null or v_in.id is null then
    raise exception 'transfer % not found or incomplete', p_transfer_id;
  end if;

  update public.transactions set
    account_id = v_from.id,
    category_id = p_category_id,
    amount = -p_amount,
    currency = v_from.currency,
    base_amount = -p_amount,
    base_currency = v_from.currency,
    date = p_date,
    description = p_description
  where id = v_out.id;

  update public.transactions set
    account_id = v_to.id,
    category_id = p_category_id,
    amount = p_converted_amount,
    currency = v_to.currency,
    base_amount = p_converted_amount,
    base_currency = v_to.currency,
    date = p_date,
    description = p_description
  where id = v_in.id;

  return query
    select * from public.transactions
    where id in (v_out.id, v_in.id)
    order by amount;
end;
$$;

-- Delete both legs of a transfer pair atomically. Missing id is a no-op so a
-- retried delete converges.
create or replace function delete_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_transfer_id is null then
    return;
  end if;

  perform 1 from public.accounts
  where id in (
    select account_id from public.transactions
    where transfer_id = p_transfer_id and user_id = v_user
  )
  order by id
  for update;

  delete from public.transactions
  where transfer_id = p_transfer_id and user_id = v_user;
end;
$$;

-- Convert a transfer leg back into a plain income/expense row: the partner
-- leg(s) are deleted and the row itself is rewritten in the same transaction.
create or replace function convert_transfer_to_plain(
  p_transaction_id uuid,
  p_new_type text,
  p_amount numeric,
  p_new_account_id uuid,
  p_category_id uuid default null,
  p_date date default current_date,
  p_description text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tx public.transactions;
  v_account public.accounts;
  v_partner_ids uuid[] := '{}';
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_new_type not in ('income', 'expense') then
    raise exception 'type must be income or expense';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  v_account := public.assert_owned_account(p_new_account_id, v_user);

  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null or v_tx.user_id is distinct from v_user then
    raise exception 'transaction % not found or not owned by caller', p_transaction_id;
  end if;
  if v_tx.type <> 'transfer' then
    raise exception 'transaction % is not a transfer', p_transaction_id;
  end if;

  if v_tx.transfer_id is not null then
    select coalesce(array_agg(id), '{}') into v_partner_ids
    from public.transactions
    where transfer_id = v_tx.transfer_id and id <> v_tx.id and user_id = v_user;
  elsif v_tx.correlative_id is not null then
    select coalesce(array_agg(id), '{}') into v_partner_ids
    from public.transactions
    where id = v_tx.correlative_id and user_id = v_user;
  end if;

  perform 1 from public.accounts
  where id in (
    select account_id from public.transactions where id = any(v_partner_ids)
    union select v_account.id
  )
  order by id
  for update;

  delete from public.transactions where id = any(v_partner_ids);

  update public.transactions set
    type = p_new_type,
    amount = p_amount,
    account_id = v_account.id,
    currency = v_account.currency,
    base_amount = p_amount,
    base_currency = v_account.currency,
    category_id = p_category_id,
    date = p_date,
    description = p_description,
    transfer_id = null,
    correlative_id = null
  where id = v_tx.id
  returning * into v_tx;

  return v_tx;
end;
$$;

-- The transfer RPCs are for signed-in users only; the helper must never be
-- callable directly (it returns account rows for a caller-supplied user id).
revoke execute on function assert_owned_account(uuid, uuid) from public;
revoke execute on function create_transfer(uuid, uuid, uuid, numeric, numeric, uuid, date, text, uuid) from public, anon;
revoke execute on function edit_transfer(uuid, uuid, uuid, numeric, numeric, uuid, date, text) from public, anon;
revoke execute on function delete_transfer(uuid) from public, anon;
revoke execute on function convert_transfer_to_plain(uuid, text, numeric, uuid, uuid, date, text) from public, anon;
grant execute on function create_transfer(uuid, uuid, uuid, numeric, numeric, uuid, date, text, uuid) to authenticated, service_role;
grant execute on function edit_transfer(uuid, uuid, uuid, numeric, numeric, uuid, date, text) to authenticated, service_role;
grant execute on function delete_transfer(uuid) to authenticated, service_role;
grant execute on function convert_transfer_to_plain(uuid, text, numeric, uuid, uuid, date, text) to authenticated, service_role;
