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

## Design System

The master design reference is `DESIGN.md` at the repo root. **Read it before adding any new visual element.** The design tokens are implemented in `src/index.css` via Tailwind v4 `@theme inline` and CSS custom properties on `:root` / `.dark`.

The aesthetic is **Modern Zen** — minimalist architectural precision with warm paper-and-ink tones, a dot-grid background, and Geist Variable typography. No cool grays, no blue tones, no drop shadows.

### Color rules (CRITICAL — enforced by ESLint `design-system/no-hardcoded-colors`)

| Context                                                                    | How to apply color                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI chrome** (buttons, cards, borders, text, backgrounds)                 | Use Tailwind semantic classes ONLY: `bg-primary`, `text-muted-foreground`, `border-border/30`, `bg-card`, `text-destructive`, etc.                                                                       |
| **Chart / data-vis color** (Recharts `fill`, `stroke`, pie/donut segments) | Import from `@/lib/chartColors.ts`. Use `INCOME_COLOR`, `EXPENSE_COLOR`, `CHART_COLORS`, `GROWTH_COLORS`, etc. These constants use `var(--token)` references so charts automatically adapt to dark mode. |
| **Category default/fallback**                                              | Use `DEFAULT_CATEGORY_COLOR` from `@/lib/chartColors.ts` (hex — this is data, not styling).                                                                                                              |
| **Category picker swatches**                                               | Use `CATEGORY_PICKER_COLORS` from `@/lib/chartColors.ts` (hex — user-selected values stored in DB).                                                                                                      |
| **Investment type colors**                                                 | Use `INVESTMENT_TYPE_COLORS` from `@/lib/chartColors.ts` (CSS var refs — auto-adapt to theme).                                                                                                           |

**Never hardcode a hex, rgb(), or hsl() value in any component, page, store, hook, or service file.** This is automatically enforced by ESLint (`design-system/no-hardcoded-colors: error`). The only files allowed to contain raw hex values are:

- `src/index.css` (design token definitions)
- `src/lib/chartColors.ts` (JS constants mirroring the CSS tokens)

### Semantic accent colors

- **Jade** (`--jade`, `bg-jade`, `text-jade`): income, positive balances, growth, budget bars under 50%. **Never** use for structural UI.
- **Cinnabar** (`--cinnabar`, `bg-cinnabar`, `text-cinnabar`): expenses, negative amounts, overspending, destructive indicators. **Never** use for structural UI.
- **Structural palette** (`primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`): all UI chrome. These use warm earth/paper tones — **never** cool grays or blue tones.

### Adding a new chart/data color

1. **For chart colors** (used in Recharts `fill`/`stroke`/`Cell`): add a `var(--token)` entry to the relevant array in `@/lib/chartColors.ts`. Ensure the `--token` is defined in both `:root` and `.dark` blocks in `src/index.css`.
2. **For picker/fallback colors** (user data stored in DB): add a hex value constant to `@/lib/chartColors.ts`.
3. If the color should also be available as a Tailwind utility, add a `--color-<name>` mapping in the `@theme inline` block AND the `:root` / `.dark` CSS custom properties in `src/index.css`.
4. Run `npm run build && npm run lint` to verify no errors.

### Typography

- **Sole typeface**: Geist Variable (imported via `@fontsource-variable/geist` in `src/index.css`).
- `tabular-nums` class on **all** monetary values, percentages, dates (financial data = tabular numerals, always).
- Headings use `tracking-tight` (tight tracking: -0.025em). Labels use `tracking-wide` (wide tracking: 0.025em).
- Use the `stat-number` utility class for large stat values (1.5rem, semibold, tnum).
- **Never** combine tight and wide tracking on the same text element.
- Hierarchy: Heading XL (1.875rem, landing hero), Heading LG (1.5rem, page titles), Heading MD (1rem, card headers), Body LG (1rem, form labels), Body MD (0.875rem, buttons/nav/inputs/tables), Body SM (0.75rem, metadata/badges), Label SM (0.6875rem, mobile nav only).

### Radius scale

- Interactive elements (buttons, inputs, badges, tabs, selects): `rounded-lg` (4px).
- Containers (cards, dialogs, popovers): `rounded-xl` (12px).
- Pill shapes (FAB, progress bars): `rounded-full`.
- Checkboxes: fixed 4px radius. Sheet panels: zero radius on anchored edge.

### Elevation — tonal layering, NOT drop shadows

- **Surface (flat)**: Cards, stat panels, chart containers → `border border-border/30` on card bg. **No shadow.**
- **Premium surface**: Primary stat card (Net Worth) → solid black/primary bg with white text. Exactly one per page.
- **Raised**: Dropdowns, selects, popups → `shadow-md` + border pattern.
- **Elevated**: Sheets, tooltips, error banners → `shadow-lg`.
- Depth comes from tonal surface layering (paper stack: background → card → popover), not drop shadows on cards.

### Component class recipes

When creating these components, use these exact Tailwind classes:

**Card** (standard):

```
bg-card text-card-foreground rounded-xl border border-border/30 p-card
```

(where `p-card` maps to 1.25rem padding via `@theme` spacing)

**Button** (all variants share geometry):

```
h-8 px-2.5 rounded-lg text-sm font-medium
```

Variants: `primary` (bg-primary text-primary-foreground), `secondary` (bg-secondary text-secondary-foreground), `outline` (border border-border bg-transparent), `ghost` (bg-transparent), `destructive` (bg-destructive text-destructive-foreground).

**Input**:

```
h-8 px-2.5 rounded-lg bg-transparent border border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring
```

**Badge**:

```
h-5 px-2 py-0.5 rounded-lg text-xs font-medium
```

Variants: `default` (bg-primary text-primary-foreground), `destructive` (bg-destructive text-destructive-foreground).

**Dialog** overlay: `bg-black/5` backdrop. Panel: `bg-card rounded-xl border border-border/30`. Footer: `border-t border-border/60` with right-aligned actions.

### Layout conventions

- **App shell**: Fixed sidebar (14rem, `h-screen`) + scrollable right column (`overflow-y-auto`). `h-screen overflow-hidden` on outer container. The right column (header + content) scrolls independently — sidebar is always visible.
- **Content max-width**: 1400px, centered. Padding: 1rem mobile, 1.5rem desktop.
- **Section gaps**: `gap-6` (1.5rem). Card internal padding: `p-5` (1.25rem). Card internal gaps: `gap-4` (1rem).
- **Form field / button group gaps**: `gap-2` (0.5rem).
- **Mobile nav**: Fixed bottom bar (64px) visible only on mobile. Content area needs `pb-20` (5rem) bottom padding to prevent overlap.

### Background pattern

The body has a subtle dot-grid pattern (graph paper aesthetic): 0.7px circular dots at 12% charcoal opacity on a 24px grid via CSS `radial-gradient` with `fixed` attachment. Dark mode uses 8% warm-white dots. Opaque surfaces (cards, sidebar, header) paint over it naturally.

### Animation

- Interactive transitions (hover, focus): **200ms**.
- Dialog open/close: **100ms** (fade + zoom).
- Data-driven (budget bars, chart transitions): **500ms max**.
- Page entry: fade in + slide up 0.5rem over 200ms.
- Button press: 1px downward translate on `:active`.
- Icon hover: 110% scale, 200ms transition.
- Card hover: border intensifies from 30% to 10% primary tint.
- **Never** exceed 500ms for any animation. Use `tw-animate-css` utilities where possible.

### Dark mode

- Toggle class `dark` on `<html>`. Tailwind variant: `@custom-variant dark (&:where(.dark, .dark *))`.
- Every design token has a light and dark value in `src/index.css`.
- Charts auto-adapt via `var(--token)` references — no manual dark mode handling needed for data-vis colors.
- Dark mode borders use translucent overlays (e.g., `rgba(208, 196, 190, 0.12)`), not the same opacity as light mode.
- Maintain 4.5:1 contrast for body text in both modes.

### Do's and Don'ts

| Do                                                                 | Don't                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Use warm paper token system for all UI chrome                      | Introduce cool grays or blue-toned colors into structural elements  |
| Use thin borders (`border-border/30`) on cards                     | Use ring outlines or drop shadows on cards                          |
| Reserve jade for positive financial values                         | Use jade or cinnabar for decoration or structural chrome            |
| Use tabular numerals for all monetary values, percentages, dates   | Use proportional numerals for financial data                        |
| Use tight tracking on headings, wide on uppercase labels           | Combine tight and wide tracking on the same element                 |
| Use fixed-sidebar + scrollable-content layout                      | Make the entire page scroll — only the right content column scrolls |
| Provide full dark mode support                                     | Assume light mode border opacities work in dark mode                |
| Use 200ms for interactive, 100ms for dialogs, 500ms for data anims | Exceed 500ms for any animation                                      |
| Pair jade/cinnabar with +/- signs for accessibility                | Rely solely on color to convey financial meaning                    |

### ESLint enforcement

The `design-system/no-hardcoded-colors` rule (error level) catches any hex, rgb(), rgba(), hsl(), or hsla() values in `src/**/*.{ts,tsx}` files (excluding `src/index.css`, `src/lib/chartColors.ts`, and test files). If lint fails with this error, the fix is:

- For UI styling → use a Tailwind semantic class
- For charts/data-vis → import a constant from `@/lib/chartColors.ts`
- For new design tokens → add to `src/index.css` and `src/lib/chartColors.ts` first
