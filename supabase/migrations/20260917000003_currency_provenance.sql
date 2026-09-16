-- Currency provenance and stale-value flagging (Audit 06, issue #10).
--
-- Semantics: a transaction's `amount` is denominated in the account currency
-- (`currency`). `base_amount` is that amount converted into the user's
-- reporting currency (`base_currency`) using the FX quote recorded in
-- `fx_rate` / `fx_date`. Rows with no reliable conversion are flagged
-- `base_amount_stale` so aggregates can exclude them instead of
-- misrepresenting values.
--
-- Reporting-currency changes: stored base amounts keep the reporting currency
-- they were computed for. Aggregations only trust a row whose base_currency
-- matches the current reporting currency (or whose currency is already the
-- reporting currency), so switching reporting currencies excludes not-yet-
-- converted rows until they are re-saved.

alter table transactions add column if not exists fx_rate numeric;
alter table transactions add column if not exists fx_date date;
alter table transactions add column if not exists base_amount_stale boolean not null default true;

-- Rows written before provenance tracking never stored a real conversion
-- (base_amount mirrored amount regardless of currency). Flag them all;
-- they become reliable again when re-saved with provenance.
--
-- The FX provider only serves current quotes. Earlier code stored a quote
-- fetched "now" under a historical transaction date, so purge cache rows whose
-- date precedes their insertion day rather than trusting mislabeled history.
delete from exchange_rates where date < created_at::date;
