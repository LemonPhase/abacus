-- Recurring engine tests (issue #15) against real PostgreSQL.
-- Run by supabase/tests/run_recurring_engine_tests.sh with all migrations
-- applied and grants installed for the `authenticated` role. Runs AS that
-- non-superuser role (SET ROLE) so RLS is actually enforced, with auth.uid()
-- stubbed to the per-session app.test_user_id GUC. Exits non-zero on the
-- first failure (\set ON_ERROR_STOP + test_assert / expected-exception blocks).
\set ON_ERROR_STOP on

create or replace function test_assert(cond boolean, msg text) returns void as $$
begin
  if not cond then raise exception 'ASSERT FAILED: %', msg; end if;
end;
$$ language plpgsql;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'), -- U1
  ('22222222-2222-2222-2222-222222222222'); -- U2

-- ===========================================================================
-- Setup: U1's account/category and the template zoo. Everything date-related
-- is anchored to current_date so the suite is deterministic on any day.
-- ===========================================================================
set role authenticated;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

insert into accounts (id, name, type, currency, opening_balance, balance)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'u1 checking', 'checking', 'USD', 100, 100);
insert into categories (id, name, type, color)
values ('cccccccc-0000-0000-0000-000000000001', 'u1 subs', 'expense', '#111111');

-- E1: basic monthly, due today.
insert into recurring_transactions
  (id, account_id, category_id, type, amount, currency, description, frequency,
   interval_value, day_of_month, start_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'cccccccc-0000-0000-0000-000000000001', 'expense', 15, 'USD', 'Netflix', 'monthly',
   1, null, current_date - 1, current_date);

-- E2: ends today — exactly one more occurrence, then deactivated.
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, end_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 10, 'USD', 'Ending today', 'daily', 1,
   current_date - 5, current_date, current_date);

-- E3: end_date already passed without being due — deactivate, apply nothing.
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, end_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 10, 'USD', 'Ended while ahead', 'daily', 1,
   current_date - 10, current_date - 5, current_date - 1);

-- E4: overdue daily — catch-up applies every missed occurrence.
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 2, 'USD', 'Overdue daily', 'daily', 1,
   current_date - 10, current_date - 3);

-- E5: overdue monthly on day 1 — catch-up crosses month boundaries.
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   day_of_month, start_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
   'income', 1000, 'USD', 'Overdue salary', 'monthly', 1,
   1, (date_trunc('month', current_date) - interval '3 months')::date,
   (date_trunc('month', current_date) - interval '3 months')::date);

-- E6: paused — never applies.
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, next_date, is_active)
values
  ('eeeeeeee-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 5, 'USD', 'Paused', 'daily', 1,
   current_date - 10, current_date, false);

-- ===========================================================================
-- A. Basic apply: one call inserts + advances atomically, provenance lands.
-- ===========================================================================
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000001', 15, 'USD', false) as applied_1 \gset

select test_assert(:applied_1 = 1, 'A: first apply must report exactly 1 occurrence');
select test_assert(
  (select count(*) from transactions
   where description = 'Netflix' and date = current_date) = 1,
  'A: exactly one occurrence transaction on the due date');
select test_assert(
  (select amount from transactions where description = 'Netflix') = 15
  and (select base_amount from transactions where description = 'Netflix') = 15
  and (select base_currency from transactions where description = 'Netflix') = 'USD'
  and (select base_amount_stale from transactions where description = 'Netflix') = false
  and (select type from transactions where description = 'Netflix') = 'expense'
  and (select account_id from transactions where description = 'Netflix')
      = 'aaaaaaaa-0000-0000-0000-000000000001',
  'A: transaction copies the template columns and the passed provenance');
select test_assert(
  (select next_date > current_date from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'A: next_date advanced past today in the same transaction');
select test_assert(
  (select is_active from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'A: still active when the next occurrence is in the future');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and due_date = current_date) = 1,
  'A: occurrence recorded under the unique (template, due_date) identity');
select test_assert(
  (select transaction_id from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and due_date = current_date)
  = (select id from transactions where description = 'Netflix'),
  'A: occurrence links to the inserted transaction');
select test_assert(
  (select balance from accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 85,
  'A: balance derived through the ledger trigger (100 - 15), never written directly');

-- ===========================================================================
-- B. Retry: the same call is a no-op — no duplicate, nothing re-advanced.
-- ===========================================================================
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000001', 15, 'USD', false) as applied_retry \gset

select test_assert(:applied_retry = 0, 'B: retry must report 0 (nothing due)');
select test_assert(
  (select count(*) from transactions where description = 'Netflix') = 1,
  'B: retry must not duplicate the occurrence');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000001') = 1,
  'B: retry must not add occurrence rows');

-- B2: deleting the generated transaction does not resurrect the occurrence
-- (the identity stays spent; transaction_id is set null, never cascaded away).
delete from transactions where description = 'Netflix';
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000001', 15, 'USD', false) as applied_del \gset
select test_assert(:applied_del = 0,
  'B2: deleted occurrence must not be regenerated by a retry');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and due_date = current_date and transaction_id is null) = 1,
  'B2: occurrence identity survives with transaction_id set to null');

-- ===========================================================================
-- C. End dates: apply-then-deactivate, and deactivate-without-apply.
-- ===========================================================================
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000002', 10, 'USD', false) as applied_e2 \gset
select test_assert(:applied_e2 = 1, 'C: end-dated template applies its final occurrence');
select test_assert(
  not (select is_active from recurring_transactions
       where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'C: schedule deactivated after the final occurrence');
select test_assert(
  (select next_date = current_date from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000002'),
  'C: next_date stays at the last applied occurrence when deactivating');

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000003', 10, 'USD', false) as applied_e3 \gset
select test_assert(:applied_e3 = 0,
  'C: already-ended template applies nothing');
select test_assert(
  not (select is_active from recurring_transactions
       where id = 'eeeeeeee-0000-0000-0000-000000000003'),
  'C: already-ended template is deactivated');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000003') = 0,
  'C: already-ended template produced no occurrences');

-- ===========================================================================
-- D. Overdue catch-up: every missed occurrence applied in order, once.
-- ===========================================================================
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000004', 2, 'USD', false) as applied_e4 \gset
select test_assert(:applied_e4 = 4, 'D: daily catch-up applies today-3 .. today');
select test_assert(
  (select count(*) from transactions
   where description = 'Overdue daily') = 4
  and (select count(*) from transactions
       where description = 'Overdue daily'
         and date >= current_date - 3 and date <= current_date) = 4,
  'D: catch-up transactions span exactly the overdue window');
select test_assert(
  (select count(distinct date) from transactions
   where description = 'Overdue daily') = 4,
  'D: no duplicate dates in catch-up');
select test_assert(
  (select next_date = current_date + 1 from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000004'),
  'D: next_date lands on tomorrow after catch-up');

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000005', 1000, 'USD', false) as applied_e5 \gset
select test_assert(:applied_e5 = 4,
  'D: monthly catch-up applies the firsts of m-3..m (month boundaries incl.)');
select test_assert(
  (select count(*) from transactions
   where description = 'Overdue salary'
     and date in (
       (date_trunc('month', current_date) - interval '3 months')::date,
       (date_trunc('month', current_date) - interval '2 months')::date,
       (date_trunc('month', current_date) - interval '1 month')::date,
       (date_trunc('month', current_date))::date)) = 4,
  'D: monthly catch-up dates are the four month firsts');
select test_assert(
  (select next_date = (date_trunc('month', current_date) + interval '1 month')::date
   from recurring_transactions where id = 'eeeeeeee-0000-0000-0000-000000000005'),
  'D: monthly next_date lands on the first of the following month');

-- Catch-up retry is again a no-op.
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000004', 2, 'USD', false) as applied_e4b \gset
select test_assert(:applied_e4b = 0, 'D: catch-up retry applies nothing');

-- ===========================================================================
-- E. Paused templates never apply.
-- ===========================================================================
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000006', 5, 'USD', false) as applied_e6 \gset
select test_assert(:applied_e6 = 0, 'E: paused template applies nothing');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000006') = 0,
  'E: paused template has no occurrences');

-- ===========================================================================
-- F. Ownership: another authenticated user cannot apply U1's template.
-- ===========================================================================
set app.test_user_id = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    perform public.apply_recurring_occurrence(
      'eeeeeeee-0000-0000-0000-000000000001', 15, 'USD', false);
    raise exception 'ASSERT FAILED: cross-user apply must be rejected';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
  end;
end $$;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';
select test_assert(
  (select count(*) from transactions where description = 'Netflix' and date = current_date) = 0,
  'F: cross-user attempt inserted nothing (deleted in B2, must stay deleted)');

-- Unauthenticated calls are rejected (no GUC -> auth.uid() null).
reset app.test_user_id;
do $$
begin
  begin
    perform public.apply_recurring_occurrence(
      'eeeeeeee-0000-0000-0000-000000000001', 15, 'USD', false);
    raise exception 'ASSERT FAILED: unauthenticated apply must be rejected';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
  end;
end $$;
set app.test_user_id = '11111111-1111-1111-1111-111111111111';

-- ===========================================================================
-- G. Direct client writes to the occurrence ledger are rejected (RLS).
-- ===========================================================================
do $$
begin
  begin
    insert into recurring_occurrences
      (recurring_id, user_id, due_date, transaction_id)
    values
      ('eeeeeeee-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111', current_date, null);
    raise exception 'ASSERT FAILED: direct occurrence insert must be rejected';
  exception
    when insufficient_privilege then null;
    when others then
      if sqlerrm like 'ASSERT FAILED:%' then raise; end if;
      raise;
  end;
end $$;

-- ===========================================================================
-- H. Schedule arithmetic (fixed dates): month/year boundaries.
-- ===========================================================================
select test_assert(
  public.recurring_next_date('2026-01-31', 'monthly', 1, null) = '2026-02-28',
  'H: Jan 31 + 1mo clamps to Feb 28');
select test_assert(
  public.recurring_next_date('2026-02-28', 'monthly', 1, 31) = '2026-03-31',
  'H: day_of_month re-clamps back up (Feb 28 -> Mar 31)');
select test_assert(
  public.recurring_next_date('2026-01-31', 'monthly', 1, 15) = '2026-02-15',
  'H: day_of_month overrides the anchor day');
select test_assert(
  public.recurring_next_date('2026-11-15', 'monthly', 2, null) = '2027-01-15',
  'H: interval 2 crosses the year boundary');
select test_assert(
  public.recurring_next_date('2024-02-29', 'yearly', 1, null) = '2025-02-28',
  'H: Feb 29 yearly clamps to Feb 28');
select test_assert(
  public.recurring_next_date('2025-12-31', 'yearly', 1, null) = '2026-12-31',
  'H: year rollover keeps month/day');
select test_assert(
  public.recurring_next_date('2026-01-31', 'daily', 1) = '2026-02-01',
  'H: daily crosses the month boundary');
select test_assert(
  public.recurring_next_date('2026-01-25', 'weekly', 2) = '2026-02-08',
  'H: weekly interval 2 crosses the month boundary');

-- ===========================================================================
-- I. Reactivated ended schedule (PR #32 review repro A): identities spent
--    before deactivation are skipped — never resurrected, never a duplicate-
--    key error — and catch-up applies exactly the missed window.
-- ===========================================================================
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, end_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 4, 'USD', 'Resubscribed', 'daily', 1,
   current_date - 10, current_date - 3, current_date - 5);

-- Run to the end date: applies today-5..today-3, then deactivates with
-- next_date left at the last applied (already spent) occurrence.
select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000008', 4, 'USD', false) as applied_i1 \gset
select test_assert(:applied_i1 = 3, 'I: applies the window up to end_date');
select test_assert(
  not (select is_active from recurring_transactions
       where id = 'eeeeeeee-0000-0000-0000-000000000008'),
  'I: deactivated at end_date');

-- User resubscribes: extends the end date and re-enables (ordinary UI edit,
-- start date untouched so next_date is preserved).
update recurring_transactions
set end_date = current_date + 10, is_active = true
where id = 'eeeeeeee-0000-0000-0000-000000000008';

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000008', 4, 'USD', false) as applied_i2 \gset
select test_assert(:applied_i2 = 3,
  'I: reactivation applies exactly the newly missed days (spent identity skipped)');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000008') = 6,
  'I: six occurrences total — three spent before deactivation, three new');
select test_assert(
  (select count(*) from transactions
   where description = 'Resubscribed'
     and date in (current_date - 2, current_date - 1, current_date)) = 3,
  'I: new transactions land on the reactivated window, not on spent dates');
select test_assert(
  (select next_date = current_date + 1 from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000008'),
  'I: next_date advanced past the whole walked window');
select test_assert(
  (select is_active from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000008'),
  'I: extended schedule stays active');

-- ===========================================================================
-- J. Catch-up continues past spent identities: a stale next_date pointing at
--    spent identities walks over them, applies nothing, and still advances.
-- ===========================================================================
update recurring_transactions
set next_date = current_date - 3
where id = 'eeeeeeee-0000-0000-0000-000000000008';

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000008', 4, 'USD', false) as applied_j \gset
select test_assert(:applied_j = 0, 'J: fully-spent window applies nothing');
select test_assert(
  (select count(*) from recurring_occurrences
   where recurring_id = 'eeeeeeee-0000-0000-0000-000000000008') = 6,
  'J: no duplicate occurrences after walking spent identities');
select test_assert(
  (select next_date = current_date + 1 from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000008'),
  'J: next_date still advances past a fully-spent window');

-- ===========================================================================
-- K. Per-call cap: a huge overdue window is drained in resumable batches
--    (next_date always advances; no single giant transaction).
-- ===========================================================================
insert into recurring_transactions
  (id, account_id, type, amount, currency, description, frequency, interval_value,
   start_date, next_date)
values
  ('eeeeeeee-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
   'expense', 1, 'USD', 'Long overdue', 'daily', 1,
   current_date - 200, current_date - 101);

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000009', 1, 'USD', false) as applied_k1 \gset
select test_assert(:applied_k1 = 100, 'K: first call applies at most the cap');
select test_assert(
  (select next_date = current_date - 1 from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000009'),
  'K: next_date advances to the cap boundary (resumable)');

select public.apply_recurring_occurrence(
  'eeeeeeee-0000-0000-0000-000000000009', 1, 'USD', false) as applied_k2 \gset
select test_assert(:applied_k2 = 2, 'K: second call finishes the window');
select test_assert(
  (select next_date = current_date + 1 from recurring_transactions
   where id = 'eeeeeeee-0000-0000-0000-000000000009'),
  'K: fully drained');
