import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { createTestUser, deleteTestUser, test, type TestUser } from './fixtures'
import { startHeadersServer } from './headersServer'
import { fetchRecoveryLink } from './mailpit'

/**
 * Audit 14 (#18): the app must work under the vercel.json security headers.
 *
 * These specs run against the PRODUCTION build (dist/) served by a local
 * stand-in that applies the vercel.json header rules — not the dev server,
 * which Vite injects with inline scripts/styles that production never ships.
 * CSP violations surface as console/page errors and fail the assertions at
 * the end of each spec, so anything the policy blocks (charts, fonts, the
 * theme-init script, realtime sockets, PWA precache…) is caught here.
 *
 * Needs `npm run build` first (CI builds before running e2e).
 */

const distReady = existsSync(join(resolve(process.cwd(), 'dist'), 'index.html'))

const vercelCsp =
  (
    JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    }
  ).headers
    ?.find((h) => h.source === '/(.*)')
    ?.headers.find((h) => h.key.toLowerCase() === 'content-security-policy')?.value ?? ''

// The deployed CSP names Supabase via a wildcard; tests run against the local
// stack, so substitute its concrete HTTP/WS origins. Everything else — script
// hashes, style/img/font sources, frame-ancestors — is applied verbatim.
const supabaseUrl = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const localCsp = vercelCsp
  .replace('https://*.supabase.co', supabaseUrl)
  .replace('wss://*.supabase.co', supabaseUrl.replace(/^http/, 'ws'))

const cspTest = test.extend<{ headersOrigin: string; cspViolations: string[]; cspPage: Page }>({
  headersOrigin: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring the worker arg even when no fixtures are consumed
    async ({}, use) => {
      const server = await startHeadersServer({ 'content-security-policy': localCsp })
      await use(server.origin)
      await server.close()
    },
    { scope: 'worker' },
  ],
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring the worker arg even when no fixtures are consumed
  cspViolations: async ({}, use) => {
    await use([])
  },
  cspPage: async ({ browser, headersOrigin, cspViolations }, use) => {
    const context = await browser.newContext({ baseURL: headersOrigin })
    const page = await context.newPage()
    const isViolation = (text: string) => /Content Security Policy directive/i.test(text)
    page.on('console', (msg) => {
      if (isViolation(msg.text())) cspViolations.push(msg.text())
    })
    page.on('pageerror', (err) => {
      if (isViolation(String(err))) cspViolations.push(String(err))
    })
    await use(page)
    await context.close()
  },
})

async function signIn(page: Page, user: TestUser, target = '/app/dashboard') {
  // AuthGuard bounces to /auth and preserves the originally requested path.
  await page.goto(target)
  await expect(page).toHaveURL(/\/auth$/)
  await page.locator('input[id="email"]').fill(user.email)
  await page.locator('input[id="password"]').fill(user.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(new RegExp(`${target.replace(/\//g, '\\/')}$`))
}

/** Minimal current-month data so the dashboard charts render. */
async function seedDashboardData(client: SupabaseClient) {
  const { data: account, error: accountErr } = await client
    .from('accounts')
    .insert({ name: 'Checking', type: 'checking', currency: 'USD', balance: 5000 })
    .select()
    .single()
  if (accountErr || !account) throw accountErr ?? new Error('account insert failed')

  const { data: cats, error: catsErr } = await client
    .from('categories')
    .insert([
      { name: 'Salary', type: 'income', color: '#10b981' },
      { name: 'Groceries', type: 'expense', color: '#ef4444' },
    ])
    .select()
  if (catsErr || !cats) throw catsErr ?? new Error('category insert failed')

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { error: txErr } = await client.from('transactions').insert([
    {
      account_id: account.id,
      category_id: cats[0].id,
      type: 'income',
      amount: 5000,
      currency: 'USD',
      base_amount: 5000,
      base_currency: 'USD',
      date: `${month}-01`,
      description: 'Monthly salary',
    },
    {
      account_id: account.id,
      category_id: cats[1].id,
      type: 'expense',
      amount: 350,
      currency: 'USD',
      base_amount: 350,
      base_currency: 'USD',
      date: `${month}-05`,
      description: 'Weekly groceries',
    },
  ])
  if (txErr) throw txErr
}

cspTest.describe('CSP: app behavior under vercel.json headers', () => {
  cspTest.skip(!distReady, 'runs against the production build — run `npm run build` first')

  cspTest(
    'auth guard, sign-in and password recovery work under CSP',
    async ({ cspPage, cspViolations, headersOrigin }) => {
      const user = await createTestUser()
      try {
        await signIn(cspPage, user, '/app/budgets')
        await expect(cspPage.getByRole('heading', { level: 1 })).toContainText('Budgets')

        // Request a recovery email (node-side GoTrue call), then follow the
        // verify link's SPA deep link in the browser under CSP. The redirect
        // allowlist pins localhost:5173, so rewrite its origin onto the
        // headers-server origin — same SPA route, under the policy under test.
        const client = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { autoRefreshToken: false, persistSession: false },
          },
        )
        const { error } = await client.auth.resetPasswordForEmail(user.email, {
          redirectTo: 'http://localhost:5173/auth/reset-password',
        })
        expect(error).toBeNull()
        const link = await fetchRecoveryLink(user.email)
        const verify = await fetch(link, { redirect: 'manual' })
        expect([302, 303]).toContain(verify.status)
        const deepLink = verify.headers.get('location')!
        expect(deepLink).toBeTruthy()
        // If GoTrue throttles or rejects the verify flow it redirects to the site
        // root instead of the SPA deep link — fail with a clear message here.
        expect(deepLink).toContain('/auth/reset-password')
        await cspPage.goto(deepLink.replace(/^https?:\/\/[^/]+/, headersOrigin))
        await expect(cspPage).toHaveURL(/\/auth\/reset-password/)
        await cspPage.locator('input[id="password"]').fill('brand-new-password-456')
        await cspPage.getByRole('button', { name: 'Set new password' }).click()
        await expect(cspPage.getByText('Password updated')).toBeVisible()
      } finally {
        await deleteTestUser(user.id)
      }
      expect(cspViolations).toEqual([])
    },
  )

  cspTest(
    'dashboard charts, fonts, realtime and the FX provider work under CSP',
    async ({ cspPage, cspViolations, testUser, userSupabase }) => {
      await seedDashboardData(userSupabase)
      await signIn(cspPage, testUser, '/app/dashboard')

      // Recharts renders (inline SVG + JS-applied styles) under style-src 'self'.
      await expect(cspPage.locator('.recharts-wrapper').first()).toBeVisible()

      // Geist Variable is bundled (font-src 'self') and actually loaded.
      const geistLoaded = await cspPage.evaluate(async () => {
        await document.fonts.ready
        return document.fonts.check('16px "Geist Variable"')
      })
      expect(geistLoaded).toBe(true)

      // Realtime: the dashboard subscribes on load; probe the same WS endpoint
      // the client uses. Any outcome is fine as long as CSP didn't refuse it —
      // a blocked socket logs a connect-src violation above.
      const wsOrigin = supabaseUrl.replace(/^http/, 'ws')
      await cspPage.evaluate((url) => {
        return new Promise<void>((opened) => {
          const ws = new WebSocket(`${url}/realtime/v1/websocket`)
          ws.onopen =
            ws.onerror =
            ws.onclose =
              () => {
                ws.close()
                opened()
              }
        })
      }, wsOrigin)
      expect(cspViolations.filter((v) => /websocket|realtime/i.test(v))).toEqual([])

      // FX provider (#24): the exact host src/services/exchange.ts fetches at
      // runtime must not be refused by connect-src. A network failure is fine
      // (the service treats it as an unavailable rate); a CSP refusal is not.
      await cspPage.evaluate(async () => {
        try {
          await fetch('https://open.er-api.com/v6/latest/USD')
        } catch {
          /* unreachable network is acceptable — CSP blocks log a violation */
        }
      })
      expect(cspViolations.filter((v) => /er-api/i.test(v))).toEqual([])

      expect(cspViolations).toEqual([])
    },
  )

  cspTest(
    'PWA service worker registers, precaches and controls the page under CSP',
    async ({ cspPage, cspViolations }) => {
      await cspPage.goto('/')

      // Install → activate → clientsClaim: poll until the worker controls the
      // page (this also proves the precache fetches and importScripts of the
      // header-restricted worker script ran without a connect-src/script-src
      // refusal — those would surface as violations below).
      await expect
        .poll(() => cspPage.evaluate(() => !!navigator.serviceWorker.controller), {
          timeout: 15_000,
        })
        .toBe(true)

      // The workbox precache is actually populated.
      const precacheEntries = await cspPage.evaluate(async () => {
        const name = (await caches.keys()).find((c) => c.includes('workbox-precache'))
        if (!name) return 0
        return (await (await caches.open(name)).keys()).length
      })
      expect(precacheEntries).toBeGreaterThan(0)

      // Reload: the activated worker serves the shell from the precache.
      await cspPage.reload()
      expect(await cspPage.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
      await expect(cspPage.locator('#root > *').first()).toBeVisible()

      expect(cspViolations).toEqual([])
    },
  )
})
