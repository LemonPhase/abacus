import { test as base, expect } from '@playwright/test'

const SUPABASE_URL = 'http://127.0.0.1:54321'
const STORAGE_KEY = 'sb-127-auth-token'
const MOCK_USER_ID = 'e2e-test-user-id'
const MOCK_USER_EMAIL = 'e2e@test.com'

function makeMockSession() {
  return {
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.abc123def456',
    token_type: 'bearer',
    expires_in: 3600000,
    expires_at: Math.floor(Date.now() / 1000) + 3600000,
    refresh_token: 'mock-refresh-token-for-e2e',
    user: {
      id: MOCK_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: MOCK_USER_EMAIL,
      email_confirmed_at: '2024-01-01T00:00:00Z',
      app_metadata: {},
      user_metadata: {},
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  }
}

function makeMockRow(table: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    id: `mock-${table}-${Math.random().toString(36).slice(2, 9)}`,
    user_id: MOCK_USER_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

/** In-memory table store so GET returns previously inserted data. */
const tableStore = new Map<string, Record<string, unknown>[]>()

function ensureTable(name: string): Record<string, unknown>[] {
  if (!tableStore.has(name)) tableStore.set(name, [])
  return tableStore.get(name)!
}

/**
 * Shared Supabase API route mocking.
 * Attached once per page — handles auth, REST, and realtime endpoints.
 */
async function setupSupabaseMock(page: base['page']) {
  // Intercept all requests to the Supabase backend
  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const pathname = url.pathname
    const accept = req.headers()['accept'] ?? ''
    const prefer = req.headers()['prefer'] ?? ''
    const wantsSingle = accept.includes('application/vnd.pgrst.object+json')
    const wantsRepresentation = prefer.includes('return=representation')

    // ── Auth endpoints ──
    if (pathname.startsWith('/auth/v1/')) {
      if (pathname === '/auth/v1/user' && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockSession().user),
        })
        return
      }
      if (pathname === '/auth/v1/token') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeMockSession()),
        })
        return
      }
      if (pathname === '/auth/v1/logout') {
        await route.fulfill({ status: 204 })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }

    // ── REST / PostgREST endpoints ──
    if (pathname.startsWith('/rest/v1/')) {
      const tableMatch = pathname.match(/^\/rest\/v1\/([^/?]+)/)
      const table = tableMatch?.[1] ?? 'unknown'
      const rows = ensureTable(table)

      if (method === 'GET') {
        const n = rows.length
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'content-range': `0-${Math.max(0, n - 1)}/${n}` },
          body: JSON.stringify(rows),
        })
        return
      }

      if (method === 'POST') {
        let body: Record<string, unknown> = {}
        try {
          body = (await req.postDataJSON()) ?? {}
        } catch {
          // Body might be empty or non-JSON — use empty object
        }
        const row = makeMockRow(table, body)
        rows.push(row)

        if (wantsRepresentation) {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify(wantsSingle ? row : [row]),
          })
        } else {
          await route.fulfill({ status: 201, contentType: 'application/json', body: '' })
        }
        return
      }

      if (method === 'PATCH') {
        let body: Record<string, unknown> = {}
        try {
          body = (await req.postDataJSON()) ?? {}
        } catch {
          // Body might be empty or non-JSON
        }
        const idFilter = url.searchParams.get('id') ?? ''
        const eqMatch = idFilter.match(/^eq\.(.+)$/)
        const targetId = eqMatch?.[1]
        let updated: Record<string, unknown> | undefined
        if (targetId) {
          const idx = rows.findIndex((r) => r.id === targetId)
          if (idx !== -1) {
            rows[idx] = { ...rows[idx], ...body, updated_at: new Date().toISOString() }
            updated = rows[idx]
          }
        }

        if (wantsRepresentation) {
          const responseData = updated ?? {}
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wantsSingle ? responseData : [responseData]),
          })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '' })
        }
        return
      }

      if (method === 'DELETE') {
        const idFilter = url.searchParams.get('id') ?? ''
        const eqMatch = idFilter.match(/^eq\.(.+)$/)
        const targetId = eqMatch?.[1]
        if (targetId) {
          const idx = rows.findIndex((r) => r.id === targetId)
          if (idx !== -1) rows.splice(idx, 1)
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '' })
        return
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }

    // ── Realtime / WebSocket endpoints ──
    if (pathname.startsWith('/realtime/v1/')) {
      await route.abort()
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

/**
 * Authenticated fixture — seeds a mock Supabase session so AuthGuard allows
 * access to `/app/*` routes.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    tableStore.clear()
    await page.addInitScript(
      ({ key, sessionJSON }: { key: string; sessionJSON: string }) => {
        localStorage.setItem(key, sessionJSON)
      },
      { key: STORAGE_KEY, sessionJSON: JSON.stringify(makeMockSession()) },
    )
    await setupSupabaseMock(page)
    await use(page)
  },
})

/**
 * Unauthenticated fixture — for testing public pages (/auth, landing, etc.).
 * Still mocks Supabase API calls but does NOT seed an auth session.
 */
export const publicTest = base.extend({
  page: async ({ page }, use) => {
    tableStore.clear()
    await setupSupabaseMock(page)
    await use(page)
  },
})

export { expect }
