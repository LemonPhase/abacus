# AGENTS.md

## Build & typecheck

- `npm run build` runs `tsc -b && vite build` — typecheck must pass before bundling.
- `npm run lint` runs `eslint .`
- `npm run dev` starts Vite on port 5173.

## Testing

- **Unit tests**: `npm test` (vitest run, jsdom env, auto global `fake-indexeddb` via `src/test/setup.ts`).
- **Single test**: `npx vitest run path/to/file.test.ts`
- **Watch mode**: `npm run test:watch`
- **E2E tests**: `npm run test:e2e` (Playwright, chromium only). Requires dev server running at localhost:5173 — config auto-starts it but `reuseExistingServer: true` means it uses an already-running server when available. E2E tests live in `e2e/` and are excluded from vitest.
- Unit test setup auto-monkeypatches IndexedDB — do not import `fake-indexeddb` manually in test files.

## Architecture

- **React 19 + React Router v7** SPA. 8 page routes in `src/pages/`, each named after the feature.
- **Tauri v2 desktop wrapper** (`src-tauri/`). Frontend build output is `dist/`. Tauri commands via `npm run tauri`.
- **Dexie.js IndexedDB** (`src/db/`) — 6 tables: accounts, categories, transactions, budgets, exchangeRates, investmentPlans. Schema version 2. Default categories are seeded on first DB open (via `db.on("ready")` hook).
- **Zustand stores** in `src/stores/` — one per domain.
- **shadcn/ui** components in `src/components/ui/` (base-nova style, icon library: lucide-react).
- **PWA** via `vite-plugin-pwa` with auto-registering service worker.

## Path aliases & conventions

- `@/` maps to `src/` in vite, vitest, and tsconfig.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- `noUnusedLocals` and `noUnusedParameters` are on.
- Use the `cn()` helper from `src/lib/utils.ts` for className merging (clsx + tailwind-merge).

## Tailwind CSS v4

- No `tailwind.config.js`. Configuration lives in CSS via `@import "tailwindcss"` and `@theme` blocks in `src/index.css`.
- Uses the `@tailwindcss/vite` Vite plugin (not PostCSS).

## CSS & icons

- `@fontsource-variable/geist` for typography.
- `lucide-react` for icons.
- `tw-animate-css` for animation utilities.
