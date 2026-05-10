-- Extension for gen_random_uuid()
create extension if not exists "uuid-ossp";

-- Trigger: auto-update updated_at on row change
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger: auto-populate user_id from auth.uid() on insert
create or replace function set_user_id()
returns trigger as $$
begin
  new.user_id = auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- accounts
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('checking','savings','investment','credit','cash')),
  currency text not null default 'USD',
  balance numeric not null default 0,
  notes text
);

alter table accounts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own accounts' and tablename = 'accounts') then
    execute 'create policy "Users can manage their own accounts" on accounts for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on accounts;
create trigger set_updated_at before update on accounts
  for each row execute function update_updated_at_column();

create or replace function update_account_balance()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'income' or new.type = 'transfer' then
      update accounts set balance = balance + new.amount where id = new.account_id;
    elsif new.type = 'expense' then
      update accounts set balance = balance - new.amount where id = new.account_id;
    end if;
  elsif tg_op = 'UPDATE' then
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

drop trigger if exists set_user_id on accounts;
create trigger set_user_id before insert on accounts
  for each row execute function set_user_id();

-- categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('income','expense')),
  parent_id uuid references categories(id),
  color text not null,
  icon text
);

alter table categories enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own categories' and tablename = 'categories') then
    execute 'create policy "Users can manage their own categories" on categories for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on categories;
create trigger set_updated_at before update on categories
  for each row execute function update_updated_at_column();

drop trigger if exists set_user_id on categories;
create trigger set_user_id before insert on categories
  for each row execute function set_user_id();

-- transactions
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references accounts(id),
  category_id uuid references categories(id),
  type text not null check (type in ('income','expense','transfer')),
  amount numeric not null,
  currency text not null,
  base_amount numeric not null,
  base_currency text not null,
  date date not null,
  description text,
  correlative_id uuid
);

create index if not exists idx_transactions_account_id on transactions(account_id);
create index if not exists idx_transactions_category_id on transactions(category_id);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_date on transactions(date);

alter table transactions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own transactions' and tablename = 'transactions') then
    execute 'create policy "Users can manage their own transactions" on transactions for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on transactions;
create trigger set_updated_at before update on transactions
  for each row execute function update_updated_at_column();

drop trigger if exists maintain_account_balance on transactions;
create trigger maintain_account_balance
  after insert or update or delete on transactions
  for each row execute function update_account_balance();

drop trigger if exists set_user_id on transactions;
create trigger set_user_id before insert on transactions
  for each row execute function set_user_id();

-- budgets
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category_ids uuid[] not null default '{}',
  name text not null,
  amount numeric not null,
  period text not null check (period in ('monthly','yearly')),
  start_date date not null default current_date
);

create index if not exists idx_budgets_period on budgets(period);

alter table budgets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own budgets' and tablename = 'budgets') then
    execute 'create policy "Users can manage their own budgets" on budgets for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on budgets;
create trigger set_updated_at before update on budgets
  for each row execute function update_updated_at_column();

drop trigger if exists set_user_id on budgets;
create trigger set_user_id before insert on budgets
  for each row execute function set_user_id();

-- exchange_rates
create table if not exists exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  date date not null
);

create unique index if not exists idx_exchange_rates_user_currency_date
  on exchange_rates(user_id, from_currency, to_currency, date);

alter table exchange_rates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own exchange_rates' and tablename = 'exchange_rates') then
    execute 'create policy "Users can manage their own exchange_rates" on exchange_rates for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on exchange_rates;
create trigger set_updated_at before update on exchange_rates
  for each row execute function update_updated_at_column();

drop trigger if exists set_user_id on exchange_rates;
create trigger set_user_id before insert on exchange_rates
  for each row execute function set_user_id();

-- investment_plans
create table if not exists investment_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('fixed_income','index_fund','stock','real_estate','cash','crypto','other')),
  initial_amount numeric not null default 0,
  monthly_contribution numeric not null default 0,
  annual_return_rate numeric not null default 0,
  currency text not null default 'USD',
  notes text
);

create index if not exists idx_investment_plans_type on investment_plans(type);

alter table investment_plans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own investment_plans' and tablename = 'investment_plans') then
    execute 'create policy "Users can manage their own investment_plans" on investment_plans for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on investment_plans;
create trigger set_updated_at before update on investment_plans
  for each row execute function update_updated_at_column();

drop trigger if exists set_user_id on investment_plans;
create trigger set_user_id before insert on investment_plans
  for each row execute function set_user_id();
