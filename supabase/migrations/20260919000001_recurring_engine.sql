-- Audit 11 (issue #15): idempotent, actually scheduled recurring transactions.
--
-- Before this migration an occurrence was applied by the CLIENT as two
-- independent requests (insert transaction, then advance next_date): a
-- failure or concurrent double-click between them duplicated transactions,
-- and "automatic repetition" only ever happened when a user clicked
-- "Apply now". The engine now lives in the database:
--
--   apply_recurring_occurrence(p_recurring_id, provenance...) — one security
--   definer call that, in a single transaction: locks the template row
--   (FOR UPDATE — concurrent calls serialize, the loser re-reads the already
--   advanced next_date and applies nothing), inserts one real transaction per
--   occurrence due on or before today (the ledger trigger maintains balances;
--   balances are never written directly), records each occurrence in
--   recurring_occurrences, advances next_date — or deactivates the schedule
--   when the next occurrence falls past end_date. Retrying the call is a
--   no-op: an already-applied template is no longer due.
--
--   recurring_occurrences — the unique template/occurrence identifier:
--   primary key (recurring_id, due_date) makes one applied occurrence per
--   template per due date a database invariant, not a code promise. Together
--   with the row lock this is the concurrency protection for double-apply.
--   transaction_id is ON DELETE SET NULL: deleting the generated transaction
--   is the user saying "this occurrence shouldn't exist", so the identity
--   stays spent and the occurrence is never resurrected by catch-up.
--
--   Scheduled worker: there is deliberately no external cron infrastructure.
--   The client invokes the same RPC per due template on app open
--   (catch-up-on-open, see recurringTransactionsStore.catchUp, fired from
--   AuthGuard). Idempotency makes concurrent tabs/retries harmless. Explicit
--   tradeoffs:
--     * Occurrences materialize when the app (any device) next opens, not at
--       the scheduled moment; a never-opened app generates nothing. The Due
--       badge and manual Apply remain the fallback.
--     * Timezone semantics: schedules are pure calendar DATES advanced and
--       compared against current_date on the SERVER (UTC on Supabase
--       Postgres). One consistent clock decides "due" for every device; a
--       user far from UTC may see an occurrence land late on their local
--       evening / early on their local morning. The previous client used the
--       browser clock, which disagreed between devices.
--     * Provenance (base_amount/base_currency/base_stale) is computed
--       client-side and passed in, mirroring the transfer RPCs
--       (20260917000002): the reporting currency is a client-only setting and
--       FX quotes are fetched from a provider, neither reachable from SQL.
--       One conversion per call covers all occurrences it applies (an
--       overdue template catching up N occurrences converts at the current
--       quote once, not N times).
--     * existing templates are NOT backfilled: which past occurrences were
--       already applied manually is unknowable, so catch-up starts from each
--       template's current next_date.
--
-- Progression on edit (acceptance criterion) is preserved client-side: the
-- client no longer resets next_date to start_date on unrelated template
-- edits; the database never did that. Editing start_date re-anchors the
-- schedule (next_date = start_date, satisfying recurring_transactions_next_date_range).
--
-- Interplay:
--   * 20260918000001 input invariants: the inserted rows (positive amount,
--     account-pinned currency, 2dp) satisfy the constraints by construction —
--     the template's own columns are copied verbatim.
--   * 20260916000000 ledger: occurrences are plain transaction inserts; the
--     maintain_account_balance trigger derives balances. Nothing here writes
--     accounts.balance.
--   * 20260917000004 ownership: the RPC verifies the template belongs to
--     auth.uid() before locking (security definer bypasses RLS, so the check
--     is explicit, as in the transfer RPCs).

-- ============================================================================
-- 1. Occurrence ledger: unique (template, due_date) identity.
-- ============================================================================

create table if not exists recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_id uuid not null references recurring_transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_date date not null,
  transaction_id uuid references transactions(id) on delete set null,
  applied_at timestamptz not null default now(),
  -- The unique template/occurrence identifier: one applied occurrence per
  -- template per due date, enforced for every writer.
  unique (recurring_id, due_date)
);

comment on table recurring_occurrences is
  'Applied occurrences of recurring templates. PK (recurring_id, due_date) is the unique template/occurrence identifier; rows are written only by apply_recurring_occurrence. transaction_id is set null when the generated transaction is deleted (the occurrence stays spent).';

alter table recurring_occurrences enable row level security;

-- Read-only for the owner; every write goes through the security definer RPC
-- (no insert/update/delete policies — direct client writes are rejected).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where policyname = 'Users can view their own recurring_occurrences'
      and tablename = 'recurring_occurrences'
  ) then
    execute 'create policy "Users can view their own recurring_occurrences" on recurring_occurrences for select using (auth.uid() = user_id)';
  end if;
end $$;

-- ============================================================================
-- 2. Pure schedule arithmetic — mirrors the client's computeNextDate
--    (src/lib/recurring.ts) so SQL advancement matches the displayed plan:
--    monthly day = coalesce(day_of_month, previous day), clamped to the
--    target month's length (Jan 31 -> Feb 28, with day_of_month it re-clamps
--    back UP: Feb 28 -> Mar 31). Yearly clamps Feb 29 -> Feb 28 (the client's
--    JS setFullYear would overflow to Mar 1; the database clamp is the
--    intended semantics).
-- ============================================================================

create or replace function recurring_next_date(
  p_next date,
  p_frequency text,
  p_interval_value integer,
  p_day_of_month integer default null
)
returns date
language sql
stable
as $$
  select case p_frequency
    when 'daily' then p_next + p_interval_value
    when 'weekly' then p_next + 7 * p_interval_value
    when 'monthly' then (
      date_trunc('month', p_next)
        + make_interval(months => p_interval_value)
        + (least(
             coalesce(p_day_of_month, extract(day from p_next)::int),
             extract(day from (
               date_trunc('month', p_next)
                 + make_interval(months => p_interval_value)
                 + interval '1 month - 1 day'
             ))::int
           ) - 1) * interval '1 day'
    )::date
    when 'yearly' then (p_next + make_interval(years => p_interval_value))::date
  end;
$$;

-- ============================================================================
-- 3. The engine: apply due occurrence(s) + advance/deactivate in ONE
--    transaction. Returns the number of occurrences applied (0 = nothing was
--    due — the idempotent-retry result).
-- ============================================================================

create or replace function apply_recurring_occurrence(
  p_recurring_id uuid,
  p_base_amount numeric,
  p_base_currency text,
  p_base_stale boolean,
  p_fx_rate numeric default null,
  p_fx_date date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rec recurring_transactions;
  v_next date;
  v_tx_id uuid;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_base_amount is null or p_base_currency is null or p_base_stale is null then
    raise exception 'base-amount provenance (base_amount/base_currency/base_stale) is required';
  end if;

  -- Lock the template row: concurrent applications serialize here, and the
  -- waiter re-evaluates the row after the lock is released (READ COMMITTED
  -- EvalPlanQual) — it sees the advanced next_date and applies nothing.
  select * into v_rec from recurring_transactions where id = p_recurring_id for update;
  if not found then
    raise exception 'recurring transaction % not found', p_recurring_id;
  end if;
  if v_rec.user_id is distinct from v_user then
    raise exception 'recurring transaction % does not belong to the caller', p_recurring_id;
  end if;
  if not v_rec.is_active then
    return 0;
  end if;

  v_next := v_rec.next_date;

  -- Catch up every occurrence due on or before today (server date) that has
  -- not passed end_date — insert + advance atomically, in schedule order.
  while v_next <= current_date
        and (v_rec.end_date is null or v_next <= v_rec.end_date) loop
    insert into transactions
      (user_id, account_id, category_id, type, amount, currency,
       base_amount, base_currency, fx_rate, fx_date, base_amount_stale,
       date, description)
    values
      (v_user, v_rec.account_id, v_rec.category_id, v_rec.type, v_rec.amount, v_rec.currency,
       p_base_amount, p_base_currency, p_fx_rate, p_fx_date, p_base_stale,
       v_next, v_rec.description)
    returning id into v_tx_id;

    -- The unique identifier: fails loudly if the same template/due date was
    -- already applied by any writer (belt to the row lock's braces).
    insert into recurring_occurrences (recurring_id, user_id, due_date, transaction_id)
    values (v_rec.id, v_user, v_next, v_tx_id);

    v_next := recurring_next_date(v_next, v_rec.frequency, v_rec.interval_value, v_rec.day_of_month);
    v_count := v_count + 1;
  end loop;

  if v_rec.end_date is not null and v_next > v_rec.end_date then
    -- Schedule ran past its end: deactivate. next_date stays at the last
    -- applied occurrence (the pre-engine client behavior).
    update recurring_transactions set is_active = false where id = v_rec.id;
  elsif v_count > 0 then
    update recurring_transactions set next_date = v_next where id = v_rec.id;
  end if;

  return v_count;
end;
$$;

revoke execute on function apply_recurring_occurrence(uuid, numeric, text, boolean, numeric, date) from public, anon;
grant execute on function apply_recurring_occurrence(uuid, numeric, text, boolean, numeric, date) to authenticated, service_role;
