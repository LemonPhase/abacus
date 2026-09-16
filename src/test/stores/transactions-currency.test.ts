import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getTable, resetAllTables } from '@/test/supabase-mock'
import { reliableBaseAmount } from '@/lib/currency'

function stubRate(rates: Record<string, number>): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ result: 'success', rates }),
  })
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  useSettingsStore.setState({ baseCurrency: 'USD' })
})

afterEach(() => {
  resetAllTables()
  vi.unstubAllGlobals()
})

describe('transactionsStore currency handling', () => {
  it('converts mixed currencies to the reporting currency with provenance', async () => {
    const mockFetch = stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(), // today → cacheable
    })

    expect(txn.baseCurrency).toBe('USD')
    expect(txn.baseAmount).toBe(54) // 50 × 1.08
    expect(txn.fxRate).toBe(1.08)
    expect(txn.fxDate).toBe(todayStr())
    expect(txn.baseAmountStale).toBe(false)

    // Cache write actually executed.
    const cacheRows = getTable('exchange_rates')
    expect(cacheRows).toHaveLength(1)
    expect(cacheRows[0].date).toBe(todayStr())
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('flags rows as stale when no rate is available instead of 1:1 fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(),
    })

    expect(txn.baseAmount).toBe(50)
    expect(txn.baseCurrency).toBe('EUR')
    expect(txn.fxRate).toBeNull()
    expect(txn.baseAmountStale).toBe(true)
    // Aggregations exclude it — no silent 1:1 conversion into USD totals.
    expect(reliableBaseAmount(txn, 'USD')).toBeNull()
  })

  it('labels historical conversions with the real quote date and fills the fetch-day cache row', async () => {
    const mockFetch = stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'income',
      amount: 100,
      currency: 'EUR',
      date: new Date('2020-06-15'),
    })

    expect(txn.baseAmount).toBe(108)
    expect(txn.fxDate).toBe(todayStr()) // quote is "as of today", not 2020-06-15
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // The quote is cached under the fetch day — never under the historical date.
    const cacheRows = getTable('exchange_rates')
    expect(cacheRows).toHaveLength(1)
    expect(cacheRows[0].date).toBe(todayStr())
  })

  // Regression: dialog dates parse as UTC midnight ("yesterday" west of UTC);
  // the cache read/write used to be skipped there. With a fixed west-of-UTC
  // test timezone, the cache row must still be written and the stored
  // transaction date must still round-trip to the entered day.
  it('fills the cache for dialog-entered dates in a UTC-negative timezone', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-17T15:00:00Z')) // local: Sep 17, 11:00 EDT
    const mockFetch = stubRate({ USD: 1.08 })

    try {
      const store = useTransactionsStore.getState()
      const txn = await store.add({
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 50,
        currency: 'EUR',
        date: new Date('2026-09-17'), // dialog-style UTC-midnight parse
      })

      expect(txn.baseAmount).toBe(54)
      expect(txn.fxDate).toBe('2026-09-17')
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(getTable('exchange_rates')).toHaveLength(1)

      // The stored date column still yields the entered day: supabase-js
      // serializes the Date to a full ISO instant, which Postgres casts to a
      // date per its session timezone — UTC midnight serializes to the entered
      // day in every zone.
      const dbRow = getTable('transactions').find((r) => r.id === txn.id)
      const serialized = JSON.parse(JSON.stringify(dbRow?.date)) as string
      expect(serialized.slice(0, 10)).toBe('2026-09-17')
    } finally {
      vi.useRealTimers()
      process.env.TZ = originalTz
    }
  })

  it('recalculates base fields when the amount is edited', async () => {
    stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(),
    })
    expect(txn.baseAmount).toBe(54)

    await store.update(txn.id, { amount: 100 })
    const updated = useTransactionsStore.getState().getById(txn.id)!
    expect(updated.amount).toBe(100)
    expect(updated.baseAmount).toBe(108)
    expect(updated.fxRate).toBe(1.08)
    expect(updated.baseAmountStale).toBe(false)

    const dbRow = getTable('transactions').find((r) => r.id === txn.id)
    expect(dbRow?.base_amount).toBe(108)
  })

  it('recalculates base fields when the currency is edited', async () => {
    stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 100,
      currency: 'USD',
      date: new Date(),
    })
    expect(txn.baseAmount).toBe(100)

    await store.update(txn.id, { currency: 'EUR' })
    const updated = useTransactionsStore.getState().getById(txn.id)!
    expect(updated.currency).toBe('EUR')
    expect(updated.baseAmount).toBe(108)
    expect(updated.baseCurrency).toBe('USD')
    expect(updated.fxRate).toBe(1.08)
  })

  it('keeps base fields when nothing value-related changes (correlative updates)', async () => {
    stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(),
    })
    const before = getTable('exchange_rates').length

    await store.update(txn.id, { description: 'renamed' })
    const updated = useTransactionsStore.getState().getById(txn.id)!
    expect(updated.baseAmount).toBe(54)
    expect(getTable('exchange_rates')).toHaveLength(before)
  })

  it('uses the cached same-day rate for repeated additions (duplicate fills collapse)', async () => {
    const mockFetch = stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(),
    })
    await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 10,
      currency: 'EUR',
      date: new Date(),
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(getTable('exchange_rates')).toHaveLength(1)
  })

  it('bulk import converts per currency with one quote lookup per currency', async () => {
    const mockFetch = stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const inserted = await store.bulkAdd([
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 50,
        currency: 'EUR',
        date: new Date(),
      },
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 20,
        currency: 'EUR',
        date: new Date('2020-01-01'),
      },
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'income',
        amount: 30,
        currency: 'USD',
        date: new Date(),
      },
    ])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(inserted[0].baseAmount).toBe(54)
    expect(inserted[1].baseAmount).toBe(21.6)
    expect(inserted[1].fxDate).toBe(todayStr())
    expect(inserted[2].baseAmount).toBe(30)
    expect(inserted[2].fxRate).toBeNull()
  })

  it('excludes old-currency rows from aggregates after the reporting currency changes', async () => {
    stubRate({ USD: 1.08 })
    const store = useTransactionsStore.getState()
    const usdTxn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 100,
      currency: 'USD',
      date: new Date(),
    })
    const eurTxn = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 50,
      currency: 'EUR',
      date: new Date(),
    })
    expect(usdTxn.baseCurrency).toBe('USD')
    expect(eurTxn.baseCurrency).toBe('USD')

    // Reporting currency changes to EUR: the USD conversion of the USD
    // transaction is no longer valid, but the EUR transaction is now an
    // identity row and remains trustworthy.
    useSettingsStore.getState().setBaseCurrency('EUR')
    expect(reliableBaseAmount(usdTxn, 'EUR')).toBeNull()
    expect(reliableBaseAmount(eurTxn, 'EUR')).toBe(50)

    // New transactions convert into the new reporting currency (USD → EUR).
    stubRate({ EUR: 0.9 })
    const fresh = await store.add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 100,
      currency: 'USD',
      date: new Date(),
    })
    expect(fresh.baseCurrency).toBe('EUR')
    expect(fresh.baseAmount).toBe(90)
    expect(reliableBaseAmount(fresh, 'EUR')).toBe(90)
  })
})
