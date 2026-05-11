import { test, expect } from './fixtures'

test.describe('Accounts CRUD', () => {
  test('add, edit, and delete an account', async ({ page }) => {
    await page.goto('/app/accounts')
    await expect(page.getByText('No accounts yet')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Account' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Fill form (type defaults to Checking, currency to USD)
    await page.locator('input[id="acct-name"]').fill('Main Checking')
    await page.locator('input[id="acct-balance"]').fill('2500')

    // Submit
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Account' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify account appears in the table
    await expect(page.getByText('Main Checking')).toBeVisible()

    // Edit — click the Pencil icon button in the row
    const row = page.locator('tr', { hasText: 'Main Checking' })
    await row.locator('button').first().click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    await page.locator('input[id="acct-name"]').fill('Main Checking Updated')
    await page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify update
    await expect(page.getByText('Main Checking Updated')).toBeVisible()

    // Delete — click the Trash2 icon button in the row
    const updatedRow = page.locator('tr', { hasText: 'Main Checking Updated' })
    await updatedRow.locator('button').last().click()
    await expect(page.getByText('Delete Account')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No accounts yet')).toBeVisible()
  })
})

test.describe('Categories CRUD', () => {
  test('add and delete a category', async ({ page }) => {
    await page.goto('/app/categories')
    await expect(page.getByText('No categories yet. Add one to get started.')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Category' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Default type is Expense — no need to change
    await page.locator('input[id="cat-name"]').fill('Groceries')

    // Submit
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Category' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify category appears
    await expect(page.getByText('Groceries')).toBeVisible()

    // Delete — click last button (Trash2) in the category row
    const row = page.locator('.rounded-lg', { hasText: 'Groceries' }).first()
    await row.locator('button').last().click()
    await expect(page.getByText('Delete Category')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No categories yet. Add one to get started.')).toBeVisible()
  })
})

test.describe('Investments CRUD', () => {
  test('add and delete an investment plan', async ({ page }) => {
    await page.goto('/app/investments')
    await expect(page.getByText('No investment plans yet')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Investment' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Fill form (type defaults to Index Fund)
    await page.locator('input[id="inv-name"]').fill('Index Fund')
    await page.locator('input[id="inv-initial"]').fill('10000')
    await page.locator('input[id="inv-monthly"]').fill('500')
    await page.locator('input[id="inv-return"]').fill('7')

    // Submit
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Investment' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify investment appears (in the plans table)
    await expect(page.locator('td').filter({ hasText: 'Index Fund' }).first()).toBeVisible()

    // Delete
    const row = page.locator('tr', { hasText: 'Index Fund' })
    await row.locator('button').last().click()
    await expect(page.getByText('Delete Investment')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No investment plans yet')).toBeVisible()
  })
})

test.describe('Transactions CRUD', () => {
  test('create deps then add and delete a transaction', async ({ page }) => {
    // Step 1: Create an account (needed for transaction form select)
    await page.goto('/app/accounts')
    await page.getByRole('button', { name: 'Add Account' }).click()
    await page.locator('input[id="acct-name"]').fill('Checking')
    await page.locator('input[id="acct-balance"]').fill('1000')
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Account' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Step 2: Create a category
    await page.goto('/app/categories')
    await page.getByRole('button', { name: 'Add Category' }).click()
    await page.locator('input[id="cat-name"]').fill('Food')
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Category' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Step 3: Navigate to transactions and create one
    await page.goto('/app/transactions')
    await expect(page.getByText('No transactions yet')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Transaction' }).first().click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Select account (second select trigger after Type)
    const dialog = page.locator('[data-slot="dialog-content"]')
    await dialog.locator('[data-slot="select-trigger"]').nth(1).click()
    // Wait for the opened popup (data-open) to appear
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Checking' })
      .click()

    // Select category (third trigger after Type and Account)
    await dialog.locator('[data-slot="select-trigger"]').nth(2).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Food' })
      .click()

    // Fill remaining fields
    await page.locator('input[id="tx-amount"]').fill('50')
    await page.locator('input[id="tx-desc"]').fill('Grocery run')
    await page.locator('input[id="tx-date"]').fill('2024-01-15')

    // Submit
    await dialog.getByRole('button', { name: 'Add Transaction' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify transaction appears
    await expect(page.getByText('Grocery run')).toBeVisible()
    await expect(page.getByText('$50')).toBeVisible()

    // Delete
    const row = page.locator('tr', { hasText: 'Grocery run' })
    await row.locator('button').last().click()
    await expect(page.getByText('Delete Transaction')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No transactions yet')).toBeVisible()
  })
})

test.describe('Budgets CRUD', () => {
  test('create dep then add and delete a budget', async ({ page }) => {
    // Step 1: Create an expense category (needed for budget form)
    await page.goto('/app/categories')
    await page.getByRole('button', { name: 'Add Category' }).click()
    await page.locator('input[id="cat-name"]').fill('Rent')
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Category' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Step 2: Go to budgets and create one
    await page.goto('/app/budgets')
    await expect(page.getByText('No budgets yet')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Budget' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Fill form
    await page.locator('input[id="budget-name"]').fill('Monthly Rent')
    await page.locator('input[id="budget-amount"]').fill('1500')
    await page.locator('input[id="budget-date"]').fill('2024-01-01')

    // Select category checkbox — click the label containing "Rent"
    // The category picker shows checkbox labels with category names
    const budgetDialog = page.locator('[data-slot="dialog-content"]')
    await budgetDialog.getByText('Rent').click()

    // Submit
    await budgetDialog.getByRole('button', { name: 'Add Budget' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify budget appears
    await expect(page.getByText('Monthly Rent')).toBeVisible()

    // Delete
    const card = page.locator('.rounded-xl.border', { hasText: 'Monthly Rent' })
    await card.locator('button').last().click()
    await expect(page.getByText('Delete Budget')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No budgets yet')).toBeVisible()
  })
})

test.describe('Settings', () => {
  test('export data button is present', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('button', { name: 'Export Data' })).toBeVisible()
  })

  test('theme switcher options are visible', async ({ page }) => {
    await page.goto('/app/settings')
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'System' })).toBeVisible()
  })
})

test.describe('Dashboard navigation', () => {
  test('dashboard empty state CTA buttons link to correct pages', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Add Transaction' }).first().click()
    await expect(page).toHaveURL('/app/transactions')

    await page.goto('/app/dashboard')
    await page.getByRole('button', { name: 'Create Budget' }).click()
    await expect(page).toHaveURL('/app/budgets')
  })
})

test.describe('FAB Navigation', () => {
  test('FAB navigates to transactions add', async ({ page }) => {
    await page.goto('/app/dashboard')
    await page.locator('[aria-label="Add Transaction"]').click()
    await expect(page).toHaveURL(/add=true/)
  })
})
