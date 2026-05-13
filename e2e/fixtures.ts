import { test as base, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * E2E fixtures backed by a real local Supabase stack.
 *
 * Each authenticated test gets a freshly provisioned user via the GoTrue admin
 * API. RLS scopes data to `auth.uid()` and FK cascades from `auth.users(id)`,
 * so user deletion at the end of the test wipes any rows that test created —
 * no manual truncation needed and parallel workers don't collide.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// supabase-js persists the session in localStorage under `sb-<first-DNS-label>-auth-token`.
// For http://127.0.0.1:54321 that's `sb-127-auth-token`.
const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

if (!PUBLISHABLE_KEY || !SERVICE_ROLE_KEY) {
  // globalSetup populates these; this branch fires only if fixtures are imported
  // outside the Playwright runner (e.g. from a unit test). Surface it loudly.
  throw new Error('Supabase keys missing — fixtures.ts must be loaded via Playwright globalSetup.')
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface TestUser {
  id: string
  email: string
  password: string
}

let userCounter = 0

/**
 * Provision a confirmed user via the admin API. Email is unique per call so
 * parallel workers don't collide.
 */
export async function createTestUser(overrides: { password?: string } = {}): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${process.pid}-${++userCounter}@test.local`
  const password = overrides.password ?? 'password123'
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('createUser returned no user')
  return { id: data.user.id, email, password }
}

export async function deleteTestUser(id: string): Promise<void> {
  // Best-effort — if the test already deleted the user (e.g. via the UI), ignore.
  await adminClient.auth.admin.deleteUser(id).catch(() => undefined)
}

/**
 * Look up a user by email and delete them. Used by sign-up flow tests where
 * the user is created via the UI and we never see the id directly.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const { data } = await adminClient.auth.admin.listUsers({ perPage: 200 })
  const match = data?.users.find((u) => u.email === email)
  if (match) await deleteTestUser(match.id)
}

async function fetchSession(email: string, password: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error('signIn returned no session')
  return data.session
}

// The app runs at this origin; supabase-js writes its session to localStorage
// scoped here, not to the Supabase API origin.
const APP_ORIGIN = 'http://localhost:5173'

/**
 * Sign in a fresh PostgREST client as the given user. Use this to seed DB
 * state directly from a test instead of going through the UI — much faster
 * and the `set_user_id` trigger relies on `auth.uid()` so the admin/service
 * role can't write on the user's behalf.
 */
export async function signedInClient(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error) throw error
  return client
}

/**
 * Authenticated fixture — seeds a real session in localStorage so AuthGuard
 * allows access to `/app/*` routes. The user is created before the test and
 * deleted after; FK cascade removes any rows the test inserted.
 *
 * Uses Playwright's `storageState` fixture (not `addInitScript`) so that the
 * session is written once at context creation. `addInitScript` would re-run
 * on every navigation and undo any sign-out the test performs.
 *
 * `userSupabase` is a Supabase client signed in as `testUser`, available for
 * tests that need to seed DB state directly.
 */
export const test = base.extend<{ testUser: TestUser; userSupabase: SupabaseClient }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring the worker arg even when no fixtures are consumed
  testUser: async ({}, use) => {
    const user = await createTestUser()
    try {
      await use(user)
    } finally {
      await deleteTestUser(user.id)
    }
  },
  storageState: async ({ testUser }, use) => {
    const session = await fetchSession(testUser.email, testUser.password)
    await use({
      cookies: [],
      origins: [
        {
          origin: APP_ORIGIN,
          localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(session) }],
        },
      ],
    })
  },
  userSupabase: async ({ testUser }, use) => {
    const client = await signedInClient(testUser)
    await use(client)
  },
})

/**
 * Unauthenticated fixture — for landing/auth/reset pages and AuthGuard redirect
 * tests. Does NOT seed a session. Tests that need a user to sign in with can
 * call `createTestUser()` directly and clean up themselves.
 */
export const publicTest = base

export { expect }
