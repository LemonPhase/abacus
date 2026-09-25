---
name: verify-abacus
description: "Drive the real Abacus personal-finance app (React SPA on Vite + local Supabase) through its Playwright harness and prove user-facing behavior with evidence. Use for /verify-abacus, 'verify abacus', 'prove this feature works', 'drive the app', or any request to validate abacus behavior against the running app instead of unit tests."
---

# Verify Abacus

Abacus is a React 19 SPA (Vite, port 5173) backed by a local Supabase stack
(Docker: GoTrue 54321, Postgres 54322, Mailpit 54324). The web UI is the
primary surface; Tauri desktop and the PWA wrap the same frontend and are not
driven separately. The harness is the repo's own Playwright suite in `e2e/` —
its fixtures provision a fresh confirmed user per test via the GoTrue admin
API and clean up by user deletion (FK cascade wipes the user's rows).

Read `features/README.md` first, then the feature file(s) you are proving.
Before seeding any DB state, read `features/_seed-recipes.md` — the schema's
NOT NULLs and derived columns are not guessable.

## Launch

1. Supabase stack (Docker must be running): ready when `npx supabase status
-o env` prints `API_URL="http://127.0.0.1:54321"` and
   `PUBLISHABLE_KEY` / `SERVICE_ROLE_KEY`. If not, ONE stack owner runs
   `npx supabase start` — in multi-agent runs only the designated owner
   starts/stops the shared stack; everyone else waits and retries.
2. `.env` must contain `VITE_SUPABASE_URL=http://127.0.0.1:54321` and
   `VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from supabase status>`.
3. Start the app: `npm run dev -- --port 5173 --strictPort` — ready when
   `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173` returns `200`.
   **Or skip step 3**: `npx playwright test` auto-starts this exact server via
   `webServer` in `playwright.config.ts` and stops it when the run ends.
4. Isolation: set `E2E_PORT` to a free port for a second dev server (parallel
   worktrees). Exactly one Supabase stack per machine — never start a second.

Teardown: Playwright stops the server it started. If you started
`npm run dev` yourself, kill that exact PID (record it at launch). Never kill
by process name.

## Doctor

Run `scripts/doctor.sh` (read-only) whenever anything looks off. It checks:
Supabase stack up with keys, `.env` matches the stack URL, `node_modules`
present, and the app port either answering or free. Exit `0` = worth driving,
`1` = fix the reported line first. Invocation is exactly:

```bash
.agents/skills/verify-abacus/scripts/doctor.sh [port]   # default port 5173
```

## Drive

Write ONE throwaway spec at `e2e/verify-scratch-<slice>.spec.ts` where `<slice>`
is your short feature name (e.g. `transactions`) — the suffix keeps parallel
verification runs from clobbering each other. Clearly marked verification
scaffolding — delete it in cleanup. Run:

```bash
E2E_PORT=5173 npx playwright test e2e/verify-scratch-<slice>.spec.ts --reporter=list
```

Multi-feature runs: one scratch spec is fine for several feature files — one
test per sub-feature, artifacts named per the Evidence template.

Readable harness files: `e2e/fixtures.ts` and `e2e/mailpit.ts` (the Mailpit
helper fetches recovery emails from `http://127.0.0.1:54324`). Import fixtures
from `./fixtures`:

- `test` — authenticated: creates a confirmed `e2e-*@test.local` user, seeds a
  real session, exposes `userSupabase` (a PostgREST client signed in as the
  test user — use it for read-only DB second views and fast seeding). User is
  deleted after the test; FK cascade removes that user's rows.
- `publicTest` — unauthenticated, for `/`, `/auth`, `/auth/reset-password` and
  AuthGuard redirect checks.
- `expect` — re-exported Playwright expect.

Skeleton:

```ts
import { test, expect } from './fixtures'

test('verify accounts-create', async ({ page, userSupabase }) => {
  await page.goto('/app/accounts')
  // ...drive per the feature file...
  await page.screenshot({ path: `${process.env.VERIFY_EVIDENCE}/accounts-create.png` })
})
```

Stable handles used across the app (prefer these over DOM position):

- Dialogs: `[data-slot="dialog-content"]`; selects: `[data-slot="select-trigger"]`
  then `[data-slot="select-content"][data-open] [data-slot="select-item"]`.
- Row actions (table pages — accounts, transactions):
  `page.locator('tr', { hasText: '<name>' }).locator('button')` (first = edit
  Pencil, last = delete Trash2). Budgets are CARDS, not rows — scope via
  `getByRole('heading', { level: 3, name })` → ancestor `.rounded-xl`.
- Page headings: `getByRole('heading', { level: 1 })`.
- Form fields by id: `acct-name`, `acct-balance`, `budget-name`, `budget-amount`,
  `budget-date`, `email`, `password`, `confirm-password`. Transaction dialog
  labels: Type / Account / Category / Amount / Date / Description; submits are
  `Add Transaction` / `Save`, delete confirm is `Delete Transaction`.
- Reports/Settings are lazy-loaded: wait for the h1, not just the URL.

## Evidence

Write artifacts to `.agents/skills/verify-abacus/evidence/<slice>/` (create it
first; pass it to the spec as `VERIFY_EVIDENCE`). Name every artifact
`<feature>__<route>__<state>.<ext>` — e.g.
`tx-create__app-transactions__created.png` — where `state` is what you just
did or observed. Keep artifacts after cleanup. Proof standards:

- Drive the real user path through the UI — not internal setters, not
  test-only endpoints. `userSupabase` is for _seeding and read-back_, not for
  acting instead of the UI.
- Capture the action AND the resulting state (screenshot + ARIA snapshot of
  the state after), not just a final screen.
- Verify side effects with a read-only second view: e.g. after adding an
  account, read the row back via `userSupabase.from('accounts').select()`.
- Mocks only where a production boundary isolates the external system. Here
  that is none: auth, DB, and email are real local services. Emails are read
  from Mailpit (`http://127.0.0.1:54324/api/v1`, see `e2e/mailpit.ts`).
- Record the feature ID and entry-point route in each artifact's name (the
  `<feature>__<route>__<state>` template is the convention — one naming rule,
  not two).
- Wait for data-driven transitions (≤500ms: budget bars, chart entry) to
  settle before asserting computed visual state — mid-transition colors are
  not real state.

## Cleanup

1. Fixtures delete the test user automatically (FK cascade wipes its rows) —
   for `publicTest` runs that created users manually, call `deleteTestUser` /
   `deleteUserByEmail` in a `finally`.
2. Delete `e2e/verify-scratch-<slice>.spec.ts`.
3. Stop only what you started (exact PID), or let Playwright stop its
   webServer.
4. NEVER delete or move the `evidence/` directory — proof survives teardown.

## Helpers

- `scripts/doctor.sh [port]` — read-only health check (see Doctor above).
  Executable; run exactly as shown.

After a successful proof, point the user at `/maintain-verification-skill` for
keeping `features/` honest as the app changes.
