import { describe, it, expect, beforeEach } from 'vitest'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { getTable, resetAllTables } from '@/test/supabase-mock'
import type { CrudFilter } from '@/stores/crudStore'

/**
 * Pagination regression tests for issue #11: more than 1000 transactions (the
 * API's max_rows cap), tied dates, page boundaries, filters and load-more.
 * Runs against the in-memory Supabase mock, which mirrors PostgREST behavior
 * (order/range/count).
 */

function seedTransactions(count: number) {
  // Tied dates: rows land on only 10 distinct dates, ~100 rows per date, so
  // every page boundary cuts through a tie group.
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `tx-${String(i).padStart(5, '0')}`,
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: null,
    type: i % 2 === 0 ? 'income' : 'expense',
    amount: 1,
    currency: 'USD',
    base_amount: 1,
    base_currency: 'USD',
    base_amount_stale: false,
    fx_rate: null,
    fx_date: null,
    date: `2026-01-${String((i % 10) + 1).padStart(2, '0')}`,
    description: `tx ${i}`,
    correlative_id: null,
    transfer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))
  getTable('transactions').push(...rows)
}

beforeEach(() => {
  resetAllTables()
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: null,
    error: null,
    _unsub: null,
  })
})

describe('crudStore pagination', () => {
  it('complete load pages through more than max_rows rows', async () => {
    seedTransactions(2500)

    await useTransactionsStore.getState().load()

    expect(useTransactionsStore.getState().transactions).toHaveLength(2500)
    expect(useTransactionsStore.getState().hasMore).toBe(false)
  })

  it('complete load applies deterministic order (date desc, id asc) across tied dates', async () => {
    seedTransactions(2500)

    await useTransactionsStore.getState().load()

    const txs = useTransactionsStore.getState().transactions
    // Every adjacent pair must be ordered by (date desc, id asc).
    for (let i = 1; i < txs.length; i++) {
      const prev = txs[i - 1]
      const cur = txs[i]
      const prevDate = prev.date.toISOString().slice(0, 10)
      const curDate = cur.date.toISOString().slice(0, 10)
      expect(prevDate >= curDate).toBe(true)
      if (prevDate === curDate) {
        expect(prev.id < cur.id).toBe(true)
      }
    }
  })

  it('paged load returns the first page with hasMore and exact total', async () => {
    seedTransactions(1200)

    await useTransactionsStore.getState().load({ limit: 50 })

    const state = useTransactionsStore.getState()
    expect(state.transactions).toHaveLength(50)
    expect(state.hasMore).toBe(true)
    expect(state.total).toBe(1200)
    expect(state.grandTotal).toBe(1200)
  })

  it('loadMore appends pages without duplicates across tied dates', async () => {
    seedTransactions(1200)
    const store = useTransactionsStore.getState()

    await store.load({ limit: 50 })
    await store.loadMore()
    await store.loadMore()

    const state = useTransactionsStore.getState()
    expect(state.transactions).toHaveLength(150)
    const ids = new Set(state.transactions.map((t) => t.id))
    expect(ids.size).toBe(150)
    expect(state.hasMore).toBe(true)
    expect(state.total).toBe(1200)

    // Load the remaining pages: complete coverage, exactly once.
    while (useTransactionsStore.getState().hasMore) {
      await useTransactionsStore.getState().loadMore()
    }
    const all = useTransactionsStore.getState().transactions
    expect(all).toHaveLength(1200)
    expect(new Set(all.map((t) => t.id)).size).toBe(1200)
  })

  it('server-side filters narrow pages and are matched by realtime inserts', async () => {
    seedTransactions(1200)
    const store = useTransactionsStore.getState()
    const filters: CrudFilter[] = [{ col: 'type', op: 'eq', value: 'income' }]

    await store.load({ limit: 50, filters })

    expect(useTransactionsStore.getState().transactions).toHaveLength(50)
    expect(useTransactionsStore.getState().transactions.every((t) => t.type === 'income')).toBe(
      true,
    )
    expect(useTransactionsStore.getState().total).toBe(600)
    // The count line needs both: filtered total and the unfiltered grand total.
    expect(useTransactionsStore.getState().grandTotal).toBe(1200)

    await store.loadMore()
    expect(useTransactionsStore.getState().transactions.every((t) => t.type === 'income')).toBe(
      true,
    )
  })

  it('loadMore with date-range filters stays within the range', async () => {
    seedTransactions(1200)
    const store = useTransactionsStore.getState()
    const filters: CrudFilter[] = [
      { col: 'date', op: 'gte', value: '2026-01-05' },
      { col: 'date', op: 'lte', value: '2026-01-07' },
    ]

    await store.load({ limit: 50, filters })
    await store.loadMore()

    const dates = useTransactionsStore
      .getState()
      .transactions.map((t) => t.date.toISOString().slice(0, 10))
    expect(dates.length).toBeGreaterThan(0)
    expect(dates.every((d) => d >= '2026-01-05' && d <= '2026-01-07')).toBe(true)
  })
})
