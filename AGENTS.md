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
- **Supabase** backend (`@supabase/supabase-js`). Auth is mandatory — all routes except `/auth` and `/reset-password` are behind `AuthGuard` (`src/auth/auth.tsx`). Client configured in `src/supabase/client.ts`.
- **Database schema** source of truth: `supabase/migrations/`. Use `npm run db:push` to apply migrations to the remote database. 6 tables: `accounts`, `categories`, `transactions`, `budgets`, `exchange_rates`, `investment_plans`. All tables have RLS via `auth.uid() = user_id`. A `maintain_account_balance` trigger on `transactions` keeps account balances in sync. Generated types in `src/supabase/database.types.ts`.
- **Realtime**: Supabase Realtime subscriptions via `src/supabase/realtime.ts` — `subscribeToTable(table, handler)` wraps Postgres changes channels.
- **Tauri v2 desktop wrapper** (`src-tauri/`). Frontend build output is `dist/`. Tauri commands via `npm run tauri`.
- **Zustand stores** in `src/stores/` — one per domain: `accountsStore`, `budgetsStore`, `categoriesStore`, `investmentPlansStore`, `transactionsStore`, `settingsStore`.
- **shadcn/ui** components in `src/components/ui/` (base-nova style, icon library: lucide-react).
- **PWA** via `vite-plugin-pwa` with auto-registering service worker.
- **Charts**: `recharts` for visualization. **CSV**: `papaparse` for import/export.

## Code conventions & practices

### Layer boundaries

Directories have strict purpose. Placing a file in the wrong layer is a bug.

| Directory         | Allowed                                                         | NOT allowed                                                |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/lib/`        | Pure functions, no side effects, no React, no Supabase client   | DB queries, `fetch()`, React imports, mutable global state |
| `src/services/`   | Functions with side effects: DB calls, external APIs, file I/O  | React imports, Zustand stores                              |
| `src/supabase/`   | Supabase infra: client init, generated types, realtime channels | React components (moved to `src/auth/`)                    |
| `src/stores/`     | Zustand domain stores, one per Supabase table + `settingsStore` | UI logic, React hooks (use selectors instead)              |
| `src/auth/`       | Auth provider, `useAuth` hook, `AuthGuard`                      | Supabase client init                                       |
| `src/components/` | Shared domain-agnostic components                               | Page-specific logic (colocate with the page)               |
| `src/pages/`      | Route entry points + colocated domain features                  | Shared business logic (put in lib/services/stores)         |
| `src/types/`      | Shared domain types (`Account`, `Transaction`, etc.)            | Component prop types (define alongside the component)      |

### Store pattern

All Supabase-backed CRUD stores **must** use `createCrudSlice` from `@/stores/crudStore`.

```ts
const crud = createCrudSlice<DomainType>({
  table: 'table_name', // from Database['public']['Tables']
  collectionKey: 'items', // state key, e.g. 'accounts', 'plans'
  order: { column: 'date', ascending: false }, // optional
  prependInsert: true, // optional — new items go to front
  mapRow: (row) => mapRow(row as RowType),
})

export const useXxxStore = create<XxxState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    items: [], // initial empty array
    ...base, // load, remove, getById, unsubscribe, clearError
    add: (data) => _add(mapKeysToSnake(data) as Database['public']['Tables']['...']['Insert']),
    update: (id, data) =>
      _update(id, mapKeysToSnake(data) as Database['public']['Tables']['...']['Update']),
    // domain-specific selectors:
    getByX: (x) => get().items.filter((i) => i.x === x),
  }
})
```

- `_add` / `_update` accept snake_cased `Record<string, unknown>`. Wrappers provide type safety.
- Custom add/update logic (defaults, null coercion) lives in the wrapper, not the factory.
- Selectors use `get()` for synchronous lookups — never derive state in components.
- The factory handles: loading state, error management, realtime subscriptions, optimistic updates, duplicate guards, cleanup.

### Page structure

- Route entry point: `src/pages/PageName.tsx` (default export).
- If a page has dialogs, filter bars, or lists > ~30 lines, extract them to `src/pages/pagename/`.
- Extracted components follow the **dumb dialog** pattern: all state and callbacks live in the page, the dialog is purely presentational with props.
- Subfolder files use relative imports for siblings (`./constants`, `./Component`). Top-level pages use `@/pages/pagename/` for subfolder imports.

### Testing conventions

```
src/test/
├── setup.ts              # Global mocks: Supabase, ResizeObserver, matchMedia
├── supabase-mock.ts      # In-memory Supabase client mock
├── stores/               # Store-level tests
├── lib/                  # Pure utility tests
├── components/           # Shared component tests
├── auth/                 # Auth tests
└── pages/                # Page-level tests
```

- Tests mirror the source directory structure.
- **Tests are not optional.** Any change that introduces a store, service function, component with logic, or new page behavior must include corresponding tests before the work is considered done.
- Every non-trivial component (has logic, not just JSX) should have at minimum a smoke test.
- Store tests use the real Zustand stores with mocked Supabase (no DB needed).
- `jsdom` environment — `window.matchMedia` and `ResizeObserver` are mocked globally in `setup.ts`.
- Before marking work complete, verify: `npm test` and `npm run build` both pass.
- If you refactored existing code, run the related test files to confirm nothing regressed:
  `npx vitest run src/test/<domain>/<file>.test.ts`

### Type conventions

- Domain types in `src/types/index.ts` must reflect **post-mapping** state. After `mapRow` converts timestamp strings to `Date`, the type must be `Date`, never `Date | string`.
- Use `verbatimModuleSyntax` — import types with `import type`.
- `noUnusedLocals` and `noUnusedParameters` are enforced. Unused vars fail the build.
- `erasableSyntaxOnly` — no `enum`, no `namespace`.
- Supabase `Insert`/`Update` type casts (`as Database['public']['Tables']['...']['Insert']`) are acceptable only within store wrappers.

### Imports

- **Always use `@/`** for cross-directory imports.
- **Relative imports** only for same-directory siblings (e.g., `./constants`, `./Dialog`).
- Barrel files are discouraged unless the module exports 5+ symbols.
- Use `cn()` from `@/lib/utils.ts` for merging className strings (clsx + tailwind-merge).

### Adding a new feature (checklist)

1. Types: add domain interface + `New*` type to `src/types/index.ts`
2. Store: create store using `createCrudSlice`, add custom selectors
3. Page: create route component in `src/pages/`, extract dialogs to subfolder
4. Test: add tests in `src/test/pages/` and/or `src/test/stores/`
5. Route: add to `src/App.tsx` inside `AuthGuard`
6. Verify: run `npm test && npm run build` — both must pass

## Tailwind CSS v4

- No `tailwind.config.js`. Configuration lives in CSS via `@import "tailwindcss"` and `@theme` blocks in `src/index.css`.
- Uses the `@tailwindcss/vite` Vite plugin (not PostCSS).
- Dark mode uses `@custom-variant dark (&:where(.dark, .dark *));` — add class `dark` to `<html>`.

## CSS & icons

- `@fontsource-variable/geist` for typography.
- `lucide-react` for icons.
- `tw-animate-css` for animation utilities.
