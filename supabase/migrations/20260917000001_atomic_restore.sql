-- Audit 04 (issue #8): atomic, validating JSON restore.
--
-- Replaces the client's delete-then-insert-via-independent-requests flow
-- (concurrent FK races, partial commits, double-applied balances) with one
-- security definer RPC that runs in a single implicit transaction:
--
--   1. Validate the full versioned payload BEFORE touching data: version,
--      shape, row structure, ownership (every user_id must be auth.uid()),
--      and all relationships (references must resolve inside the payload,
--      because everything outside it is about to be deleted).
--   2. Delete the caller's rows in FK-safe order, then insert in dependency
--      order. Any error at any point aborts the transaction: the database is
--      left exactly as it was.
--   3. Balances are preserved by the authoritative ledger model (migration
--      20260916000000): accounts are inserted with their exported
--      opening_balance and `balance` is re-derived as opening_balance +
--      signed transaction effects while the rows are inserted — identical to
--      the export. The exported `balance` value itself is deliberately not
--      inserted (it is a derived cache; the INSERT trigger overwrites it).
--
-- Ownership enforcement is explicit because security definer bypasses RLS:
-- rows are written with user_id = auth.uid() only, and payload rows claiming
-- a different user_id abort the whole restore.

-- Extends 20260509000000's update_updated_at_column with the same GUC-guard
-- pattern the ledger uses (app.balance_maintenance): when app.preserve_updated_at
-- = 'on', the trigger leaves new.updated_at alone. Only restore_user_data sets
-- it (transaction-local) so it can rewrite the ledger-triggered updated_at
-- back to the exported values, making export/restore round trips byte-exact.
create or replace function update_updated_at_column()
returns trigger as $$
begin
  if coalesce(current_setting('app.preserve_updated_at', true), '') = 'on' then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function restore_user_data(p_payload jsonb)
returns jsonb
language plpgsql
security definer
-- public first so the ledger triggers (unqualified table refs) invoked by our
-- deletes/inserts resolve; pg_temp last so a temp object can never shadow them.
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_version int;
  v_key text;
  v_total int := 0;
  v_accounts jsonb;
  v_categories jsonb;
  v_transactions jsonb;
  v_budgets jsonb;
  v_exchange_rates jsonb;
  v_investment_plans jsonb;
  v_recurring jsonb;
  v_n int;
  v_counts jsonb := '{}';
  v_uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  -- The 7 payload tables in insert (dependency) order.
  v_keys text[] := array['accounts', 'categories', 'transactions', 'budgets',
                         'exchange_rates', 'investment_plans', 'recurring_transactions'];
begin
  if v_uid is null then
    raise exception 'restore_user_data: not authenticated';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'restore_user_data: payload must be a JSON object';
  end if;

  -- Version gate: only formats this app has ever exported (2 = pre-recurring,
  -- 3 = adds opening_balance + recurring_transactions).
  if coalesce(jsonb_typeof(p_payload->'version'), '') <> 'number'
     or (p_payload->>'version')::text !~ '^\d+$' then
    raise exception 'restore_user_data: missing or invalid export version';
  end if;
  v_version := (p_payload->>'version')::int;
  if v_version not in (2, 3) then
    raise exception 'restore_user_data: unsupported export version %', v_version;
  end if;

  -- ---- Phase 1: validation (pure reads of p_payload; no writes) ----------

  -- Required tables, array shape for every known table.
  foreach v_key in array v_keys loop
    if p_payload->v_key is null then
      if v_key in ('accounts', 'transactions') then
        raise exception 'restore_user_data: missing required table "%"', v_key;
      end if;
      continue; -- optional table absent (v2 exports have no recurring_transactions)
    end if;
    if jsonb_typeof(p_payload->v_key) is distinct from 'array' then
      raise exception 'restore_user_data: "%" must be an array', v_key;
    end if;
  end loop;

  v_accounts          := coalesce(p_payload->'accounts', '[]'::jsonb);
  v_categories        := coalesce(p_payload->'categories', '[]'::jsonb);
  v_transactions      := coalesce(p_payload->'transactions', '[]'::jsonb);
  v_budgets           := coalesce(p_payload->'budgets', '[]'::jsonb);
  v_exchange_rates    := coalesce(p_payload->'exchange_rates', '[]'::jsonb);
  v_investment_plans  := coalesce(p_payload->'investment_plans', '[]'::jsonb);
  v_recurring         := coalesce(p_payload->'recurring_transactions', '[]'::jsonb);

  -- Row cap (same budget as the client's guard; defense in depth).
  v_total := (select sum(jsonb_array_length(t)) from unnest(array[
    v_accounts, v_categories, v_transactions, v_budgets,
    v_exchange_rates, v_investment_plans, v_recurring]) t);
  if v_total > 10000 then
    raise exception 'restore_user_data: payload has % rows; maximum is 10000', v_total;
  end if;

  -- Row structure: every row is an object carrying a string id.
  foreach v_key in array v_keys loop
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->v_key, '[]'::jsonb)) r
      where jsonb_typeof(r) is distinct from 'object'
         or jsonb_typeof(r->'id') is distinct from 'string'
    ) then
      raise exception 'restore_user_data: every "%" row must be an object with a string id', v_key;
    end if;
  end loop;

  -- UUID shape: every uuid-typed field must hold a well-formed uuid, checked
  -- before any write (a malformed value would otherwise fail mid-restore at
  -- insert time — still atomic, but the defect is a payload defect).
  foreach v_key in array v_keys loop
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->v_key, '[]'::jsonb)) r
      where (r->>'id')::text !~* v_uuid_re
         or (r->>'user_id') is not null and (r->>'user_id')::text !~* v_uuid_re
    ) then
      raise exception 'restore_user_data: "%" has a row with a malformed uuid (id/user_id)', v_key;
    end if;
  end loop;

  -- Ownership: a row may claim no user_id (the insert fills auth.uid()) or
  -- the caller's own — never anybody else's.
  foreach v_key in array v_keys loop
    if exists (
      select 1
      from jsonb_array_elements(coalesce(p_payload->v_key, '[]'::jsonb)) r
      where r->>'user_id' is not null
        and (r->>'user_id')::uuid is distinct from v_uid
    ) then
      raise exception 'restore_user_data: "%" contains rows belonging to another user', v_key;
    end if;
  end loop;

  -- Relationships: every reference must resolve inside the payload (the rest
  -- of the database is deleted during the restore).
  if exists (
    select 1 from jsonb_array_elements(v_transactions) t
    where (t->>'account_id') is null
       or (t->>'account_id')::text !~* v_uuid_re
       or (t->>'account_id')::uuid not in (
         select (a->>'id')::uuid from jsonb_array_elements(v_accounts) a)
  ) or exists (
    select 1 from jsonb_array_elements(v_recurring) t
    where (t->>'account_id') is null
       or (t->>'account_id')::text !~* v_uuid_re
       or (t->>'account_id')::uuid not in (
         select (a->>'id')::uuid from jsonb_array_elements(v_accounts) a)
  ) then
    raise exception 'restore_user_data: a transaction or recurring record references an account not present in the payload';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_transactions) t
    where (t->>'category_id') is not null
      and ((t->>'category_id')::text !~* v_uuid_re
        or (t->>'category_id')::uuid not in (
          select (c->>'id')::uuid from jsonb_array_elements(v_categories) c))
  ) or exists (
    select 1 from jsonb_array_elements(v_recurring) t
    where (t->>'category_id') is not null
      and ((t->>'category_id')::text !~* v_uuid_re
        or (t->>'category_id')::uuid not in (
          select (c->>'id')::uuid from jsonb_array_elements(v_categories) c))
  ) or exists (
    select 1 from jsonb_array_elements(v_categories) c
    where c->>'parent_id' is not null
      and ((c->>'parent_id')::text !~* v_uuid_re
        or (c->>'parent_id')::uuid not in (
          select (p->>'id')::uuid from jsonb_array_elements(v_categories) p))
  ) then
    raise exception 'restore_user_data: a record references a category not present in the payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_budgets) b,
         jsonb_array_elements_text(coalesce(b->'category_ids', '[]'::jsonb)) cid
    where cid::text !~* v_uuid_re
       or cid::uuid not in (
         select (c->>'id')::uuid from jsonb_array_elements(v_categories) c)
  ) then
    raise exception 'restore_user_data: a budget references a category not present in the payload';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_transactions) t
    where t->>'correlative_id' is not null
      and (t->>'correlative_id')::text !~* v_uuid_re
  ) then
    raise exception 'restore_user_data: a transaction has a malformed correlative_id';
  end if;

  -- ---- Phase 2: delete the caller's existing rows, FK-safe order ---------

  delete from public.recurring_transactions where user_id = v_uid;
  delete from public.transactions             where user_id = v_uid;
  delete from public.budgets                  where user_id = v_uid;
  delete from public.exchange_rates           where user_id = v_uid;
  delete from public.investment_plans         where user_id = v_uid;
  delete from public.accounts                 where user_id = v_uid;
  delete from public.categories               where user_id = v_uid;

  -- ---- Phase 3: insert in dependency order -------------------------------

  -- balance is omitted on purpose: it is a derived cache that the ledger
  -- triggers rebuild from opening_balance + the transactions inserted below.
  insert into public.accounts (id, user_id, created_at, updated_at,
                               name, type, currency, opening_balance, notes)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.name, r.type, r.currency, coalesce(r.opening_balance, 0), r.notes
  from jsonb_to_recordset(v_accounts) as r(
    id uuid, created_at timestamptz, updated_at timestamptz, name text,
    type text, currency text, opening_balance numeric, notes text);
  get diagnostics v_n = row_count;
  v_counts := jsonb_build_object('accounts', v_n);

  -- categories.parent_id is self-referencing; parent and child rows in one
  -- statement are fine because FK checks run at statement end.
  insert into public.categories (id, user_id, created_at, updated_at,
                                 name, type, parent_id, color, icon)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.name, r.type, r.parent_id, r.color, r.icon
  from jsonb_to_recordset(v_categories) as r(
    id uuid, created_at timestamptz, updated_at timestamptz, name text,
    type text, parent_id uuid, color text, icon text);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('categories', v_n);

  insert into public.transactions (id, user_id, created_at, updated_at,
                                   account_id, category_id, type, amount, currency,
                                   base_amount, base_currency, date, description, correlative_id)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.account_id, r.category_id, r.type, r.amount, r.currency,
         r.base_amount, r.base_currency, r.date, r.description, r.correlative_id
  from jsonb_to_recordset(v_transactions) as r(
    id uuid, created_at timestamptz, updated_at timestamptz,
    account_id uuid, category_id uuid, type text, amount numeric, currency text,
    base_amount numeric, base_currency text, date date, description text, correlative_id uuid);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('transactions', v_n);

  -- The ledger trigger rewrites account rows while transactions are inserted,
  -- which bumps their updated_at. Restore the exported timestamps so an
  -- export/restore round trip is byte-exact (see update_updated_at_column).
  perform set_config('app.preserve_updated_at', 'on', true);
  update public.accounts a
  set updated_at = r.updated_at
  from jsonb_to_recordset(v_accounts) as r(id uuid, updated_at timestamptz)
  where a.id = r.id and r.updated_at is not null;
  perform set_config('app.preserve_updated_at', '', true);

  insert into public.budgets (id, user_id, created_at, updated_at,
                              category_ids, name, amount, period, start_date)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.category_ids, r.name, r.amount, r.period, coalesce(r.start_date, current_date)
  from jsonb_to_recordset(v_budgets) as r(
    id uuid, created_at timestamptz, updated_at timestamptz,
    category_ids uuid[], name text, amount numeric, period text, start_date date);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('budgets', v_n);

  insert into public.exchange_rates (id, user_id, created_at, updated_at,
                                     from_currency, to_currency, rate, date)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.from_currency, r.to_currency, r.rate, r.date
  from jsonb_to_recordset(v_exchange_rates) as r(
    id uuid, created_at timestamptz, updated_at timestamptz,
    from_currency text, to_currency text, rate numeric, date date);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('exchange_rates', v_n);

  insert into public.investment_plans (id, user_id, created_at, updated_at,
                                       name, type, initial_amount, monthly_contribution,
                                       annual_return_rate, currency, notes)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.name, r.type, r.initial_amount, r.monthly_contribution,
         r.annual_return_rate, r.currency, r.notes
  from jsonb_to_recordset(v_investment_plans) as r(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, type text,
    initial_amount numeric, monthly_contribution numeric, annual_return_rate numeric,
    currency text, notes text);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('investment_plans', v_n);

  insert into public.recurring_transactions (id, user_id, created_at, updated_at,
                                             account_id, category_id, type, amount,
                                             currency, description, frequency,
                                             interval_value, day_of_month, start_date,
                                             end_date, next_date, is_active)
  select r.id, v_uid, coalesce(r.created_at, now()), coalesce(r.updated_at, now()),
         r.account_id, r.category_id, r.type, r.amount,
         coalesce(r.currency, 'USD'), r.description, r.frequency,
         coalesce(r.interval_value, 1), r.day_of_month, coalesce(r.start_date, current_date),
         r.end_date, coalesce(r.next_date, current_date), coalesce(r.is_active, true)
  from jsonb_to_recordset(v_recurring) as r(
    id uuid, created_at timestamptz, updated_at timestamptz,
    account_id uuid, category_id uuid, type text, amount numeric,
    currency text, description text, frequency text,
    interval_value int, day_of_month int, start_date date,
    end_date date, next_date date, is_active boolean);
  get diagnostics v_n = row_count;
  v_counts := v_counts || jsonb_build_object('recurring_transactions', v_n);

  return v_counts;
end;
$$;
