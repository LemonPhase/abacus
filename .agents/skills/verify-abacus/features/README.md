# Abacus verification map

This directory is the maintained source for verifying the user-facing behavior
of Abacus. Read this index before driving the app, then use the matching
feature file as the recipe. Harness: the repo's Playwright suite (`e2e/`).

## Baseline preconditions

- Local Supabase stack is running (`npx supabase start`); `scripts/doctor.sh` reports `OK`.
- `.env` points at `http://127.0.0.1:54321` with the stack's publishable key.
- The app runs at `http://localhost:5173` (or your `E2E_PORT`), started by you or by Playwright's `webServer`.
- Every drive runs inside a `test` fixture from `e2e/fixtures.ts` (fresh confirmed user, session seeded, deleted after) or `publicTest` for signed-out flows.
- Never drive the user's own logged-in browser profile. The harness creates its own context.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names; fall back to the stable handles listed in the SKILL.md (dialog `data-slot`, input ids, row locators).
- Treat every command as literal. Keep quoted names, labels, and routes unchanged. When a recipe contradicts the live app, adapt to the app AND report the drift as a skill issue — never patch the app to match the recipe.
- Run all UI actions through the throwaway spec `e2e/verify-scratch-<slice>.spec.ts` (see SKILL.md Drive). Seed and read DB state only through `userSupabase`, using [\_seed-recipes.md](./_seed-recipes.md) for insert shapes.
- Reports, Settings, Investments, Recurring, and Categories are lazy-loaded: wait for the `h1` heading, not just the URL.
- Clean up fixtures after a mutation (the `test` fixture does this via user deletion). Never remove proof artifacts.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with the page identity (heading/nav) visible.
- Mutation proof includes a read-only second view of the stored value (`userSupabase` select, or Mailpit for emails) — poll it; optimistic updates and dialog closes race the read-back.
- Record the feature ID and entry route in every artifact filename using the `<feature>__<route>__<state>` template from the SKILL.md Evidence section.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path (e.g. `/app/investments` is its own entry point, separate from `/app/accounts`).

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable
handles, required state, commands, and observable proof.

## Shared

- [\_seed-recipes.md](./_seed-recipes.md) — minimal, schema-verified insert shapes for seeding via `userSupabase`. Read before seeding anything.

## Features

- [Auth](./auth.md) — sign in, sign up, sign out, password reset, AuthGuard redirects.
- [Navigation](./navigation.md) — desktop sidebar, mobile tab bar, the More page, and the Add Transaction FAB.
- [Accounts](./accounts.md) — account CRUD and the standalone Investments page.
- [Transactions](./transactions.md) — transaction CRUD, filters, pagination, and the standalone Recurring page.
- [Budgets](./budgets.md) — budget CRUD with amount and period.
- [Dashboard and Reports](./dashboard-reports.md) — net worth, income/expense cards, charts, category breakdown.
- [Categories](./categories.md) — category CRUD, subcategories, and reordering.
- [Settings](./settings.md) — base currency, theme, JSON export/import, sign-out.
