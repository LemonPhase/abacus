# Abacus — Personal Finance

A local-first personal finance manager built with React + TypeScript + Tauri.

## Features

- **Dashboard** — overview of accounts, balances, and recent transactions
- **Accounts** — manage checking, savings, credit, investment, and cash accounts
- **Transactions** — track income, expenses, and transfers with multi-currency support
- **Budgets** — monthly or yearly spending limits per category
- **Reports** — spending breakdowns and trends via charts
- **Categories** — income/expense categorization with parent-child hierarchy
- **Investments** — fixed income, index funds, stocks, crypto, etc. with projection tools
- **Settings** — base currency, light/dark theme, CSV import/export
- **PWA** — installable as a standalone web app
- **Tauri desktop** — native Linux/macOS/Windows app

## Tech stack

- React 19, React Router v7, TypeScript 6
- Tailwind CSS v4, shadcn/ui (base-nova), lucide-react
- Dexie.js (IndexedDB) for local persistence
- Supabase for cloud sync & auth
- Zustand for state management
- Recharts for data visualization
- Tauri v2 for desktop builds

## Getting started

```bash
npm install
npm run dev        # Vite dev server at localhost:5173
```

## Local Supabase (dev)

A full local Supabase stack runs via Docker — no cloud rate limits.

**Prerequisites:** Docker, [Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
npx supabase start   # Start local Postgres, Auth, API, Studio
npx supabase stop    # Stop the local stack
```

The `.env` is pre-configured for local dev. To switch back to cloud, comment/uncomment
the `VITE_SUPABASE_*` lines in `.env`.

- **API:** `http://127.0.0.1:54321`
- **Studio:** `http://127.0.0.1:54323` (browse DB, manage auth)
- **Mailpit:** `http://127.0.0.1:54324` (catch auth emails — no email service needed)

The schema in `supabase/migrations/` is applied automatically on first start.
Run `npx supabase db reset` after changing migrations.

## Commands

| Command              | Description                                   |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Start dev server                              |
| `npm run build`      | Typecheck then production build to `dist/`    |
| `npm run lint`       | ESLint                                        |
| `npm test`           | Vitest unit tests (jsdom + fake-indexeddb)    |
| `npm run test:e2e`   | Playwright E2E tests (requires dev server)    |
| `npm run tauri dev`  | Tauri desktop dev mode                        |
| `npm run tauri build`| Build native desktop app                      |
| `npx supabase start` | Start local Supabase stack (Docker)           |
| `npx supabase stop`  | Stop the local Supabase stack                 |
| `npx supabase db reset` | Re-apply migrations to local DB           |

## Project structure

```
src/
├── main.tsx          # Entry point, DB init, sync hooks
├── App.tsx           # Router + layout
├── pages/            # 8 page components
├── components/
│   ├── layout/       # Sidebar, MobileNav
│   └── ui/           # shadcn/ui components
├── db/               # Dexie schema, seeds, nanoid
├── stores/           # Zustand stores (one per domain)
├── lib/              # Utilities (csv, exchange, sync, cn)
├── types/            # Shared TypeScript interfaces
└── test/             # Unit test setup + specs
e2e/                  # Playwright E2E specs
src-tauri/            # Tauri v2 Rust backend
supabase/             # Local Supabase config & migrations
```

## Notes

- The DB is auto-seeded with default categories on first open.
- Unit tests monkey-patch IndexedDB globally via `fake-indexeddb/auto`.
- Tailwind CSS v4 has no config file — everything lives in `src/index.css`.
