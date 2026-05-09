# AGENTS.md

## Environment

- Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` env vars for Supabase client init.

## Build & typecheck

- `npm run build` runs `tsc -b && vite build` — typecheck must pass before bundling.
- `npm run lint` runs `eslint .` (flat config: `eslint.config.js`).
- `npm run dev` starts Vite on port 5173.

## Testing

- **Unit tests**: `npm test` (vitest run, jsdom env). No real DB — the Supabase client is mocked via `vi.mock` in `src/test/setup.ts` using an in-memory mock (`src/test/supabase-mock.ts`).
- **Single test**: `npx vitest run path/to/file.test.ts`
- **Watch mode**: `npm run test:watch`
- **E2E tests**: `npm run test:e2e` (Playwright, chromium only). Requires dev server at localhost:5173 — config auto-starts it but `reuseExistingServer: true` means it uses an already-running server when available. E2E tests live in `e2e/` and are excluded from vitest (`vitest.config.ts` `exclude: ["e2e/**"]`).
- **Coverage**: `npx vitest run --coverage` (vitest/coverage-v8).

## Architecture

- **React 19 + React Router v7** SPA. 10 page routes in `src/pages/`.
- **Supabase** backend (`@supabase/supabase-js`). Auth is mandatory — all routes except `/auth` and `/reset-password` are behind `AuthGuard` (`src/supabase/auth.tsx`). Client configured in `src/supabase/client.ts`.
- **Database schema** source of truth: `src/supabase/migration.sql`. 6 tables: `accounts`, `categories`, `transactions`, `budgets`, `exchange_rates`, `investment_plans`. All tables have RLS via `auth.uid() = user_id`. Generated types in `src/supabase/database.types.ts`.
- **Realtime**: Supabase Realtime subscriptions via `src/lib/realtime.ts` — `subscribeToTable(table, handler)` wraps Postgres changes channels.
- **Tauri v2 desktop wrapper** (`src-tauri/`). Frontend build output is `dist/`. Tauri commands via `npm run tauri`.
- **Zustand stores** in `src/stores/` — one per domain: `accountsStore`, `budgetsStore`, `categoriesStore`, `investmentPlansStore`, `transactionsStore`, `settingsStore`.
- **shadcn/ui** components in `src/components/ui/` (base-nova style, icon library: lucide-react).
- **PWA** via `vite-plugin-pwa` with auto-registering service worker.
- **Charts**: `recharts` for visualization. **CSV**: `papaparse` for import/export.

## Path aliases & conventions

- `@/` maps to `src/` in vite, vitest, and tsconfig.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- `noUnusedLocals` and `noUnusedParameters` are on — unused code fails the build.
- `erasableSyntaxOnly` is on — no `enum`, no `namespace`.
- Use the `cn()` helper from `src/lib/utils.ts` for className merging (clsx + tailwind-merge).

## Tailwind CSS v4

- No `tailwind.config.js`. Configuration lives in CSS via `@import "tailwindcss"` and `@theme` blocks in `src/index.css`.
- Uses the `@tailwindcss/vite` Vite plugin (not PostCSS).
- Dark mode uses `@custom-variant dark (&:where(.dark, .dark *));` — add class `dark` to `<html>`.

## CSS & icons

- `@fontsource-variable/geist` for typography.
- `lucide-react` for icons.
- `tw-animate-css` for animation utilities.
