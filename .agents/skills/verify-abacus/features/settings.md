# Settings

Settings holds the user's preferences and data tools: the base currency used
by all reports and summaries, the theme (Light / Dark / System), JSON export
and import of all data, and the signed-in account with sign-out.

## Sub-features

- `settings-currency` changes the base currency used by reports and summaries.
- `settings-theme` switches between Light, Dark, and System appearance.
- `settings-export` downloads a full JSON export and reports success.
- `settings-import` restores a JSON export (replacing existing data) with success or failure feedback.
- `settings-signout` ends the session and returns to the auth page.

## How to get to it (user POV)

- Nav link `Settings` → `/app/settings` (desktop sidebar at the bottom; on mobile under `More`).
- The `Sign Out` button on the Settings page.

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. `test` user; seed some rows first (see `../_seed-recipes.md`) if you want the export/import round-trip to carry data.

- **Sections.** Run `await page.goto('/app/settings')` and wait for the `h1` `Settings` (lazy chunk). The cards `Base Currency`, `Theme`, `Data Management`, `Account` (with the user's email), and `About Abacus` are visible. Screenshot `settings__app-settings__sections.png` + ARIA snapshot.
- **Base currency.** In the `Base Currency` card open its `[data-slot="select-trigger"]` and pick `EUR`. The trigger shows `EUR`. Screenshot `settings-currency__app-settings__eur.png`.
- **Theme.** Choose `Dark`, then `Light`. The chosen button switches to the filled (default) variant; `Dark` puts class `dark` on the document root and `Light` removes it (`System` follows the OS preference). Screenshot `settings-theme__app-settings__dark.png`.
- **Export.** Choose `Export Data` and capture the browser download (`page.waitForEvent('download')`). The file name matches `abacus-export-YYYY-MM-DD.json`, the file parses as JSON, and `Data exported successfully` is visible. Screenshot `settings-export__app-settings__success.png`.
- **Import.** Choose `Import Data`, then set the hidden file input (`page.locator('input[type="file"]')`) to the exported file. The dialog shows `Import successful` and `Imported N accounts, N transactions.`; choose `Done`. Screenshot `settings-import__app-settings__success.png`.
- **Sign out.** Choose `Sign Out`. URL is `/auth` and the sign-in form is visible. Screenshot `settings-signout__app-settings__signed-out.png`.

## Gotchas

- Settings is lazy-loaded — wait for the `h1`, not just the URL.
- The import file input is hidden inside a label — drive it with `setInputFiles`; clicking "Click to select a JSON export file" alone opens the OS picker, which Playwright cannot drive.
- Import replaces ALL existing data and the dialog warns so — do it last, or inside a throwaway `test` user (the fixture deletes the user and its rows afterwards).
- Theme buttons are named `Light` / `Dark` / `System` (capitalized) and have no `aria-pressed` — assert the filled variant or the root `dark` class instead.
- Export is a real browser download — prove it via the `download` event and the file contents; the on-page text alone proves only the status line.
