-- Add ownership validation to update_account_balance()
-- Ensures transactions can only affect accounts owned by the same user.
create or replace function update_account_balance()
returns trigger as $$
declare
  _affected_account_id uuid;
  _affected_user_id uuid;
begin
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
