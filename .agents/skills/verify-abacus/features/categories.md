# Categories

Categories organizes income and expense categories in a two-tab list
(Expenses / Income). Each category has a name, type, color, and optional icon
and parent; rows show colored icons, subcategories render indented under their
parent with a `Subcategory` badge, and rows can be reordered, edited, and
deleted.

## Sub-features

- `cat-create` adds a category of the active tab's type through the dialog.
- `cat-edit` changes name, type, color, icon, or parent in place.
- `cat-delete` removes a category behind a confirm dialog.
- `cat-reorder` moves a category up or down within its list.
- `cat-subcategory` nests a category under a parent of the same type.
- `cat-empty` shows the per-tab empty state when the type has no categories.

## How to get to it (user POV)

- Nav link `Categories` → `/app/categories` (desktop sidebar; on mobile under `More`).
- The `Add Category` button on the page.
- The `Manage categories` link on the Transactions page.

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. Fresh `test` user (both tabs empty).

- **Empty state.** Run `await page.goto('/app/categories')` (lazy — wait for the `h1`). `No categories yet. Add one to get started.` is visible under the `Expenses` tab. Screenshot `cat-empty__app-categories__empty.png`.
- **Create.** Choose `Add Category`. Run `await page.getByRole('button', { name: 'Add Category' }).click()`, fill `input[id="cat-name"]` (`Groceries`), submit via `page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Add Category' }).click()`. The dialog closes and the `Expenses` list shows `Groceries`. Screenshot `cat-create__app-categories__created.png` + ARIA snapshot.
- **Side effect.** Read the row back: `(await userSupabase.from('categories').select('name, type').eq('name', 'Groceries')).data` has exactly one row of type `expense`.
- **Edit.** In the `Groceries` row choose the Pencil (row buttons in order: Move up, Move down, Edit, Delete — `.locator('button').nth(2)`), change `cat-name` to `Food`, choose `Save`. `Food` is visible. Screenshot `cat-edit__app-categories__edited.png`.
- **Reorder.** Create a second expense category (`Rent`) — it appends below `Food`. In the `Rent` row choose the button named `Move Rent up`, then reload — `Rent` renders above `Food`. Screenshot `cat-reorder__app-categories__reordered.png`.
- **Subcategory.** Choose `Add Category`, fill `cat-name` (`Coffee`), pick `Food` in the `Parent Category` select, submit. `Coffee` renders indented under `Food` with a `Subcategory` badge. Screenshot `cat-subcategory__app-categories__nested.png`.
- **Delete.** In the `Coffee` row choose the Trash (`.locator('button').last()`), confirm `Delete` in the dialog titled `Delete Category`. `Coffee` is gone. Screenshot `cat-delete__app-categories__deleted.png`.

## Gotchas

- The dialog submit shares its name (`Add Category`) with the page opener — always scope it under `[data-slot="dialog-content"]`. Editing submits `Save`.
- Move up/down expose `Move <name> up` / `Move <name> down` labels, but Edit and Delete are bare icon buttons — use position (nth(2) = edit, last = delete), scoped to the row matched by text.
- The `Parent Category` select renders only when a root category of the same type exists; its first item is `None (root category)`.
- Changing Type in the dialog resets the parent and only offers parents of the newly chosen type.
- Color swatches and icon-grid buttons are bare/named-by-title buttons — pick by `title` (icons) or position (colors), or skip (a default color is preselected).
- `Add Category` creates into the currently active tab's type, and the tab switches to the saved type after save.
- Reordering persists immediately (the swap is written to the DB) but the list does NOT re-sort in place — reload or navigate away and back to observe the new order. A click with no reload looks like a no-op (product gap, reported 2026-09-25).
- The submit is disabled until the name is non-empty — there is no error message, don't wait for one.
