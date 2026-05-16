-- recurring_transactions: template for auto-generating transactions on a schedule
create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references accounts(id),
  category_id uuid references categories(id),
  type text not null check (type in ('income','expense')),
  amount numeric not null,
  currency text not null default 'USD',
  description text,
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  interval_value integer not null default 1,
  day_of_month integer,
  start_date date not null default current_date,
  end_date date,
  next_date date not null default current_date,
  is_active boolean not null default true
);

create index if not exists idx_recurring_transactions_user_id on recurring_transactions(user_id);
create index if not exists idx_recurring_transactions_next_date on recurring_transactions(next_date);

alter table recurring_transactions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage their own recurring_transactions' and tablename = 'recurring_transactions') then
    execute 'create policy "Users can manage their own recurring_transactions" on recurring_transactions for all using (auth.uid() = user_id)';
  end if;
end $$;

drop trigger if exists set_updated_at on recurring_transactions;
create trigger set_updated_at before update on recurring_transactions
  for each row execute function update_updated_at_column();

drop trigger if exists set_user_id on recurring_transactions;
create trigger set_user_id before insert on recurring_transactions
  for each row execute function set_user_id();