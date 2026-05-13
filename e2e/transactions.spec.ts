import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './fixtures'

async function seedTransactions(client: SupabaseClient) {
  const { data: account, error: accountErr } = await client
    .from('accounts')
    .insert({ name: 'Checking', type: 'checking', currency: 'USD', balance: 0 })
    .select()
    .single()
  if (accountErr || !account) throw accountErr

  const { data: cats, error: catsErr } = await client
    .from('categories')
    .insert([
      { name: 'Salary', type: 'income', color: '#10b981' },
      { name: 'Groceries', type: 'expense', color: '#ef4444' },
    ])
    .select()
  if (catsErr || !cats) throw catsErr
  const salary = cats.find((c) => c.name === 'Salary')!
  const groceries = cats.find((c) => c.name === 'Groceries')!

  const { error: txErr } = await client.from('transactions').insert([
    {
      account_id: account.id,
      category_id: salary.id,
      type: 'income',
      amount: 5000,
      currency: 'USD',
      base_amount: 5000,
      base_currency: 'USD',
      date: '2024-03-01',
      description: 'March salary',
    },
    {
      account_id: account.id,
      category_id: groceries.id,
      type: 'expense',
      amount: 150,
      currency: 'USD',
      base_amount: 150,
      base_currency: 'USD',
      date: '2024-03-15',
      description: 'Whole Foods',
    },
    {
      account_id: account.id,
      category_id: groceries.id,
      type: 'expense',
      amount: 200,
      currency: 'USD',
      base_amount: 200,
      base_currency: 'USD',
      date: '2024-02-10',
      description: 'February pantry run',
    },
  ])
  if (txErr) throw txErr

  return { account, salary, groceries }
}

async function openSelectAndChoose(
  page: (typeof test)['_pagePrototype'],
  triggerText: string,
  itemText: string,
) {
  await page
    .locator('[data-slot="select-trigger"]')
    .filter({ hasText: triggerText })
    .first()
    .click()
  await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
  await page
    .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
    .filter({ hasText: itemText })
    .click()
}

test.describe('Transactions filters', () => {
  test('type filter narrows table to income only', async ({ page, userSupabase }) => {
    await seedTransactions(userSupabase)
    await page.goto('/app/transactions')

    await expect(page.getByText('March salary')).toBeVisible()
    await expect(page.getByText('Whole Foods')).toBeVisible()
    await expect(page.getByText('February pantry run')).toBeVisible()

    // The filter bar has 3 selects in order: Account, Category, Type.
    // The Type select is the 3rd one (index 2), showing "All" initially.
    const filterBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    await filterBar.locator('[data-slot="select-trigger"]').nth(2).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Income' })
      .click()

    await expect(page.getByText('March salary')).toBeVisible()
    await expect(page.getByText('Whole Foods')).not.toBeVisible()
    await expect(page.getByText('February pantry run')).not.toBeVisible()
  })

  test('category filter narrows table to that category', async ({ page, userSupabase }) => {
    await seedTransactions(userSupabase)
    await page.goto('/app/transactions')

    await expect(page.getByText('March salary')).toBeVisible()

    await openSelectAndChoose(page, 'All categories', 'Groceries')

    await expect(page.getByText('March salary')).not.toBeVisible()
    await expect(page.getByText('Whole Foods')).toBeVisible()
    await expect(page.getByText('February pantry run')).toBeVisible()
  })

  test('date range filter excludes transactions outside the window', async ({
    page,
    userSupabase,
  }) => {
    await seedTransactions(userSupabase)
    await page.goto('/app/transactions')

    const filterBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    await filterBar.locator('input[type="date"]').first().fill('2024-03-01')

    await expect(page.getByText('March salary')).toBeVisible()
    await expect(page.getByText('Whole Foods')).toBeVisible()
    await expect(page.getByText('February pantry run')).not.toBeVisible()

    await filterBar.locator('input[type="date"]').nth(1).fill('2024-03-10')

    await expect(page.getByText('March salary')).toBeVisible()
    await expect(page.getByText('Whole Foods')).not.toBeVisible()
    await expect(page.getByText('February pantry run')).not.toBeVisible()
  })

  test('clear filters restores the full list', async ({ page, userSupabase }) => {
    await seedTransactions(userSupabase)
    await page.goto('/app/transactions')

    const filterBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    // Type filter (3rd select)
    await filterBar.locator('[data-slot="select-trigger"]').nth(2).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Income' })
      .click()
    await expect(page.getByText('Whole Foods')).not.toBeVisible()

    await page.getByRole('button', { name: 'Clear filters' }).click()

    await expect(page.getByText('March salary')).toBeVisible()
    await expect(page.getByText('Whole Foods')).toBeVisible()
    await expect(page.getByText('February pantry run')).toBeVisible()
  })

  test('filters with zero matches show the empty-matches message', async ({
    page,
    userSupabase,
  }) => {
    await seedTransactions(userSupabase)
    await page.goto('/app/transactions')

    const filterBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    await filterBar.locator('input[type="date"]').first().fill('2025-01-01')
    await filterBar.locator('input[type="date"]').nth(1).fill('2025-01-31')

    await expect(page.getByText('No transactions match your filters')).toBeVisible()
    await expect(page.getByText('March salary')).not.toBeVisible()
  })
})

test.describe('CSV import', () => {
  test('imports transactions through the upload → map → preview flow', async ({
    page,
    userSupabase,
  }) => {
    const { error: accountErr } = await userSupabase
      .from('accounts')
      .insert({ name: 'Checking', type: 'checking', currency: 'USD', balance: 0 })
    if (accountErr) throw accountErr
    const { error: catErr } = await userSupabase
      .from('categories')
      .insert({ name: 'Imported', type: 'expense', color: '#ef4444' })
    if (catErr) throw catErr

    await page.goto('/app/transactions')
    await expect(page.getByText('No transactions yet')).toBeVisible()

    await page.getByRole('button', { name: 'Import CSV' }).click()
    await expect(page.getByRole('heading', { name: 'Import CSV' })).toBeVisible()

    const csv = [
      'date,amount,description',
      '2024-04-01,-25.50,Coffee shop',
      '2024-04-02,3000.00,Freelance gig',
      '2024-04-03,-150.00,Grocery store',
    ].join('\n')

    await page
      .locator('[data-slot="dialog-content"] input[type="file"]')
      .setInputFiles({ name: 'sample.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

    await expect(page.getByRole('heading', { name: 'Map Columns' })).toBeVisible()
    await page.getByRole('button', { name: 'Preview' }).click()

    await expect(page.getByRole('heading', { name: 'Preview Import' })).toBeVisible()
    await expect(page.getByText('3 transactions will be imported.')).toBeVisible()

    // Preview pickers — Account first, then Default Category.
    const dialog = page.locator('[data-slot="dialog-content"]')
    await dialog.locator('[data-slot="select-trigger"]').nth(0).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Checking' })
      .click()
    await dialog.locator('[data-slot="select-trigger"]').nth(1).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Imported' })
      .click()

    await dialog.getByRole('button', { name: /Import 3 Transactions/ }).click()
    await expect(page.locator('[data-slot="dialog-content"]')).not.toBeVisible()

    // All three rows should now be in the transactions table.
    await expect(page.getByText('Coffee shop')).toBeVisible()
    await expect(page.getByText('Freelance gig')).toBeVisible()
    await expect(page.getByText('Grocery store')).toBeVisible()

    // Sign-aware type detection: positive amounts show jade (+), negative show cinnabar (−).
    // The amount column shows: "+ $3,000" for income, "− $25.50" for expense.
    const freelanceRow = page.locator('tr', { hasText: 'Freelance gig' })
    await expect(freelanceRow).toContainText('+')
    const coffeeRow = page.locator('tr', { hasText: 'Coffee shop' })
    await expect(coffeeRow).toContainText('−')
  })
})
