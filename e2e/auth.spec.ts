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
