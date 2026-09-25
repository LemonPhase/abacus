# Budgets

Budgets lets a user set spending limits per category for a month or year, see
each budget's progress bar (jade under 50%, cinnabar when overspent), and edit
or delete budgets in place. Budgets render as **cards**, not table rows.

## Sub-features

- `budgets-create` adds a budget with name, period, amount, start date, and at least one category.
- `budgets-edit` changes amount or period of an existing budget.
- `budgets-delete` removes a budget behind a confirm dialog.
- `budgets-progress` shows spent-vs-limit state per budget.

## How to get to it (user POV)

- Sidebar `Budgets` → `/app/budgets` (desktop sidebar, mobile bar tab).
- The `Add Budget` button on the page. (The FAB is `Add Transaction` on every page — see [navigation](./navigation.md).)

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. `test` user with at least one **expense** category seeded via `userSupabase` (see `../_seed-recipes.md`) so the dialog's category checkbox list is non-empty.

- The dialog (`[data-slot="dialog-content"]`, title `Add Budget` / `Edit Budget`) contains, in order: `input#budget-name`, a Period select (`Monthly` / `Yearly`), `input#budget-amount` (number) and `input#budget-date` (date, Start Date), then a **Categories checkbox list** (one checkbox per expense category, label text = category name). Required fields (`Name`, `Amount`, `Categories`) carry a `*` marker (aria-hidden); `Name` and `Amount` also expose `aria-required` — the `Categories` checkbox group has the marker only, no `aria-required`. When creating with existing budgets present, a `Subtract from existing budget` checkbox appears at the bottom; its source-budget select renders only once the checkbox is checked, preselecting the first existing budget (the `Select a budget...` placeholder never shows on this path — assert the trigger shows the budget's name). That select picks the _source budget to subtract from_, it is NOT the category picker.

Budget cards: locate the card via its title heading, then the two icon buttons inside — `Edit budget` (Pencil) and `Delete budget` (Trash2) — or by position (first/last):

```ts
const card = page
  .getByRole('heading', { level: 3, name: 'Monthly Food' })
  .locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]')
```

- **Open dialog.** Run `await page.goto('/app/budgets')`, then `await page.getByRole('button', { name: 'Add Budget' }).click()`. Dialog visible with `h2` heading `Add Budget` (the heading and the page button share the name — assert the heading, click the button).
- **Create.** Fill `input[id="budget-name"]` (`Monthly Food`), pick Period `Monthly` in the select, fill `input[id="budget-amount"]` (`400`) and `input[id="budget-date"]`, then check the category checkbox(es): `page.getByRole('checkbox', { name: '<category name>' }).check()`. Submit via `page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Add Budget' }).click()`. Dialog closes and the `Monthly Food` card is visible. Screenshot `budgets__app-budgets__created.png` + ARIA snapshot.
- **Side effect.** `(await userSupabase.from('budgets').select()).data` contains the row with amount 400, and `userSupabase.from('budget_categories').select().eq('budget_id', <id>)` shows the link to the checked category (the `budgets` table has no category column — links live in `budget_categories`, see `../_seed-recipes.md`).
- **Edit.** In the `Monthly Food` card choose the Pencil (`card.locator('button').first()`), change `budget-amount`, pick Period `Yearly`, `Save`. The card shows the updated amount. Screenshot `budgets__app-budgets__edited.png`.
- **Progress.** With seeded spending in the linked categories (see `../_seed-recipes.md`), the card shows `spent of limit` and a progress bar. Wait for the bar's 500ms transition to settle before reading colors. Screenshot `budgets__app-budgets__progress.png`.
- **Delete.** In the card choose the Trash (`card.locator('button').last()`), confirm `Delete` in the dialog. The card is gone. Screenshot `budgets__app-budgets__deleted.png`.

## Gotchas

- Budgets are cards, not rows — there is no `<tr>` on `/app/budgets`. Never use the table row recipe here.
- A budget needs **at least one category**: once name and amount are filled with none checked the form shows `Select at least one category.`, and submit stays blocked without one. Check a category checkbox.
- The `Select a budget...` placeholder belongs to the optional "Subtract from existing budget" source picker — ignore it for category selection (and don't wait for it: see the subtract-select note above).
- The category list only contains **expense** categories; income categories never appear.
- Budget bars animate (`transition-all duration-500`) — assert computed colors only after they settle, or you will read mid-transition values and report a false bug.
- Edge copy: at exactly 0 remaining the summary reads `Over budget by $0` (known app issue) — assert the numbers, not that phrase.
- The card icon buttons expose `Edit budget` / `Delete budget` (not per-row names) — scope to the card first; position (first/last) also works.
