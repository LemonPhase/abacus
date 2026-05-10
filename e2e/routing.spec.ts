import { test, expect } from '@playwright/test'

test('dashboard page renders stat cards', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Dashboard')
  await expect(page.locator("p.uppercase:text-is('Net Worth')")).toBeVisible()
  await expect(page.locator("p.uppercase:text-is('Income')")).toBeVisible()
  await expect(page.locator("p.uppercase:text-is('Expenses')")).toBeVisible()
  await expect(page.locator("p.uppercase:text-is('Budget Left')")).toBeVisible()
})

test('sidebar navigation links work', async ({ page }) => {
  await page.goto('/')

  await page.getByText('Accounts').first().click()
  await expect(page.locator('h1')).toContainText('Accounts')

  await page.getByText('Transactions').first().click()
  await expect(page.locator('h1')).toContainText('Transactions')

  await page.getByText('Budgets').first().click()
  await expect(page.locator('h1')).toContainText('Budgets')

  await page.getByText('Reports').first().click()
  await expect(page.locator('h1')).toContainText('Reports')

  await page.getByText('Categories').first().click()
  await expect(page.locator('h1')).toContainText('Categories')

  await page.getByText('Investments').first().click()
  await expect(page.locator('h1')).toContainText('Investments')

  await page.getByText('Settings').first().click()
  await expect(page.locator('h1')).toContainText('Settings')
})

test('each page renders its empty state', async ({ page }) => {
  await page.goto('/accounts')
  await expect(page.getByText('No accounts yet')).toBeVisible()

  await page.goto('/transactions')
  await expect(page.getByText('No transactions yet')).toBeVisible()

  await page.goto('/budgets')
  await expect(page.getByText('No budgets yet')).toBeVisible()

  await page.goto('/reports')
  await expect(page.locator('h1')).toContainText('Reports')

  await page.goto('/settings')
  await expect(page.getByText('Base Currency')).toBeVisible()
  await expect(page.getByText('Data Management')).toBeVisible()
})

test('accounts CRUD flow', async ({ page }) => {
  await page.goto('/accounts')
  await page.locator('button:has(.lucide-plus)').first().click()
  await page.locator('input[id="name"]').fill('Main Checking')
  await page.locator('input[id="balance"]').fill('2500')
  await page.locator('[data-slot="dialog-content"] button:has-text("Add Account")').click()
  await expect(page.locator('text=Main Checking')).toBeVisible()
  await expect(page.locator('text=$2,500.00')).toBeVisible()

  // Edit
  await page.locator('table button').first().click()
  await page.locator('input[id="name"]').fill('Main Checking Updated')
  await page.locator('[data-slot="dialog-content"] button:has-text("Save")').click()
  await expect(page.locator('text=Main Checking Updated')).toBeVisible()

  // Delete
  await page.locator('table button').nth(1).click()
  await page.locator('[data-slot="dialog-content"] button:has-text("Delete")').click()
  await expect(page.locator('text=No accounts yet')).toBeVisible()
})

test('transactions page loads with controls', async ({ page }) => {
  await page.goto('/transactions')
  await expect(page.locator('h1')).toContainText('Transactions')
  await expect(page.getByText('Add Transaction')).toBeVisible()
  await expect(page.getByText('Import CSV')).toBeVisible()
  await expect(page.getByText('No transactions yet')).toBeVisible()
})
