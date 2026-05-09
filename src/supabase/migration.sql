create extension if not exists "uuid-ossp";

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- accounts
create table accounts (
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
create policy "Users can manage their own accounts" on accounts
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on accounts
  for each row execute function update_updated_at_column();

-- categories
create table categories (
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
create policy "Users can manage their own categories" on categories
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on categories
  for each row execute function update_updated_at_column();

-- transactions
create table transactions (
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

create index idx_transactions_account_id on transactions(account_id);
create index idx_transactions_category_id on transactions(category_id);
create index idx_transactions_type on transactions(type);
create index idx_transactions_date on transactions(date);

alter table transactions enable row level security;
create policy "Users can manage their own transactions" on transactions
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on transactions
  for each row execute function update_updated_at_column();

-- budgets
create table budgets (
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

create index idx_budgets_period on budgets(period);

alter table budgets enable row level security;
create policy "Users can manage their own budgets" on budgets
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on budgets
  for each row execute function update_updated_at_column();

-- exchange_rates
create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  date date not null
);

create unique index idx_exchange_rates_user_currency_date
  on exchange_rates(user_id, from_currency, to_currency, date);

alter table exchange_rates enable row level security;
create policy "Users can manage their own exchange_rates" on exchange_rates
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on exchange_rates
  for each row execute function update_updated_at_column();

-- investment_plans
create table investment_plans (
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

create index idx_investment_plans_type on investment_plans(type);

alter table investment_plans enable row level security;
create policy "Users can manage their own investment_plans" on investment_plans
  for all using (auth.uid() = user_id);
create trigger set_updated_at before update on investment_plans
  for each row execute function update_updated_at_column();
