# Accounts

Accounts lets a user track money by account (checking, savings, credit,
investment, cash) with a name, type, currency, and opening balance.
Investments is a standalone page at `/app/investments` with projection tools
for investment plans (compound-growth projections — not accounts of type
`investment`).

## Sub-features

- `accounts-create` adds an account through the dialog.
- `accounts-edit` renames or changes an account in place.
- `accounts-delete` removes an account behind a confirm dialog.
- `accounts-empty` shows the empty state when none exist.
- `accounts-investments` opens the standalone Investments page at its own entry point.

## How to get to it (user POV)

- Sidebar `Accounts` → `/app/accounts` (desktop sidebar, mobile bar tab).
- Sidebar `Investments` → `/app/investments` (desktop sidebar; on mobile it is under `More`).
- The `View investments` link on the Accounts page → `/app/investments`.
- The `Add Account` button on the page. (The FAB is `Add Transaction` on every page — see [navigation](./navigation.md).)

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. Fresh `test` user (no accounts exist → empty state visible).

- **Empty state.** Run `await page.goto('/app/accounts')`. `No accounts yet` is visible. Screenshot `accounts-<id>-empty.png`.
- **Create.** Choose `Add Account`. Run `await page.getByRole('button', { name: 'Add Account' }).click()`, then fill `input[id="acct-name"]` (`Main Checking`) and `input[id="acct-balance"]` (`2500`); submit via `page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Add Account' }).click()`. Dialog closes and `Main Checking` is visible in the table. Screenshot `accounts-<id>-created.png`; ARIA snapshot alongside.
- **Side effect.** Read the row back: `(await userSupabase.from('accounts').select('name, balance').eq('name', 'Main Checking')).data` has exactly one row with `balance: 2500`.
- **Edit.** In `page.locator('tr', { hasText: 'Main Checking' })` choose the Pencil (`.locator('button').first()`), fill `acct-name` with `Main Checking Updated`, choose `Save`. `Main Checking Updated` is visible. Screenshot `accounts-<id>-edited.png`.
- **Delete.** In the updated row choose the Trash (`.locator('button').last()`), confirm `Delete` in the dialog titled `Delete Account`. `No accounts yet` returns. Screenshot `accounts-<id>-deleted.png`.
- **Investments entry.** Run `await page.goto('/app/investments')`. The standalone Investments page renders with its own `h1` `Investments` (a fresh user also shows `No investment plans yet`). Screenshot `accounts-<id>-investments.png`.

## Gotchas

- Row buttons expose accessible names `Edit <name>` / `Delete <name>`; position within the row (first = edit, last = delete) also works — scope to the row matched by text first.
- Type defaults to Checking; currency defaults to the Settings base currency (USD for a fresh user) — don't assume the dropdowns need driving.
- The dialog submit button shares its name (`Add Account`) with the page opener — always scope it under `[data-slot="dialog-content"]`.
- `/app/investments` is a separate entry point in the map: verifying `/app/accounts` does not cover it.
