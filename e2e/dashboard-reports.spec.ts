import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect } from './fixtures'

async function seedDashboardData(client: SupabaseClient) {
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
      { name: 'Rent', type: 'expense', color: '#f59e0b' },
    ])
    .select()
  if (catsErr || !cats) throw catsErr
  const salary = cats.find((c) => c.name === 'Salary')!
  const groceries = cats.find((c) => c.name === 'Groceries')!
  const rent = cats.find((c) => c.name === 'Rent')!

  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')

  const transactions = [
    {
      account_id: account.id,
      category_id: salary.id,
      type: 'income',
      amount: 5000,
      currency: 'USD',
      base_amount: 5000,
      base_currency: 'USD',
      date: `${y}-${pad(m)}-01`,
      description: 'Monthly salary',
    },
    {
      account_id: account.id,
      category_id: groceries.id,
      type: 'expense',
      amount: 350,
      currency: 'USD',
      base_amount: 350,
      base_currency: 'USD',
      date: `${y}-${pad(m)}-05`,
      description: 'Weekly groceries',
    },
    {
      account_id: account.id,
      category_id: rent.id,
      type: 'expense',
      amount: 1500,
      currency: 'USD',
      base_amount: 1500,
      base_currency: 'USD',
      date: `${y}-${pad(m)}-01`,
      description: 'Monthly rent',
    },
    {
      account_id: account.id,
      category_id: salary.id,
      type: 'income',
      amount: 5000,
      currency: 'USD',
      base_amount: 5000,
      base_currency: 'USD',
      date: `${y}-${pad(m > 1 ? m - 1 : 12)}-01`,
      description: 'Last month salary',
    },
    {
      account_id: account.id,
      category_id: groceries.id,
      type: 'expense',
      amount: 200,
      currency: 'USD',
      base_amount: 200,
      base_currency: 'USD',
      date: `${y}-${pad(m > 1 ? m - 1 : 12)}-10`,
      description: 'Last month groceries',
    },
  ]

  const { error: txErr } = await client.from('transactions').insert(transactions)
  if (txErr) throw txErr

  const { error: budgetErr } = await client.from('budgets').insert({
    name: 'Monthly Essentials',
    amount: 2000,
    period: 'monthly',
    start_date: `${y}-${pad(m)}-01`,
    category_ids: [rent.id, groceries.id],
  })
  if (budgetErr) throw budgetErr

  return { account, salary, groceries, rent }
}

test.describe('Dashboard with seeded data', () => {
  test('shows populated stat cards', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/dashboard')

    await expect(page.getByText('Net Worth')).toBeVisible()

    // The net worth card has bg-primary class, distinguishable from others.
    // Income this month = 5000, Expenses = 1850, Net Worth = sum of all balances.
    // The Income stat card shows $5,000 (current month).
    const incomeCard = page.locator('.rounded-xl', { hasText: /^Income/ }).first()
    await expect(incomeCard).toContainText('$5,000')

    // Expenses this month = 350 + 1500 = 1850
    const expenseCard = page.locator('.rounded-xl', { hasText: /^Expenses/ }).first()
    await expect(expenseCard).toContainText('$1,850')
  })

  test('shows bar chart instead of empty state', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/dashboard')

    await expect(page.getByText('Income vs Expenses')).toBeVisible()
    await expect(page.getByText('No transaction data yet')).not.toBeVisible()

    // Recharts renders a wrapper div when data exists.
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible()
  })

  test('shows spending by category pie', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/dashboard')

    await expect(page.getByText('Spending by Category')).toBeVisible()

    // Category names appear in the legend below the pie.
    await expect(page.getByText('Rent').first()).toBeVisible()
    await expect(page.getByText('Groceries').first()).toBeVisible()
  })

  test('shows recent transactions', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/dashboard')

    await expect(page.getByText('Recent Transactions')).toBeVisible()
    await expect(page.getByText('Monthly salary')).toBeVisible()
    await expect(page.getByText('Weekly groceries')).toBeVisible()
    await expect(page.getByText('Monthly rent')).toBeVisible()
  })

  test('shows active budgets with progress', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/dashboard')

    await expect(page.getByText('Active Budgets')).toBeVisible()
    await expect(page.getByText('Monthly Essentials')).toBeVisible()

    // The BudgetGauge renders an SVG with role="img" and aria-label.
    await expect(page.getByRole('img', { name: /Budget usage/ })).toBeVisible()
  })
})

test.describe('Reports with seeded data', () => {
  test('shows summary cards with correct values', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/reports')

    // Reports default date range is Jan 1 of current year → today, so all
    // seeded transactions fall within range.
    // Total income: 5000 (this month) + 5000 (last month) = 10000
    // Total expenses: 350 + 1500 + 200 = 2050
    await expect(page.getByText('Income', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.text-jade', { hasText: /10,000/ }).first()).toBeVisible()

    // Expenses card uses text-cinnabar
    await expect(page.locator('.text-cinnabar', { hasText: /2,050/ }).first()).toBeVisible()
  })

  test('date range filter narrows data', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/reports')

    await expect(page.getByText('Income', { exact: true }).first()).toBeVisible()

    // Set "To" date to before any seeded transactions.
    const filtersBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    const dateInputs = filtersBar.locator('input[type="date"]')
    await dateInputs.nth(1).fill('2023-12-31')

    // Reports should now show the empty state.
    await expect(page.getByText('No data for this period')).toBeVisible()
  })

  test('shows category breakdown table', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/reports')

    await expect(page.getByText('Category Breakdown')).toBeVisible()

    // Category names appear as table cells.
    await expect(page.getByRole('cell', { name: 'Groceries' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Rent' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Salary' })).toBeVisible()
  })

  test('shows income vs expenses and net worth charts', async ({ page, userSupabase }) => {
    await seedDashboardData(userSupabase)
    await page.goto('/app/reports')

    await expect(page.getByText('Income vs Expenses', { exact: true })).toBeVisible()
    await expect(page.getByText('Net Worth Over Time')).toBeVisible()

    // Both should render Recharts wrappers when data is present.
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible()
    await expect(page.locator('.recharts-wrapper').nth(1)).toBeVisible()
  })
})
