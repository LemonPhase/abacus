# Navigation

Navigation moves between the nine app destinations. Desktop shows a fixed
sidebar with all nine links (Settings separated at the bottom). Mobile shows a
five-item bottom bar — Home, Transactions, Budgets, Accounts, More — where More
opens a page of labeled rows for the secondary destinations (Reports,
Recurring, Investments, Categories, Settings). Every destination is a
standalone page at its own URL with its own `h1` at every screen size; More
stays selected on secondary pages, which carry an explicit mobile return link
back to More.

## Sub-features

- `nav-desktop` renders the nine sidebar links, each opening its own page, Settings at the bottom.
- `nav-mobile-bar` renders the five mobile tabs with visible labels.
- `nav-more` opens the More page listing the five secondary destinations.
- `nav-more-active` keeps More selected on secondary pages and shows a return link to More.
- `nav-fab` is the floating `Add Transaction` action, available on every app page.

## How to get to it (user POV)

- The sidebar (desktop) or the bottom bar (mobile) on any app page.
- The `More` tab on mobile → `/app/more`.
- Contextual links: `View investments` on Accounts, `Manage recurring transactions` / `Manage categories` on Transactions, `Full reports` on Home.
- The floating `Add Transaction` button (all pages, all sizes).

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`. Fresh `test` user. Set a mobile viewport (`page.setViewportSize({ width: 320, height: 568 })`) for the mobile drives.

- **Desktop.** Run `await page.goto('/app/dashboard')`. The `Desktop navigation` landmark links read, in order: `Home`, `Transactions`, `Budgets`, `Accounts`, `Reports`, `Recurring`, `Investments`, `Categories`, `Settings`. Click each in turn — the `h1` matches the link label (Home's `h1` is `Home`). Screenshot `nav__app-dashboard__desktop-sidebar.png` + ARIA snapshot of the nav.
- **Mobile bar.** At 320px wide run `await page.goto('/app/dashboard')`. The `Mobile navigation` landmark links read `Home`, `Transactions`, `Budgets`, `Accounts`, `More`. Screenshot `nav__app-dashboard__mobile-bar.png`.
- **More page.** Click the `More` tab → URL `/app/more`; the `More destinations` landmark lists `Reports`, `Recurring`, `Investments`, `Categories`, `Settings`. Screenshot `nav__app-more__mobile-list.png`.
- **Secondary page.** Click e.g. `Categories` → URL `/app/categories`, `h1` `Categories`, the mobile `More` tab has `aria-current="page"`, and a `More` return link is visible in the main region. Reload and Back both keep the standalone page. Screenshot `nav__app-categories__mobile-more-active.png`.
- **FAB.** On any page (e.g. `/app/more`) click the button named `Add Transaction` → URL `/app/transactions` with the add dialog open.

## Gotchas

- The `Add Transaction` name is shared by the page button, the FAB, and the dialog submit — scope clicks (`.first()` for the page button, `[data-slot="dialog-content"]` for submits).
- The FAB is `Add Transaction` on every page — it never opens the current page's own dialog (it is not `Add Account` / `Add Budget`).
- Trailing slashes normalize for active-state matching (`/app/investments/` marks `More` active) — assert `aria-current`, not raw URL equality.
- `Home`'s `h1` is `Home`; a driver waiting for a `Dashboard` heading fails.
- Reports, Settings, Investments, Recurring, and Categories are lazy-loaded — wait for the `h1`.
