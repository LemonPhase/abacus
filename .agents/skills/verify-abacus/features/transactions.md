# Transactions

Transactions records income, expenses, and transfers with multi-currency
amounts, filterable by account/category/type/date, paginated 50 at a time.
Recurring rules are managed on their own standalone page at `/app/recurring`.

## Sub-features

- `tx-create` adds a transaction and the account balance updates.
- `tx-edit` changes an existing transaction.
- `tx-delete` removes a transaction and the balance reverts.
- `tx-filter` narrows by type/account/category/date without losing rows.
- `tx-pagination` loads 50 rows at a time with an accurate count line.
- `tx-recurring` is the standalone Recurring page at its own entry point.

## How to get to it (user POV)

- Sidebar `Transactions` → `/app/transactions`.
- Sidebar `Recurring` → `/app/recurring` (desktop sidebar; on mobile under `More`).
- The filter bar above the table (selects and date inputs).
- `Load more` button below the table.

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. `test` user seeded with rows via `userSupabase` using the insert shapes in `../_seed-recipes.md` (NOT NULLs: `type`, `currency`, `base_amount`, `base_currency`, `date`; seed account balances via `opening_balance`) with distinctive descriptions (e.g. `March salary`, `Whole Foods`).

- **Create.** Choose `Add Transaction` via `page.getByRole('button', { name: 'Add Transaction' }).first()` — the accessible name is shared by the page button, the floating FAB, and the dialog submit (the FAB is always labelled `Add Transaction`, on every page). The dialog labels its fields Type / Account / Category / Amount / Date / Description. Selects in order (non-transfer): `page.locator('[data-slot="dialog-content"] [data-slot="select-trigger"]').nth(0|1|2)` = Type / Account / Category; for `transfer`, an `Account (To)` select inserts at nth(2) and Category shifts to nth(3); labels become `Account (From)` / `Account (To)`. Pick items under `[data-slot="select-content"][data-open]`. The submit stays `disabled` until Account and Amount are picked (plus a destination Account when Type is transfer) — Category is optional. Required fields carry a `*` marker (aria-hidden) and `aria-required`. Fill Amount / Date / Description via `getByLabel(...)`, submit `Add Transaction` scoped under `[data-slot="dialog-content"]`. The row appears in the table. Screenshot `tx-create__app-transactions__created.png` + ARIA snapshot.
- **Edit.** Row Pencil opens `Edit Transaction` with the same fields; submit `Save`. Delete confirm dialog is titled `Delete Transaction`.
- **List.** Run `await page.goto('/app/transactions')`. Seeded descriptions are visible. Screenshot `tx-<id>-list.png` + ARIA snapshot.
- **Filter.** In `page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')` click `[data-slot="select-trigger"]` nth(2), pick an item under `[data-slot="select-content"][data-open]`. Matching rows stay visible, others (`Whole Foods`) are gone. Clear the filter by picking its `All …` item (`All` / `All accounts` / `All categories`) and assert every row returns. Screenshot `tx-filter__app-transactions__filtered.png`.
- **Date filter.** Fill `filterBar.locator('input[type="date"]')` first with `2024-03-01`. Only rows on/after that date remain.
- **Pagination.** Seed ≥105 rows (see `../_seed-recipes.md`): `Showing 50 of 105 transactions` is visible; run `await page.getByRole('button', { name: 'Load more' }).click()` → `Showing 100 of 105`, a second click → `Showing 105 of 105 transactions`, table `tbody tr` count grows 50→100→105. Screenshot `tx-pagination__app-transactions__page2.png`.
- **Side effect (create/edit/delete).** Read back via `userSupabase.from('transactions').select()` and `userSupabase.from('accounts').select('balance')` — the `maintain_account_balance` trigger must reflect the mutation in the balance.

## Gotchas

- Filter select indexes (`nth(2)`) are part of the stable handle set but re-check the filter bar order if the UI changed.
- Assert balances via `userSupabase` read-back; the visible table alone does not prove the trigger fired.
- `/app/recurring` renders its own standalone page (no tabs, no shared host) — it is a separate entry point and needs its own drive (see `e2e/recurring.spec.ts` for the current recipe).
- Account select items render as `Name (CURRENCY)` (e.g. `Seed Checking (USD)`) — exact-text matching on select items fails; match by substring.
- The floating FAB is always labelled `Add Transaction` regardless of page — name-based clicks on `Add Transaction` hit 2+ elements; use `.first()` for the page button and scope dialog submits.
- The submit is gated on Account + Amount (+ a destination Account for transfers). Category is optional and category-less rows render `—` — seed one anyway when driving budgets/reports recipes that match by category. Required fields are marked with `*`.
- The count line reads `Showing {loaded} of {grandTotal} transactions` — the denominator is the UNFILTERED ledger total even when filters are active (the filtered total exists only in the store). Assert counts against your seed, not the phrase.
- `/app/transactions` and `/app/recurring` are separate pages with separate headings — there are no segment tabs. Drive recurring at `/app/recurring` per `e2e/recurring.spec.ts`.
