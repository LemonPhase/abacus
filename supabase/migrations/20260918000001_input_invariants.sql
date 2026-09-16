-- Audit 09 (issue #13): domain invariants for financial and recurring input.
--
-- Client-side validation is bypassable through direct API requests, so the
-- database now enforces what the domain actually means. Invariants and their
-- remediation policy for existing rows (the same two-tier policy as
-- 20260917000002: repair what has a faithful repair and validate; reject new
-- writes and quarantine legacy rows where no faithful repair exists):
--
--   Currency identifiers (repaired, VALID)
--     accounts.currency, transactions.base_currency, investment_plans.currency
--     and exchange_rates.from_currency/to_currency must be ISO 4217 alpha-3
--     (3 uppercase letters). transactions.currency / recurring_transactions
--     .currency need no format check: they are pinned to the account currency
--     by the composite FKs below. Remediation: normalize case only — a 3-letter
--     code in another case is the same currency; anything else has no faithful
--     repair and fails the constraint so corrupted identifiers surface here.
--     Known failure mode: if exchange_rates already holds the same currency
--     pair in both cases for one user/day (e.g. 'usd→eur' and 'USD→EUR'),
--     case normalization collides with idx_exchange_rates_user_currency_date
--     and this migration aborts with a unique violation — failing is correct
--     (deduplicating would delete rows); merge such duplicates before
--     deploying.
--
--   Transaction/account currency consistency (repaired, VALID)
--     A transaction's amount is denominated in its account's currency
--     (20260917000003 semantics). transactions(account_id, currency) and
--     recurring_transactions(account_id, currency) become composite FKs to
--     accounts(id, currency). Cross-currency transfers stay legal: each leg
--     matches its OWN account's currency (the transfer RPCs in
--     20260917000002 already read it from the accounts table). Consequence:
--     an account's currency becomes immutable while transactions pin it —
--     relabeling a USD account as EUR would falsify its history. Legacy
--     mismatches (API-bypass residue) are repaired by reassigning the row's
--     currency to the account currency: the client always denominated the
--     amount in the account currency, amounts and therefore ledger effects
--     and balances are untouched.
--
--   Amount signs / finiteness / precision (NOT VALID: no faithful repair)
--     income and expense amounts are positive magnitudes (the ledger's signed
--     effects — income/transfer +amount, expense -amount — are computed FROM
--     the magnitude, so a negative magnitude silently inverts the effect);
--     transfer legs are signed (outgoing < 0, incoming > 0) and merely
--     nonzero. Numeric columns must be finite — PostgreSQL numeric accepts
--     'NaN'/'Infinity' and NaN compares greater than every number, so sign
--     checks alone do not catch it; `x = x` is false only for NaN and
--     abs(x) < 'Infinity' rejects both infinities) and money columns limited
--     to the client's
--     stored precision (2 decimal places; FX/fx rates keep provider precision).
--     Legacy violating rows are preserved as-is (flipping a sign, rounding a
--     ledger amount or clamping an interval would guess user intent); the
--     constraints still reject every INSERT/UPDATE, so editing a quarantined
--     row requires fixing the value — the client rounds amounts since this
--     migration, so app-written rows always pass.
--
--   Recurring schedule bounds (interval/day NOT VALID; date ranges repaired)
--     interval_value >= 1 and day_of_month in 1..31 (client input bounds).
--     end_date >= start_date and next_date >= start_date: a template cannot
--     end or occur before it starts. Remediation: a contradictory end_date is
--     dropped (the schedule stays active, matching the "invalid reference ->
--     NULL" policy of 20260917000004) and next_date is reset to start_date
--     (exactly what the client writes when creating a template).
--
--   Budget / investment domains (NOT VALID: no faithful repair)
--     budgets.amount > 0 (a zero or negative spending target is meaningless);
--     investment_plans initial_amount >= 0, monthly_contribution >= 0 and
--     annual_return_rate >= -100 (below total loss is impossible; losses
--     themselves are legitimate input).
--
--   Date ranges left open deliberately: transaction/budget/quote dates accept
--   any calendar date (recording history and scheduling the future are both
--   legitimate); the recurring range above is where the domain has bounds.
--
-- Interplay: the balance-maintenance trigger is disabled around the
-- transaction remediation UPDATEs (as in 20260917000004) — they change
-- currency only, never amount/type, so signed ledger effects and balances are
-- preserved bit-for-bit. The restore RPC (20260917000001) inserts go through
-- these constraints: exports of repaired data restore cleanly; a payload
-- carrying invariant-violating rows aborts the whole restore.
--
-- Pure CHECK constraints: no new functions, no helper objects, works on any
-- PostgreSQL version Supabase supports.

-- ============================================================================
-- 1. Currency identifiers: normalize case, then require ISO 4217 alpha-3.
-- ============================================================================

alter table transactions disable trigger user;
update transactions set currency = upper(currency) where currency <> upper(currency);
update transactions set base_currency = upper(base_currency) where base_currency <> upper(base_currency);
alter table transactions enable trigger user;

update accounts set currency = upper(currency) where currency <> upper(currency);
update recurring_transactions set currency = upper(currency) where currency <> upper(currency);
update investment_plans set currency = upper(currency) where currency <> upper(currency);
update exchange_rates set from_currency = upper(from_currency) where from_currency <> upper(from_currency);
update exchange_rates set to_currency = upper(to_currency) where to_currency <> upper(to_currency);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_currency_format') then
    alter table accounts add constraint accounts_currency_format
      check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_base_currency_format') then
    alter table transactions add constraint transactions_base_currency_format
      check (base_currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_plans_currency_format') then
    alter table investment_plans add constraint investment_plans_currency_format
      check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exchange_rates_currency_format') then
    alter table exchange_rates add constraint exchange_rates_currency_format
      check (from_currency ~ '^[A-Z]{3}$' and to_currency ~ '^[A-Z]{3}$');
  end if;
end $$;

-- ============================================================================
-- 2. Transaction/account currency consistency (composite FKs).
--    Repair first: reassign the row's currency to its account's currency.
--    Amounts are untouched, so the ledger (20260916000000) is untouched.
-- ============================================================================

alter table transactions disable trigger user;
update transactions t
set currency = a.currency
from accounts a
where t.account_id = a.id
  and t.currency <> a.currency;
alter table transactions enable trigger user;

update recurring_transactions r
set currency = a.currency
from accounts a
where r.account_id = a.id
  and r.currency <> a.currency;

-- FK target: (id, currency) is unique because id is — the extra index is
-- negligible and gives the FK below something to reference.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_id_currency_key') then
    alter table accounts add constraint accounts_id_currency_key unique (id, currency);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_account_currency_fkey') then
    alter table transactions add constraint transactions_account_currency_fkey
      foreign key (account_id, currency) references accounts (id, currency);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_account_currency_fkey') then
    alter table recurring_transactions add constraint recurring_transactions_account_currency_fkey
      foreign key (account_id, currency) references accounts (id, currency);
  end if;
end $$;

-- ============================================================================
-- 3. Amount domains. NOT VALID: enforced for every new/updated row; legacy
--    rows that violate them are preserved (see header) and quarantined — any
--    UPDATE of such a row re-checks the constraint, so the value must be
--    fixed before the row can be edited.
-- ============================================================================

do $$
begin
  -- income/expense: positive magnitude (ledger computes the sign); transfer:
  -- signed leg, nonzero. Finite + 2dp money precision.
  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_domain') then
    alter table transactions add constraint transactions_amount_domain
      check (
        (amount = amount and abs(amount) < 'Infinity'::numeric)
        and scale(amount) <= 2
        and (
          (type in ('income', 'expense') and amount > 0)
          or (type = 'transfer' and amount <> 0)
        )
      ) not valid;
  end if;
  -- base_amount mirrors the client's roundCurrency output.
  if not exists (select 1 from pg_constraint where conname = 'transactions_base_amount_domain') then
    alter table transactions add constraint transactions_base_amount_domain
      check (base_amount = base_amount and abs(base_amount) < 'Infinity'::numeric
             and scale(base_amount) <= 2) not valid;
  end if;
  -- FX provenance: a usable quote is positive and finite (null = no quote).
  if not exists (select 1 from pg_constraint where conname = 'transactions_fx_rate_domain') then
    alter table transactions add constraint transactions_fx_rate_domain
      check (fx_rate is null
             or (fx_rate = fx_rate and abs(fx_rate) < 'Infinity'::numeric and fx_rate > 0)) not valid;
  end if;
  -- opening_balance is user input (balance is a derived cache the ledger
  -- trigger keeps consistent from finite inputs).
  if not exists (select 1 from pg_constraint where conname = 'accounts_opening_balance_domain') then
    alter table accounts add constraint accounts_opening_balance_domain
      check (opening_balance = opening_balance
             and abs(opening_balance) < 'Infinity'::numeric
             and scale(opening_balance) <= 2) not valid;
  end if;
  -- Budgets: positive spending target, money precision.
  if not exists (select 1 from pg_constraint where conname = 'budgets_amount_domain') then
    alter table budgets add constraint budgets_amount_domain
      check (amount = amount and abs(amount) < 'Infinity'::numeric
             and scale(amount) <= 2 and amount > 0) not valid;
  end if;
  -- Investments: non-negative amounts, rate may be negative (loss) but not
  -- below total loss (-100%); money precision on the amounts only.
  if not exists (select 1 from pg_constraint where conname = 'investment_plans_domain') then
    alter table investment_plans add constraint investment_plans_domain
      check (
        initial_amount = initial_amount and monthly_contribution = monthly_contribution
        and annual_return_rate = annual_return_rate
        and abs(initial_amount) < 'Infinity'::numeric
        and abs(monthly_contribution) < 'Infinity'::numeric
        and abs(annual_return_rate) < 'Infinity'::numeric
        and scale(initial_amount) <= 2 and scale(monthly_contribution) <= 2
        and initial_amount >= 0 and monthly_contribution >= 0
        and annual_return_rate >= -100
      ) not valid;
  end if;
  -- Recurring amounts: positive magnitude, sign per its income/expense type.
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_amount_domain') then
    alter table recurring_transactions add constraint recurring_transactions_amount_domain
      check (amount = amount and abs(amount) < 'Infinity'::numeric
             and scale(amount) <= 2 and amount > 0) not valid;
  end if;
  -- Recurring schedule input bounds.
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_schedule_domain') then
    alter table recurring_transactions add constraint recurring_transactions_schedule_domain
      check (
        interval_value >= 1
        and (day_of_month is null or day_of_month between 1 and 31)
      ) not valid;
  end if;
  -- Cached FX quotes must be usable.
  if not exists (select 1 from pg_constraint where conname = 'exchange_rates_rate_domain') then
    alter table exchange_rates add constraint exchange_rates_rate_domain
      check (rate = rate and abs(rate) < 'Infinity'::numeric and rate > 0) not valid;
  end if;
end $$;

-- ============================================================================
-- 4. Recurring date ranges: repair, then validate for all rows (a faithful
--    repair exists, unlike the schedule input bounds above).
-- ============================================================================

-- A template that "ended" before it started has no meaningful end: keep the
-- schedule by dropping the contradictory bound.
update recurring_transactions
set end_date = null
where end_date is not null
  and end_date < start_date;

-- next_date before start_date: occurrences cannot precede the template's
-- start; the client writes next_date = start_date on creation, so reset.
update recurring_transactions
set next_date = start_date
where next_date < start_date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_date_range') then
    alter table recurring_transactions add constraint recurring_transactions_date_range
      check (end_date is null or end_date >= start_date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_transactions_next_date_range') then
    alter table recurring_transactions add constraint recurring_transactions_next_date_range
      check (next_date >= start_date);
  end if;
end $$;
