-- Audit 03 (issue #7): authoritative opening balances and ledger reconciliation.
--
-- Balance model (authoritative, enforced by the database):
--
--   accounts.balance = accounts.opening_balance + account_ledger_effects(accounts.id)
--
--   account_ledger_effects(id) = SUM of signed transaction effects:
--     income/transfer: +amount, expense: -amount
--
-- Semantics:
-- - `opening_balance` is the authoritative, user-owned input: what the account
--   held before this ledger starts. It is the only way to correct a balance.
-- - `balance` is a derived cache. Direct writes are rejected by the
--   enforce_account_balance trigger unless they already satisfy the invariant.
--   Editing `opening_balance` re-derives `balance` in the same statement.
-- - Manual corrections therefore have explicit semantics: to reconcile a
--   disagreeing balance, adjust `opening_balance` by the discrepancy; the
--   balance stays reconstructable as opening_balance + signed ledger effects.
--
-- Backfill (preserves existing data — nothing is guessed):
-- Existing rows have a user-visible `balance` produced by the old incremental
-- trigger plus possible manual edits. We derive each `opening_balance` as
--   opening_balance = existing balance - current ledger effects
-- so every existing balance is preserved bit-for-bit and the invariant holds
-- from the moment this migration commits. Apply it in a deployment window as
-- with any migration; it takes a brief lock on `accounts` and `transactions`.

-- Single definition of the signed ledger effects for an account.
create or replace function account_ledger_effects(p_account_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case when t.type = 'expense' then -t.amount else t.amount end
  ), 0)
  from transactions t
  where t.account_id = p_account_id;
$$;

alter table accounts add column if not exists opening_balance numeric not null default 0;

comment on column accounts.opening_balance is
  'Authoritative user-owned opening balance. balance = opening_balance + signed transaction effects; edit this to correct a balance.';
comment on column accounts.balance is
  'Derived cache: opening_balance + account_ledger_effects(id). Not directly writable (enforced by enforce_account_balance).';

-- Backfill: derive opening balances so the invariant holds while preserving
-- every existing balance exactly. Runs before the enforcing trigger exists.
update accounts a
set opening_balance = a.balance - account_ledger_effects(a.id);

-- Enforce the invariant on accounts writes.
-- The ledger trigger (below) sets app.balance_maintenance = 'on' for its own
-- transaction: deltas are serialized by the account row lock, and re-checking
-- them here would read a stale snapshot mid-statement (an account move is only
-- half-visible to the scan). Client writes through PostgREST cannot set this
-- GUC, so direct balance edits stay rejected. ponytail: GUC-guarded skip;
-- swap for a DEFERRABLE constraint trigger if a bypass via direct SQL ever
-- becomes a real threat model.
create or replace function enforce_account_balance()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    -- New account: no transaction can reference it yet (FK), so effects are 0.
    new.balance := new.opening_balance;
    return new;
  end if;

  -- Opening-balance edits re-derive the balance (the explicit correction path).
  if new.opening_balance is distinct from old.opening_balance
     and new.balance is not distinct from old.balance then
    new.balance := new.opening_balance + account_ledger_effects(new.id);
  end if;

  -- Ledger-triggered writes are maintained by exact deltas; skip the recheck.
  if coalesce(current_setting('app.balance_maintenance', true), '') = 'on' then
    return new;
  end if;

  -- Invariant: the balance is derived and never freely writable.
  if new.balance is distinct from new.opening_balance + account_ledger_effects(new.id) then
    raise exception
      'account balance is derived (opening_balance + transaction effects); update opening_balance instead';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists enforce_account_balance on accounts;
create trigger enforce_account_balance
  before insert or update of balance, opening_balance on accounts
  for each row execute function enforce_account_balance();

-- Replaces 20260511182423's function verbatim except for nothing — the
-- incremental delta arithmetic is kept intentionally: deltas read only OLD/NEW
-- row values, so concurrent transaction writes serialize correctly on the
-- account row lock (a full recompute here would mix a stale statement
-- snapshot with the enforcement trigger's fresh one under READ COMMITTED).
-- ponytail: deltas + enforced invariant; move to per-statement recompute only
-- if a drift case ever shows up in practice.
create or replace function update_account_balance()
returns trigger as $$
declare
  _affected_account_id uuid;
  _affected_user_id uuid;
begin
  -- Mark this transaction as ledger-maintained so enforce_account_balance
  -- skips its recheck for our own delta updates (see comment there).
  perform set_config('app.balance_maintenance', 'on', true);

  if tg_op = 'INSERT' then
    _affected_account_id := new.account_id;
    _affected_user_id := new.user_id;
  elsif tg_op = 'UPDATE' then
    _affected_account_id := new.account_id;
    _affected_user_id := new.user_id;
  elsif tg_op = 'DELETE' then
    _affected_account_id := old.account_id;
    _affected_user_id := old.user_id;
  end if;

  -- Validate that the affected account belongs to the same user as the transaction.
  if not exists (
    select 1 from accounts
    where id = _affected_account_id and user_id = _affected_user_id
  ) then
    raise exception 'Account does not belong to this user';
  end if;

  if tg_op = 'INSERT' then
    if new.type = 'income' or new.type = 'transfer' then
      update accounts set balance = balance + new.amount where id = new.account_id;
    elsif new.type = 'expense' then
      update accounts set balance = balance - new.amount where id = new.account_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.account_id != new.account_id then
      if not exists (
        select 1 from accounts where id = old.account_id and user_id = old.user_id
      ) then
        raise exception 'Account does not belong to this user';
      end if;
    end if;

    if old.type = 'income' or old.type = 'transfer' then
      update accounts set balance = balance - old.amount where id = old.account_id;
    elsif old.type = 'expense' then
      update accounts set balance = balance + old.amount where id = old.account_id;
    end if;

    if new.type = 'income' or new.type = 'transfer' then
      update accounts set balance = balance + new.amount where id = new.account_id;
    elsif new.type = 'expense' then
      update accounts set balance = balance - new.amount where id = new.account_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.type = 'income' or old.type = 'transfer' then
      update accounts set balance = balance - old.amount where id = old.account_id;
    elsif old.type = 'expense' then
      update accounts set balance = balance + old.amount where id = old.account_id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql;
