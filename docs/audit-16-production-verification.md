# Audit 16 — Production verification (RLS, Auth, migrations, backups, deployment gates)

Issue: #20 · Date: 2026-09-16 (UTC) · Method: read-only public checks + one throwaway account lifecycle

Redaction note: no tokens, keys, or emails appear in this document except the throwaway account created for the test (`ewtqcqoa@guerrillamailblock.com`, id `6a4f3c0c-7331-4607-a759-92c299385b5c`). The Supabase publishable key is public by design (it ships in the production JS bundle); it is nevertheless referenced only as `<publishable key>` here.

---

## 1. Production targets (discovery)

| What                | Value                                      | How discovered                                                                                                                   |
| ------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Production app      | `https://abacus.jackzxq.dev`               | Repo "homepage" URL field → `https://abacus-eosin.vercel.app` → `307 → https://abacus.jackzxq.dev`                               |
| Vercel project      | `lemonphases-projects/abacus`              | GitHub commit status `Vercel` target URL on master                                                                               |
| Production Supabase | `https://oblpxkcnpnirtrwngznq.supabase.co` | Project ref embedded in the public production JS bundle (`/assets/with-selector-*.js`); matches the owner's local `.env` comment |
| Publishable key     | `<publishable key>` (`sb_publishable_…`)   | Public production bundle (not a secret; still redacted here)                                                                     |

The production app domain is **not recorded anywhere in the repo source** (only placeholders in `.env.example`/README). It is discoverable only via the GitHub repo homepage field. Finding F7.

## 2. Hosted Auth verification (public endpoints + throwaway account)

All probes hit `https://oblpxkcnpnirtrwngznq.supabase.co/auth/v1/*` with the public publishable key.

### 2.1 `GET /auth/v1/settings` (2026-09-16 ~23:48 UTC)

```json
{
  "external": { "email": true, "all others": false, "anonymous_users": false },
  "disable_signup": false,
  "mailer_autoconfirm": false,
  "phone_autoconfirm": false,
  "saml_enabled": false,
  "passkeys_enabled": false
}
```

- **Email confirmation: ENABLED in production** (`mailer_autoconfirm: false` ⇒ confirmation required). This **differs from the repo's `supabase/config.toml`** (`enable_confirmations = false`) — see F4.
- Signups open, no anonymous sign-ins, no SSO providers, no passkeys. Matches repo config intent.

### 2.2 Password policy (signup endpoint probe)

| Attempt                               | Result                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Signup with 5-char password (`Ab12x`) | `HTTP 422` `weak_password`, `"Password should be at least 6 characters."`, `reasons: ["length"]` — **no user created** |

- Effective minimum length in production = **6** (matches `config.toml`, but weak — Supabase recommends 8+; no complexity requirement observable). F5.
- Complexity rules (`password_requirements`) cannot be observed externally; needs owner dashboard check (§8).

### 2.3 Email confirmation behavior (throwaway account lifecycle)

1. `POST /auth/v1/signup` (strong password) → `HTTP 200`, user object returned, **no session** (consistent with confirmation required), `confirmation_sent_at` set.
2. Confirmation email arrived from **`noreply@mail.app.supabase.io`** (Supabase **built-in SMTP**, i.e. no custom SMTP configured — F6) ≈ 11 s after signup.
3. Link format: `https://oblpxkcnpnirtrwngznq.supabase.co/auth/v1/verify?token=<REDACTED>&type=signup&redirect_to=https://abacus.jackzxq.dev` — **site_url is the production domain** (not localhost).
4. `GET /auth/v1/verify…` → `HTTP 303 Location: https://abacus.jackzxq.dev#access_token=<REDACTED>&expires_in=3600…` — confirmation works, lands on production domain.

### 2.4 Session settings observable from the JWT (throwaway sign-in)

`POST /auth/v1/token?grant_type=password` → `HTTP 200`:

| Observable      | Value                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| JWT `exp − iat` | **3600 s (1 hour)** — `expires_in: 3600`                                        |
| Claims          | `iss: …/auth/v1`, `role: authenticated`, `aud: authenticated`                   |
| Refresh token   | present; rotation enforced (see below)                                          |
| Session cookies | `sb-auth-refresh-token-prefix`, `sb-auth-session-id` headers on verify response |

- Session timebox / inactivity limits are **not observable** from the JWT (no such claims; Supabase default = no timebox). Needs owner dashboard check (§8).
- Refresh rotation verified: after `POST /auth/v1/logout?scope=global` (204), reuse of the refresh token → `400 refresh_token_not_found`. ✓

### 2.5 Recovery redirect allowlist (throwaway)

`POST /auth/v1/recover` with `"redirect_to": "https://evil.example.test/callback"` → `HTTP 200 {}`; emailed recovery link contained **`redirect_to=https://abacus.jackzxq.dev`** — the foreign domain was **rejected and fell back to site_url**. Allowlist works. Recovery email arrived ≈ 7 s after request.

### 2.6 Abuse/enumeration observables (non-destructive)

- Recovery for a non-existent address → `HTTP 200 {}` (same shape as for a real address) ⇒ no user enumeration on recover.
- Signup with an already-registered address → `HTTP 200` with a synthetic user object (no error) ⇒ anti-enumeration on signup.
- No rate-limit rejection was observed across 2 real emails sent ~2 min apart (signup + recovery). Hosted rate limits themselves are not externally probeable without abusive request volumes — not tested (§8).

## 3. Schema verification (production vs repo migrations)

`GET /rest/v1/` OpenAPI introspection returns `401 "Secret API key required"` (new API-key system hardening) — schema was instead probed via RLS-scoped reads with the throwaway's session. **No data returned at any point** (every query returned `[]`, confirming per-user RLS on production).

| Probe                                                                                     | Result                             | Implication                           |
| ----------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| `accounts`, `categories`, `transactions`, `budgets`, `exchange_rates`, `investment_plans` | `200 []`                           | Exist; RLS scopes to own (empty) rows |
| `recurring_transactions`                                                                  | `404 PGRST205` not in schema cache | **Table missing in production**       |
| `recurring_occurrences`                                                                   | `404 PGRST205`                     | **Table missing in production**       |
| `accounts.opening_balance`                                                                | `400 42703` column does not exist  | `20260916000000` not applied          |
| `transactions.transfer_id`                                                                | `400 42703`                        | `20260917000002` not applied          |
| `transactions.fx_rate`, `transactions.base_amount_stale`                                  | `400 42703`                        | `20260917000003` not applied          |

**Conclusion: production has only the initial schema applied (`20260509000000`, plus almost certainly `20260511182423` which only replaces a trigger function). All 11 migrations from `20260516000000` through `20260919000002` are UNAPPLIED.** The deployed frontend (built from current master) expects these objects, so the following production features are broken or degraded:

| Feature                                                                                                                                                     | Code path                              | Missing object                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Recurring transactions page/store                                                                                                                           | `stores/recurringTransactionsStore.ts` | `recurring_transactions` table                                                      |
| CSV/JSON restore                                                                                                                                            | `services/restore.ts`                  | `restore_user_data()` RPC, `recurring_transactions`                                 |
| Transfers                                                                                                                                                   | `stores/transactionsStore.ts`          | `create_transfer()`, `edit_transfer()`, `delete_transfer()`                         |
| Reports                                                                                                                                                     | `services/reports.ts`                  | `report_summary()`, `report_monthly()`, `report_by_category()`, `budget_spending()` |
| Budget editing                                                                                                                                              | `stores/budgetsStore.ts`               | `replace_budget_categories()`                                                       |
| Export                                                                                                                                                      | `services/export.ts`                   | `recurring_transactions`                                                            |
| Ownership-enforcement hardening (same-user FKs, composite uniques), input invariant CHECKs, query indexes, opening-balance ledger, hardened balance trigger | migrations                             | all of `20260916000000`…`20260919000002`                                            |

RLS itself **is** enabled on the 6 existing tables (row-scoped responses), and the base `update_account_balance` trigger exists from the initial schema; the hardened versions (audits 8–12) are not in production. F1.

## 4. Deployment gates (repo-side)

- **Branch protection on `master`: none.** `GET /repos/LemonPhase/abacus/branches/master/protection` → `404 "Branch not protected"`. No required status checks, no PR requirement, no dismissal rules.
- CI (`.github/workflows/ci.yml`) runs 4 jobs on push/PR to master: `check` (format+lint+build), `test`, `e2e`, `security` (PostgREST adversarial suite). Job coverage is good — it is simply **not enforced**.
- **Direct evidence that production deploys do not wait for checks:** commit `1e78ddf` (current master head) has `test: failure` (check/e2e/security passed) while the `Vercel` commit status on the same commit is `success` and the deployment is live at the production domain. F2/F3.

### 4.1 Exact recommended protection ruleset (owner to apply)

Classic branch protection via API (admin) — settings → Branches → Add rule for `master`:

- Require a pull request before merging: **on**, 1 approval, **dismiss stale approvals on new commits: on**.
- Require status checks to pass before merging: **on**, require branches to be up to date: **on**, required checks (exact names): **`check`, `test`, `e2e`, `security`**.
- Require linear history: **on**. Do not allow force pushes: **on**. Do not allow deletions: **on**. Restrictions (who can push): null.
- Equivalent API payload:

```json
PUT /repos/LemonPhase/abacus/branches/master/protection
{
  "required_status_checks": { "strict": true, "contexts": ["check", "test", "e2e", "security"] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

With this in place, a deploy can no longer reach production without all four CI jobs green. Optionally also enable Vercel Deployment Protection or a "wait for CI" check in the Vercel project (owner dashboard), since Vercel auto-deploys `master` pushes regardless.

## 5. Schema-deployment ordering (migration chain)

Source of truth: `supabase/migrations/` — a strictly linear chain, ordered by filename timestamp. `supabase db push` applies only unapplied files, in filename order, recorded in `supabase_migrations.schema_migrations` on the target project.

| #   | Migration                                          | Content (one line)                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------- |
| 1   | `20260509000000_initial_schema.sql`                | 6 core tables, per-user RLS, `update_account_balance` trigger |
| 2   | `20260511182423_fix_balance_trigger_ownership.sql` | Re-owns/hardens balance trigger function                      |
| 3   | `20260516000000_recurring_transactions.sql`        | `recurring_transactions` table + RLS                          |
| 4   | `20260916000000_opening_balance_ledger.sql`        | `accounts.opening_balance`, `enforce_account_balance` trigger |
| 5   | `20260917000001_atomic_restore.sql`                | `restore_user_data(p_payload jsonb)`                          |
| 6   | `20260917000002_atomic_transfers.sql`              | `transactions.transfer_id`, transfer RPCs                     |
| 7   | `20260917000003_currency_provenance.sql`           | `fx_rate`/`fx_date`/`base_amount_stale`                       |
| 8   | `20260917000004_ownership_enforcement.sql`         | same-user FKs, composite unique keys                          |
| 9   | `20260917000005_replace_budget_categories_rpc.sql` | `replace_budget_categories()`                                 |
| 10  | `20260918000001_input_invariants.sql`              | CHECK constraints (currency formats, etc.)                    |
| 11  | `20260918000002_report_aggregates.sql`             | `report_*` / `budget_spending()` RPCs                         |
| 12  | `20260919000001_recurring_engine.sql`              | `recurring_occurrences` + engine RPCs                         |
| 13  | `20260919000002_query_indexes.sql`                 | query indexes                                                 |

**Safe apply order = repository order, applied as one `supabase db push` against the linked hosted project.** Never cherry-pick migrations: #4–#13 assume the state created by their predecessors (e.g. transfer RPCs reference `transfer_id` added by #6; recurring engine references table #3). `supabase/seed.sql` is local-dev only (`db reset`) and is never pushed to hosted. Composition with the hosted DB:

1. Owner links the project once: `npx supabase link --project-ref oblpxkcnpnirtrwngznq` (requires dashboard access token).
2. Dry-run first: `npx supabase db push --dry-run` — with production 11 migrations behind, this must list exactly migrations 3–13 above. **A mismatch here means the hosted migration history diverged — stop and reconcile before pushing.**
3. Take/verify a backup first (§6), then `npx supabase db push` (idempotent per-file where written with `if not exists`, but applied exactly once).
4. Post-apply verification (§6.4 checks work here too): the probe table in §3 must go all-green (`200 []` everywhere).

Local/CI equivalence: `npx supabase db reset` applies the full chain locally; the CI `security` job asserts every migration-created object exists, which is exactly the gate that would have caught the production drift.

## 6. Backups & restoration-verification runbook (owner)

### 6.1 Verifiable without dashboard access (this audit)

- The app ships JSON/CSV export (Settings) — per the issue, this is **not** accepted as a backup strategy; not relied on here.
- Backup plan/retention/PITR settings live in the Supabase dashboard and are **not** externally observable. Cannot be verified without owner access (§8). On the current plan tier, daily backups (7-day retention on Pro; PITR optional add-on) apply — owner must confirm.

### 6.2 Step-by-step restoration verification (owner, ~30 min, zero risk to production)

1. **Dashboard → Database → Backups.** Record: backup type (daily/PITR), retention window, timestamp of latest successful backup. Screenshot into a private note (contains no user data).
2. If on a plan without scheduled backups: enable them or set a `pg_dump` cron (see §6.5) **before** proceeding.
3. **Create an isolated restore target**: new Supabase project (e.g. `abacus-restore-test`) in the same org. Do not touch the production project.
4. **Restore**: Backups → latest → _Restore into the new project_ (or `psql -f dump.sql` into it if using `pg_dump`). Production is never modified by a restore operation.
5. **Verify the restore** (SQL editor on the restored project):
   - Row counts per table match production: `select 'accounts', count(*) from accounts union all select 'categories', count(*) from categories union all select 'transactions', count(*) from transactions union all select 'budgets', count(*) from budgets union all select 'exchange_rates', count(*) from exchange_rates union all select 'investment_plans', count(*) from investment_plans union all select 'recurring_transactions', count(*) from recurring_transactions;`
   - RLS enabled everywhere: `select tablename, rowsecurity from pg_tables where schemaname = 'public';` — every row must be `true`.
   - Policies exist: `select tablename, policyname from pg_policies where schemaname = 'public';` — compare against repo migrations.
   - Migration history matches repo: `select * from supabase_migrations.schema_migrations order by name;`
   - Sign up a throwaway user in the **restored** project, insert one transaction, confirm another user cannot read it (RLS smoke test), then delete the user.
6. **Destroy** the isolated restore-test project after verification.
7. Repeat §6.2 quarterly; after every Supabase plan or region change.

### 6.3 What the throwaway test added to the runbook

The account created for this audit still exists (self-service deletion is disabled on the project — `DELETE /auth/v1/user` → `405`). Its sessions were revoked (`logout?scope=global` → 204; refresh reuse → 400). Owner cleanup (one click, no data attached to it):

- Dashboard → Authentication → Users → search `ewtqcqoa@guerrillamailblock.com` → Delete user. (id `6a4f3c0c-7331-4607-a759-92c299385b5c`)

### 6.4 Production drift fix (owner, blocked on dashboard access — §8)

Apply the migration chain per §5 steps 1–4, then re-run the §3 probe matrix (all green expected).

## 7. Release checklist (repo-side addition, in-scope)

Adopt for every production release (worth automating once branch protection is on):

1. CI green on the PR (`check`, `test`, `e2e`, `security`) — enforced by §4.1 protection rule.
2. If migrations changed: `npx supabase db push --dry-run` output reviewed; push to hosted **before or together with** the frontend deploy that requires it; confirm with the §3 probe matrix.
3. Merge to `master` (PR only; no direct pushes once protection is on).
4. Watch the Vercel deployment on the merge commit; verify the live domain responds and CSP headers match `vercel.json`.
5. Smoke-test on production: sign in (throwaway if needed), create+delete a scratch transaction, open Recurring/Reports pages (they exercise the schema gap in F1 until fixed).

## 8. Explicitly blocked — needs owner (dashboard) access

1. **Delete the throwaway user** (§6.3) — one click; no data attached.
2. **Apply the 11 unapplied migrations** (§5/§6.4) — requires `supabase link` access token; cannot be done repo-side without risking production.
3. Backup plan/retention/PITR confirmation + the §6.2 restore demonstration — dashboard only.
4. Hosted Auth settings not externally observable: password complexity (`password_requirements`), session timebox/inactivity, SMTP config details, rate-limit values (observed behavior only, §2.6).
5. Branch-protection ruleset application (§4.1) and Vercel Deployment Protection — admin actions.

## 9. Findings & discrepancy list

| #   | Severity     | Finding                                                                                                                                                                                                                                                               |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Critical** | Production DB is 11 migrations behind the repo (initial schema only). Recurring transactions, transfers, reports, restore, budget-edit RPCs and audit-8/10/12 hardening are absent from production while the current frontend expects them.                           |
| F2  | **Critical** | `master` has no branch protection: any direct push can deploy to production with CI failing.                                                                                                                                                                          |
| F3  | High         | Production was deployed from a commit with a failing `test` job (`1e78ddf`) — demonstrates deploys do not wait for checks.                                                                                                                                            |
| F4  | Medium       | Config drift: email confirmation is ON in production, OFF in `supabase/config.toml` (local/CI differs from prod). Document and decide: align local to prod (recommended for parity; local Inbucket supports confirm links) or accept the difference.                  |
| F5  | Medium       | Password minimum is 6 with no observable complexity requirement (matches repo config; recommend 8+, consider `letters_digits`).                                                                                                                                       |
| F6  | Medium       | Auth emails use Supabase built-in SMTP (`noreply@mail.app.supabase.io`) — deliverability (spam) and low send-rate risk for recovery emails; configure custom SMTP.                                                                                                    |
| F7  | Low          | Production app domain is not recorded in the repo (only the GitHub homepage field). Record it (e.g. in `.env.example` comments / README deploy section). `VITE_APP_URL` value in Vercel env unverified, but email redirects prove the Supabase `site_url` is correct. |
| F8  | Low          | REST OpenAPI introspection requires a secret key (good hardening; note it blocks external schema diffing — use `supabase db diff`/dashboard instead).                                                                                                                 |
| F9  | Info         | Access tokens remain valid until `exp` after logout (stateless JWT, standard); 1-hour expiry + refresh revocation mitigates.                                                                                                                                          |

## 10. Validation performed

- `npm test`, `npm run build`, `npm run lint` — pass on this branch.
- One pre-existing test failure on master was fixed here to unblock the gate: `RecurringTransactions.test.tsx > re-anchors next_date…` asserted `toEqual(new Date(...))` against the mock's stored ISO string (identical failure as the red `test` job on `1e78ddf` — see F3). Fixed to compare strings; no production code changed.
- Production probes were read-only HTTP with one throwaway account lifecycle; no production writes beyond the account; sessions revoked; account deletion handed to owner (§6.3).
