import { test, publicTest, expect } from './fixtures'

publicTest.describe('Public pages', () => {
  publicTest('landing page renders hero and features', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Abacus')
    await expect(page.getByText('Personal finance, precisely calculated')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get Started' })).toBeVisible()
    // Feature cards
    await expect(page.getByText('Accounts', { exact: true })).toBeVisible()
    await expect(page.getByText('Transactions', { exact: true })).toBeVisible()
    await expect(page.getByText('Insights', { exact: true })).toBeVisible()
  })

  publicTest('auth page renders sign in form', async ({ page }) => {
    await page.goto('/auth')
    await expect(page.getByText('Sign in to your account')).toBeVisible()
    await expect(page.locator('input[id="email"]')).toBeVisible()
    await expect(page.locator('input[id="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  publicTest('auth page can switch to sign up mode', async ({ page }) => {
    await page.goto('/auth')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page.getByText('Create a new account')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible()
  })

  publicTest('auth page has forgot password flow', async ({ page }) => {
    await page.goto('/auth')
    await page.getByText('Forgot password?').click()
    await expect(page.getByText('Reset your password')).toBeVisible()
    await expect(page.locator('input[id="email"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()
  })

  publicTest('reset password page renders', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await expect(page.getByText('Back to sign in')).toBeVisible()
  })

  publicTest('not found page renders for unknown public routes', async ({ page }) => {
    await page.goto('/non-existent-route')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Go to dashboard' })).toBeVisible()
  })
})

test.describe('App pages (authenticated)', () => {
  test('dashboard page renders stat cards', async ({ page }) => {
    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Dashboard')
    await expect(page.getByText('Net Worth')).toBeVisible()
    await expect(page.getByText('Income', { exact: true })).toBeVisible()
    await expect(page.getByText('Expenses', { exact: true })).toBeVisible()
    await expect(page.getByText('Budget Left')).toBeVisible()
    // Empty states for charts/recent
    await expect(page.getByText('No transaction data yet')).toBeVisible()
    await expect(page.getByText('No spending data this month')).toBeVisible()
    await expect(page.getByText('No transactions yet')).toBeVisible()
    await expect(page.getByText('No budgets yet')).toBeVisible()
  })

  test('sidebar navigation links work for all pages', async ({ page }) => {
    await page.goto('/app/dashboard')

    const navLinks = [
      { label: 'Accounts', heading: 'Accounts' },
      { label: 'Transactions', heading: 'Transactions' },
      { label: 'Budgets', heading: 'Budgets' },
      { label: 'Reports', heading: 'Reports' },
      { label: 'Categories', heading: 'Categories' },
      { label: 'Investments', heading: 'Investments' },
      { label: 'Settings', heading: 'Settings' },
    ]

    for (const { label, heading } of navLinks) {
      await page.getByRole('link', { name: label, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading)
    }
  })

  test('accounts page shows empty state', async ({ page }) => {
    await page.goto('/app/accounts')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Accounts')
    await expect(page.getByText('No accounts yet')).toBeVisible()
    await expect(page.getByText('Add your first account to get started.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Account' })).toBeVisible()
  })

  test('transactions page shows empty state and controls', async ({ page }) => {
    await page.goto('/app/transactions')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Transactions')
    await expect(page.getByText('No transactions yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import CSV' })).toBeVisible()
    // Header "Add Transaction" button (not FAB) — use first match
    await expect(page.getByRole('button', { name: 'Add Transaction' }).first()).toBeVisible()
  })

  test('budgets page shows empty state', async ({ page }) => {
    await page.goto('/app/budgets')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Budgets')
    await expect(page.getByText('No budgets yet')).toBeVisible()
    await expect(page.getByText('Create your first budget to start tracking.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Budget' })).toBeVisible()
  })

  test('reports page shows empty state', async ({ page }) => {
    await page.goto('/app/reports')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Reports')
    await expect(page.getByText('No data for this period')).toBeVisible()
  })

  test('categories page shows tabs and empty state', async ({ page }) => {
    await page.goto('/app/categories')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Categories')
    await expect(page.getByRole('tab', { name: 'Expenses' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Income' })).toBeVisible()
    await expect(page.getByText('No categories yet. Add one to get started.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Category' })).toBeVisible()
  })

  test('investments page shows empty state and controls', async ({ page }) => {
    await page.goto('/app/investments')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Investments')
    await expect(page.getByText('No investment plans yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Investment' })).toBeVisible()
  })

  test('settings page shows all sections', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings')
    await expect(page.getByText('Base Currency')).toBeVisible()
    await expect(page.getByText('Theme')).toBeVisible()
    await expect(page.getByText('Data Management')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    await expect(page.getByText('About Abacus')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export Data' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import Data' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible()
  })
})
