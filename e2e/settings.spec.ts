import { test, expect } from './fixtures'

test.describe('Settings — base currency propagation', () => {
  test('changing base currency updates dashboard stat cards', async ({ page, userSupabase }) => {
    // Seed an account and a transaction so dashboard has non-zero values.
    const { data: account, error: accountErr } = await userSupabase
      .from('accounts')
      .insert({ name: 'Checking', type: 'checking', currency: 'USD', balance: 0 })
      .select()
      .single()
    if (accountErr || !account) throw accountErr

    const { data: cats, error: catsErr } = await userSupabase
      .from('categories')
      .insert([{ name: 'Salary', type: 'income', color: '#10b981' }])
      .select()
    if (catsErr || !cats) throw catsErr
    const salary = cats.find((c) => c.name === 'Salary')!

    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`

    const { error: txErr } = await userSupabase.from('transactions').insert([
      {
        account_id: account.id,
        category_id: salary.id,
        type: 'income',
        amount: 5000,
        currency: 'USD',
        base_amount: 5000,
        base_currency: 'USD',
        date: thisMonth,
        description: 'Monthly salary',
      },
    ])
    if (txErr) throw txErr

    await page.goto('/app/dashboard')
    // Wait for data to load.
    await expect(page.getByText('Net Worth')).toBeVisible()

    // Net Worth card uses variant="primary" (bg-primary). Target it by its
    // distinctive uppercase label text combined with the card container class.
    const netWorthCard = page.locator('.rounded-xl', { hasText: /^Net Worth/ }).first()
    await expect(netWorthCard).toContainText('$')

    // Navigate to settings and change base currency to EUR.
    await page.goto('/app/settings')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Settings')

    // Click the currency select trigger inside the Base Currency card.
    const currencyCard = page.getByText('Base Currency').locator('..')
    await currencyCard.locator('[data-slot="select-trigger"]').click()

    // Select EUR from the dropdown.
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'EUR' })
      .click()

    // Verify the select now shows EUR.
    await expect(currencyCard.locator('[data-slot="select-trigger"]')).toContainText('EUR')

    // Navigate back to dashboard — amounts should now display with € prefix.
    await page.goto('/app/dashboard')
    await expect(page.getByText('Net Worth')).toBeVisible()

    // The Net Worth stat card now uses formatCurrency with "EUR".
    const updatedCard = page.locator('.rounded-xl', { hasText: /^Net Worth/ }).first()
    await expect(updatedCard).toContainText('€')
  })

  test('changing base currency updates reports summary', async ({ page, userSupabase }) => {
    const { data: account, error: accountErr } = await userSupabase
      .from('accounts')
      .insert({ name: 'Checking', type: 'checking', currency: 'USD', balance: 0 })
      .select()
      .single()
    if (accountErr || !account) throw accountErr

    const { data: cats, error: catsErr } = await userSupabase
      .from('categories')
      .insert([
        { name: 'Salary', type: 'income', color: '#10b981' },
        { name: 'Groceries', type: 'expense', color: '#ef4444' },
      ])
      .select()
    if (catsErr || !cats) throw catsErr
    const salary = cats.find((c) => c.name === 'Salary')!
    const groceries = cats.find((c) => c.name === 'Groceries')!

    const now = new Date()
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`

    await userSupabase.from('transactions').insert([
      {
        account_id: account.id,
        category_id: salary.id,
        type: 'income',
        amount: 3000,
        currency: 'USD',
        base_amount: 3000,
        base_currency: 'USD',
        date: thisMonth,
        description: 'March pay',
      },
      {
        account_id: account.id,
        category_id: groceries.id,
        type: 'expense',
        amount: 500,
        currency: 'USD',
        base_amount: 500,
        base_currency: 'USD',
        date: thisMonth,
        description: 'Groceries',
      },
    ])

    // Verify reports shows USD values first.
    await page.goto('/app/reports')
    await expect(page.getByText('Income', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/\$3,000/).first()).toBeVisible()

    // Change base currency to GBP via settings.
    await page.goto('/app/settings')
    const currencyCard = page.getByText('Base Currency').locator('..')
    await currencyCard.locator('[data-slot="select-trigger"]').click()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'GBP' })
      .click()
    await expect(currencyCard.locator('[data-slot="select-trigger"]')).toContainText('GBP')

    // Go back to reports — values should now use £ prefix.
    await page.goto('/app/reports')
    await expect(page.getByText('Income', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/£3,000/).first()).toBeVisible()
  })

  test('theme switcher toggles visual mode', async ({ page }) => {
    await page.goto('/app/settings')

    // Default should be System — verify Dark button can be clicked.
    await page.getByRole('button', { name: 'Dark' }).click()

    // <html> should now have class "dark".
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Switch back to Light.
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
