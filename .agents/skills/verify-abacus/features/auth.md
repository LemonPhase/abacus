# Auth

Auth lets a visitor create an account, sign in with email and password, recover
a password by email, and enforces that `/app/*` is unreachable without a
session. It runs against real local GoTrue — real error messages, real session
persistence, real redirect cycle.

## Sub-features

- `auth-guard` redirects unauthenticated `/app/*` visits to `/auth`, preserving the requested path.
- `auth-signin` accepts valid credentials and lands on the app.
- `auth-signin-error` surfaces the GoTrue error on wrong credentials.
- `auth-signup` creates an account from the form and lands signed in.
- `auth-signup-validation` blocks mismatched passwords and malformed emails client-side.
- `auth-reset` emails a recovery link (Mailpit) that opens the reset form.

## How to get to it (user POV)

- Visit any `/app/*` route while signed out.
- Navigate to `/auth`.
- Choose `Sign up` on the auth page.
- Choose the forgot-password path on `/auth`, then open the emailed link.

## Driving it with Playwright

Preconditions:

- Doctor reports `OK`.
- Use `publicTest` for everything except flows that need a pre-made user (`createTestUser()`), and delete users in `finally`.

- **Guard redirect.** Visit a protected page signed out. Run `await page.goto('/app/dashboard')` with `publicTest`. URL matches `/\/auth$/` and `Sign in to your account` is visible.
- **Path preservation.** After the guard redirect from `/app/budgets`, fill `input[id="email"]` and `input[id="password"]` and run `await page.getByRole('button', { name: 'Sign In' }).click()`. URL is `/app/budgets` and the `h1` reads `Budgets`.
- **Sign in.** On `/auth` fill `input[id="email"]` and `input[id="password"]`, run `await page.getByRole('button', { name: 'Sign In' }).click()`. URL is `/app/dashboard` and the `h1` reads `Home` (the nav label and page title are `Home`, not `Dashboard`). Screenshot `auth-signin__auth__landed.png`.
- **Sign up.** On `/auth` run `await page.getByRole('button', { name: 'Sign up' }).click()`, fill `email`, `password`, `confirm-password`, then `Sign Up`. URL is `/app/dashboard` and the `h1` reads `Home`. Second view: the persisted session token in localStorage (`sb-127-auth-token`) plus the AuthGuard landing — local GoTrue auto-confirms and sends NO signup email (Mailpit will be empty; don't treat that as failure). Clean up with `deleteUserByEmail`.
- **Sign-up validation.** On the sign-up form fill `email` with `not-an-email`, then click `Sign Up` — validation runs only on submit (typing clears field errors) — so `Please enter a valid email address` is visible and the URL stays `/auth`. Then fill mismatched `password` / `confirm-password`, click `Sign Up` again → `Passwords do not match`, stays on `/auth`. Screenshot `auth-signup-validation__auth__errors.png`.
- **Sign-in error.** Sign in with a wrong password. The text `Invalid login credentials` is visible and URL stays `/\/auth$/`.
- **Reset email (single shot).** Run this sub-feature ONCE — ideally `--grep auth-reset` in its own run — and never re-run it: GoTrue's 2/hour rate limit is machine-wide and the whole budget. Trigger the reset for a known user, then run the Mailpit search from `e2e/mailpit.ts` (`fetchRecoveryLink(email)`). The returned link contains `/auth/v1/verify`. Proof: the link text itself is the side-effect view. The link only opens on the default port (see Gotchas).

## Gotchas

- The app requests the recovery link's `redirect_to` from its real origin, but local GoTrue only accepts 5173-port origins (`supabase/config.toml` `site_url` / `additional_redirect_urls`) and falls back to `site_url` otherwise — so under `E2E_PORT` isolation opening the link dead-ends with `ERR_CONNECTION_REFUSED`. Drive the link-opening half on the default port or treat link capture as the proof.
- GoTrue rate-limits reset emails to 2/hour — never loop `auth-reset`.
- Sign-up users are created through the UI; you never see the id — clean up with `deleteUserByEmail`.
- Use unique emails (`e2e-<ts>-<pid>-<rand>@test.local`) or parallel workers collide.
- The session lives in localStorage under `sb-127-auth-token` — let the fixture seed it; do not hand-write it.
