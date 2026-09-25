# Accounts

Accounts lets a user track money by account (checking, savings, credit,
investment, cash) with a name, type, currency, and opening balance. The
Investments segment shares the same page host and shows projection tools for
investment-type accounts.

## Sub-features

- `accounts-create` adds an account through the dialog.
- `accounts-edit` renames or changes an account in place.
- `accounts-delete` removes an account behind a confirm dialog.
- `accounts-empty` shows the empty state when none exist.
- `accounts-investments` is the Investments segment at its own entry point.

## How to get to it (user POV)

- Sidebar `Accounts` → `/app/accounts`.
- Sidebar `Investments` → `/app/investments` (same host, selected segment).
- The `Add Account` button on the page (or the FAB on mobile).

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. Fresh `test` user (no accounts exist → empty state visible).

- **Empty state.** Run `await page.goto('/app/accounts')`. `No accounts yet` is visible. Screenshot `accounts-<id>-empty.png`.
- **Create.** Choose `Add Account`. Run `await page.getByRole('button', { name: 'Add Account' }).click()`, then fill `input[id="acct-name"]` (`Main Checking`) and `input[id="acct-balance"]` (`2500`); submit via `page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Add Account' }).click()`. Dialog closes and `Main Checking` is visible in the table. Screenshot `accounts-<id>-created.png`; ARIA snapshot alongside.
- **Side effect.** Read the row back: `(await userSupabase.from('accounts').select('name, balance').eq('name', 'Main Checking')).data` has exactly one row with `balance: 2500`.
- **Edit.** In `page.locator('tr', { hasText: 'Main Checking' })` choose the Pencil (`.locator('button').first()`), fill `acct-name` with `Main Checking Updated`, choose `Save`. `Main Checking Updated` is visible. Screenshot `accounts-<id>-edited.png`.
- **Delete.** In the updated row choose the Trash (`.locator('button').last()`), confirm `Delete` in the dialog titled `Delete Account`. `No accounts yet` returns. Screenshot `accounts-<id>-deleted.png`.
- **Investments entry.** Run `await page.goto('/app/investments')`. The Investments segment renders on the Accounts host. Screenshot `accounts-<id>-investments.png`.

## Gotchas

- Row buttons have icon-only labels — use position within the row (first/last), but scope to the row matched by text first.
- Type defaults to Checking and currency to USD in the dialog; don't assume the dropdowns need driving.
- The dialog submit button shares its name (`Add Account`) with the page opener — always scope it under `[data-slot="dialog-content"]`.
- `/app/investments` is a separate entry point in the map: verifying `/app/accounts` does not cover it.
