import { test, expect } from './fixtures'

test.describe('Recurring Transactions CRUD', () => {
  test('create deps then add, edit, and delete a recurring transaction', async ({ page }) => {
    // Step 1: Create an account (needed for recurring form select)
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
    await page.locator('input[id="cat-name"]').fill('Subscriptions')
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Add Category' })
      .click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Step 3: Navigate to recurring and create one
    await page.goto('/app/recurring')
    await expect(page.getByText('No recurring transactions')).toBeVisible()

    // Open add dialog
    await page.getByRole('button', { name: 'Add Recurring' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    const dialog = page.locator('[data-slot="dialog-content"]')

    // Select type (default is Expense, no need to change)
    // Select account
    await dialog.locator('[data-slot="select-trigger"]').nth(1).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Checking' })
      .click()

    // Select category
    await dialog.locator('[data-slot="select-trigger"]').nth(2).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Subscriptions' })
      .click()

    // Fill remaining fields
    await page.locator('input[id="rc-amount"]').fill('15')
    await page.locator('input[id="rc-desc"]').fill('Netflix')

    // Submit
    await dialog.getByRole('button', { name: 'Add Recurring Transaction' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify recurring appears
    await expect(page.getByText('Netflix')).toBeVisible()

    // Edit — click the pencil icon button
    const row = page.locator('tr', { hasText: 'Netflix' })
    await row.locator('button').nth(1).click()
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible()

    // Change description
    await page.locator('input[id="rc-desc"]').fill('Netflix Premium')
    await page.locator('[data-slot="dialog-content"]').getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // Verify update
    await expect(page.getByText('Netflix Premium')).toBeVisible()

    // Delete — click the trash icon button
    const updatedRow = page.locator('tr', { hasText: 'Netflix Premium' })
    await updatedRow.locator('button').last().click()
    await expect(page.getByText('Delete Recurring Transaction')).toBeVisible()
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole('button', { name: 'Delete' })
      .click()

    // Verify deleted
    await expect(page.getByText('No recurring transactions')).toBeVisible()
  })
})
