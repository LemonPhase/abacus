# Dashboard and Reports

Dashboard summarizes the user's money (Net Worth on the premium card, Income
and Expenses cards, Income vs Expenses chart, Spending by Category donut,
Recent Transactions). Reports shows the deeper chart set. Both are real-time
and multi-currency-aware.

## Sub-features

- `dash-networth` computes net worth from account balances.
- `dash-income-expense` shows period income and expense cards.
- `dash-charts` renders Income vs Expenses and Spending by Category with data.
- `dash-recent` lists the most recent transactions.
- `reports-charts` renders the Reports chart set for the selected range.

## How to get to it (user POV)

- Sidebar `Dashboard` → `/app/dashboard` (default landing after sign-in).
- Sidebar `Reports` → `/app/reports` (lazy-loaded).

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. `test` user seeded via `userSupabase` (insert shapes: `../_seed-recipes.md`) with an account and dated transactions (e.g. `Monthly salary`, a `Rent` expense, a `Groceries` expense) so cards and charts have data.

- **Net worth.** Run `await page.goto('/app/dashboard')`. `Net Worth` is visible; `page.locator('.rounded-xl', { hasText: /^Net Worth/ }).first()` contains the computed total with `tabular-nums`. Screenshot `dash-<id>-networth.png` + ARIA snapshot.
- **Income / Expenses cards.** `page.locator('.rounded-xl', { hasText: /^Income/ }).first()` and `/^Expenses/` show seeded sums. Screenshot `dash-<id>-cards.png`.
- **Charts.** `Income vs Expenses` is visible and `No transaction data yet` is NOT; `page.locator('.recharts-wrapper').first()` is visible. `Spending by Category` shows `Rent` and `Groceries` legend entries. Screenshot `dash-<id>-charts.png`.
- **Recent transactions.** `Recent Transactions` lists `Monthly salary`.
- **Reports.** Run `await page.goto('/app/reports')` and wait for the `h1` (lazy chunk). `Income` is visible and the recharts wrappers render. Screenshot `reports-<id>-charts.png`.
- **Side effect.** All figures must match a read-only recount from `userSupabase` (`transactions`, `accounts`) within the shown rounding.

## Gotchas

- Reports/Settings chunks are lazy — URL change alone does not mean render. Wait for the heading.
- Card locators match by text prefix (`.rounded-xl` + `hasText`) — always `.first()` to avoid nested cards.
- Charts mount empty before data arrives (`No transaction data yet` state) — assert the empty-state text is gone before snapshotting.
- Charts animate on data arrival — capture and assert computed state after they settle (≤500ms).
- Base currency (Settings) converts amounts; if the user changed it, computed expectations change with it.
