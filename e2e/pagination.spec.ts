import * as fs from 'node:fs'
import * as path from 'node:path'
import { test, expect } from './fixtures'

/**
 * Audit 07 (issue #11) regression: server-side pagination, deterministic
 * ordering over tied dates, filters and a complete multi-page export — all
 * against a dataset larger than the API's max_rows cap (1000).
 */

const TOTAL = 1050

async function seedLargeDataset(
  client: Awaited<ReturnType<typeof import('./fixtures').signedInClient>>,
) {
  const { data: account, error: accountErr } = await client
    .from('accounts')
    .insert({ name: 'Bulk Checking', type: 'checking', currency: 'USD', balance: 0 })
    .select()
    .single()
  if (accountErr || !account) throw accountErr

  // Tied dates: only 10 distinct dates, so every page boundary cuts through a
  // tie group and deterministic ordering (date desc, id asc) is exercised.
  const rows = Array.from({ length: TOTAL }, (_, i) => ({
    account_id: account.id,
    category_id: null,
    type: i % 2 === 0 ? ('income' as const) : ('expense' as const),
    amount: 1,
    currency: 'USD',
    base_amount: 1,
    base_currency: 'USD',
    date: `2024-01-${String((i % 10) + 1).padStart(2, '0')}`,
    description: `Load test tx #${String(i).padStart(5, '0')}`,
  }))

  const { error: txErr } = await client.from('transactions').insert(rows)
  if (txErr) throw txErr

  return { accountId: account.id }
}

test.describe('Pagination over >1000 transactions', () => {
  test('loads first page, load-more appends, filters stay server-side', async ({
    page,
    userSupabase,
  }) => {
    await seedLargeDataset(userSupabase)
    await page.goto('/app/transactions')

    const rows = page.locator('table tbody tr')

    // First page only — the API cap no longer silently truncates the rest.
    // (Ids are random UUIDs, so which descriptions land on page 1 is not
    // deterministic; the counts are.)
    await expect(page.getByText('Showing 50 of 1050 transactions')).toBeVisible()
    expect(await rows.count()).toBe(50)

    // Load more appends the next page without duplicates.
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByText('Showing 100 of 1050 transactions')).toBeVisible()
    expect(await rows.count()).toBe(100)

    // Deterministic pagination under tied dates: filter to income, then load
    // another page — 100 distinct rows, no duplicates. The count line keeps
    // showing the unfiltered grand total as its denominator.
    const filterBar = page.locator('.flex.flex-wrap.items-end.gap-3.rounded-xl.border.bg-card')
    await filterBar.locator('[data-slot="select-trigger"]').nth(2).click()
    await expect(page.locator('[data-slot="select-content"][data-open]')).toBeVisible()
    await page
      .locator('[data-slot="select-content"][data-open] [data-slot="select-item"]')
      .filter({ hasText: 'Income' })
      .click()
    await expect(page.getByText('Showing 50 of 1050 transactions')).toBeVisible()

    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByText('Showing 100 of 1050 transactions')).toBeVisible()
    const descriptions = await page.locator('table tbody tr').allInnerTexts()
    const ids = descriptions.map((d) => d.match(/#(\d{5})/)?.[1])
    expect(new Set(ids).size).toBe(100)
  })

  test('export downloads the complete dataset across all pages', async ({ page, userSupabase }) => {
    await seedLargeDataset(userSupabase)
    await page.goto('/app/settings')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Data' }).click()
    const download = await downloadPromise
    await expect(page.getByText('Data exported successfully')).toBeVisible()

    const filePath = path.join('/tmp', download.suggestedFilename())
    await download.saveAs(filePath)
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'))

    expect(json.version).toBe(3)
    expect(json.transactions).toHaveLength(TOTAL)
    expect(json.accounts).toHaveLength(1)
    fs.unlinkSync(filePath)
  })
})
