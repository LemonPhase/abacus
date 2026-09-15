import { createClient } from '@supabase/supabase-js'

import {
  test,
  publicTest,
  expect,
  createTestUser,
  deleteTestUser,
  deleteUserByEmail,
} from './fixtures'

/**
 * Auth flow specs. These run against real GoTrue — sign-in / sign-up / reset
 * actually hit Supabase, so we exercise real error messages, real session
 * persistence, and the real AuthGuard redirect cycle.
 */

function uniqueSignupEmail() {
  return `e2e-signup-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

publicTest.describe('AuthGuard', () => {
  publicTest('redirects unauthenticated visits to /auth', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth$/)
    await expect(page.getByText('Sign in to your account')).toBeVisible()
  })

  publicTest('preserves the originally requested path through sign-in', async ({ page }) => {
    const user = await createTestUser()
    try {
      await page.goto('/app/budgets')
      await expect(page).toHaveURL(/\/auth$/)

      await page.locator('input[id="email"]').fill(user.email)
      await page.locator('input[id="password"]').fill(user.password)
      await page.getByRole('button', { name: 'Sign In' }).click()

      await expect(page).toHaveURL(/\/app\/budgets$/)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Budgets')
    } finally {
      await deleteTestUser(user.id)
    }
  })
})

publicTest.describe('Sign in', () => {
  publicTest('valid credentials land on /app/dashboard', async ({ page }) => {
    const user = await createTestUser()
    try {
      await page.goto('/auth')
      await page.locator('input[id="email"]').fill(user.email)
      await page.locator('input[id="password"]').fill(user.password)
      await page.getByRole('button', { name: 'Sign In' }).click()

      await expect(page).toHaveURL(/\/app\/dashboard$/)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Dashboard')
    } finally {
      await deleteTestUser(user.id)
    }
  })

  publicTest('wrong password shows GoTrue error and stays on /auth', async ({ page }) => {
    const user = await createTestUser()
    try {
      await page.goto('/auth')
      await page.locator('input[id="email"]').fill(user.email)
      await page.locator('input[id="password"]').fill('definitely-not-the-password')
      await page.getByRole('button', { name: 'Sign In' }).click()

      await expect(page.getByText('Invalid login credentials')).toBeVisible()
      await expect(page).toHaveURL(/\/auth$/)
    } finally {
      await deleteTestUser(user.id)
    }
  })

  publicTest('invalid email format surfaces client-side validation', async ({ page }) => {
    await page.goto('/auth')
    await page.locator('input[id="email"]').fill('not-an-email')
    await page.locator('input[id="password"]').fill('password123')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByText('Please enter a valid email address')).toBeVisible()
    await expect(page).toHaveURL(/\/auth$/)
  })
})

publicTest.describe('Sign up', () => {
  publicTest('creates an account and lands on /app/dashboard', async ({ page }) => {
    const email = uniqueSignupEmail()
    try {
      await page.goto('/auth')
      await page.getByRole('button', { name: 'Sign up' }).click()
      await expect(page.getByText('Create a new account')).toBeVisible()

      await page.locator('input[id="email"]').fill(email)
      await page.locator('input[id="password"]').fill('password123')
      await page.locator('input[id="confirm-password"]').fill('password123')
      await page.getByRole('button', { name: 'Sign Up' }).click()

      await expect(page).toHaveURL(/\/app\/dashboard$/)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Dashboard')
    } finally {
      await deleteUserByEmail(email)
    }
  })

  publicTest('mismatched passwords block submission with a field error', async ({ page }) => {
    await page.goto('/auth')
    await page.getByRole('button', { name: 'Sign up' }).click()

    await page.locator('input[id="email"]').fill(uniqueSignupEmail())
    await page.locator('input[id="password"]').fill('password123')
    await page.locator('input[id="confirm-password"]').fill('different456')
    await page.getByRole('button', { name: 'Sign Up' }).click()

    await expect(page.getByText('Passwords do not match')).toBeVisible()
    // Form should not have navigated — still on /auth.
    await expect(page).toHaveURL(/\/auth$/)
  })

  publicTest('missing confirmation password blocks submission', async ({ page }) => {
    await page.goto('/auth')
    await page.getByRole('button', { name: 'Sign up' }).click()

    await page.locator('input[id="email"]').fill(uniqueSignupEmail())
    await page.locator('input[id="password"]').fill('password123')
    await page.getByRole('button', { name: 'Sign Up' }).click()

    await expect(page.getByText('Please confirm your password')).toBeVisible()
    await expect(page).toHaveURL(/\/auth$/)
  })
})

/**
 * Local Supabase (Inbucket, port 54324) captures every email the stack sends.
 * GoTrue rate-limits password-reset emails to 2/hour (supabase/config.toml),
 * so don't re-run this test in a tight loop.
 */
async function fetchRecoveryLink(email: string): Promise<string> {
  const mailbox = email.split('@')[0]
  const base = 'http://127.0.0.1:54324/api/v1/mailbox'

  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${base}/${mailbox}`)
    if (res.ok) {
      const messages = (await res.json()) as Array<{ id: string }>
      const message = messages.at(-1)
      if (message) {
        const full = await fetch(`${base}/${mailbox}/${message.id}`)
        if (full.ok) {
          const content = JSON.stringify(await full.json())
          const link = content
            .match(/https?:\/\/[^"\\\s<>]+/g)
            ?.find((url) => url.includes('/auth/v1/verify'))
          if (link) return link.replaceAll('&amp;', '&')
        }
      }
    }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`No recovery email arrived in Inbucket for ${email} after 10s`)
}

publicTest.describe('Forgot password', () => {
  publicTest('submitting the form shows the confirmation view', async ({ page }) => {
    await page.goto('/auth')
    await page.getByText('Forgot password?').click()
    await expect(page.getByText('Reset your password')).toBeVisible()

    await page.locator('input[id="email"]').fill('someone@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()

    await expect(page.getByText('Check your email')).toBeVisible()
    await expect(page.getByText(/If an account exists for/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to sign in' })).toBeVisible()
  })

  publicTest(
    'recovery link redirects to /auth/reset-password and sets a new password',
    async ({ page }) => {
      const user = await createTestUser()
      try {
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

        // The email deep-links into the SPA (/auth/reset-password#access_token=…).
        // On a static host this only resolves when the deployment serves the app
        // shell for extensionless paths — the routing config under test (#6).
        const response = await page.goto(link)
        expect(response?.status()).toBe(200)
        await expect(page).toHaveURL(/\/auth\/reset-password/)
        await expect(page.locator('input[id="password"]')).toBeVisible()

        await page.locator('input[id="password"]').fill('brand-new-password-456')
        await page.getByRole('button', { name: 'Set new password' }).click()
        await expect(page.getByText('Password updated')).toBeVisible()
      } finally {
        await deleteTestUser(user.id)
      }
    },
  )
})

test.describe('Sign out', () => {
  test('clears the session and re-protects /app/* routes', async ({ page }) => {
    await page.goto('/app/settings')
    await page.getByRole('button', { name: 'Sign Out' }).click()

    // AuthGuard redirects once user becomes null.
    await expect(page).toHaveURL(/\/auth/)
    await expect(page.getByText('Sign in to your account')).toBeVisible()

    // Direct attempt at an authenticated route should bounce back to /auth.
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth/)
  })
})
