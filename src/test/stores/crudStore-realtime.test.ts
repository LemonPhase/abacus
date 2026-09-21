import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { supabase } from '@/supabase/client'
import { unsubscribeAll } from '@/supabase/realtime'
import { getTable, resetAllTables, chainableSelect } from '@/test/supabase-mock'
import type { CrudFilter } from '@/stores/crudStore'

/**
 * Realtime reconcile regression tests for issue #16: the subscription/load
 * gap, mid-load event buffering, duplicate suppression across every insert
 * path, out-of-order loads, reconnect refetch, and the paged-window rule.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accountRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: 'user-1',
    name: `Acct ${id}`,
    type: 'checking',
    currency: 'USD',
    balance: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function txRow(id: string, date: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: null,
    type: 'expense',
    amount: 1,
    currency: 'USD',
    base_amount: 1,
    base_currency: 'USD',
    base_amount_stale: false,
    fx_rate: null,
    fx_date: null,
    date,
    description: `tx ${id}`,
    correlative_id: null,
    transfer_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Channel mock that lets tests fire postgres changes and status events. */
function controlledChannel() {
  const api: {
    pgHandler?: (p: Record<string, unknown>) => void
    statusCb?: (s: string) => void
  } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel: any = {
    on: vi.fn((_e: string, _f: unknown, h: (p: Record<string, unknown>) => void) => {
      api.pgHandler = h
      return channel
    }),
    subscribe: vi.fn((cb?: (s: string) => void) => {
      api.statusCb = cb
      return channel
    }),
  }
  return {
    channel,
    insert: (row: Record<string, unknown>) =>
      api.pgHandler!({ eventType: 'INSERT', new: row, old: {} }),
    update: (row: Record<string, unknown>) =>
      api.pgHandler!({ eventType: 'UPDATE', new: row, old: {} }),
    del: (row: Record<string, unknown>) =>
      api.pgHandler!({ eventType: 'DELETE', new: {}, old: row }),
    status: (s: string) => api.statusCb?.(s),
  }
}

/** Seed N transactions across 10 dates (20 rows per date, ~100 per date group). */
function seedTransactions(count: number) {
  getTable('transactions').push(
    ...Array.from({ length: count }, (_, i) =>
      txRow(`tx-${String(i).padStart(5, '0')}`, `2026-01-${String((i % 10) + 1).padStart(2, '0')}`),
    ),
  )
}

const incomeFilter: CrudFilter[] = [{ col: 'type', op: 'eq', value: 'income' }]

beforeEach(() => {
  resetAllTables()
  unsubscribeAll()
  useAccountsStore.getState().reset()
  useAccountsStore.setState({
    accounts: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: null,
    error: null,
    _unsub: null,
  })
  useTransactionsStore.getState().reset()
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

// Originals are restored via local save/restore so overrides never leak.
let originalFrom: typeof supabase.from
let originalChannel: typeof supabase.channel
beforeEach(() => {
  supabase.from = originalFrom
  supabase.channel = originalChannel
})
beforeAll(() => {
  originalFrom = supabase.from
  originalChannel = supabase.channel
})

// ---------------------------------------------------------------------------
// Subscription/load gap
// ---------------------------------------------------------------------------

describe('subscription/load gap', () => {
  it('subscribes before issuing the first query', async () => {
    const cc = controlledChannel()
    const calls: string[] = []
    supabase.channel = vi.fn(() => {
      calls.push('subscribe')
      return cc.channel
    })
    supabase.from = vi.fn().mockImplementation(() => {
      calls.push('query')
      return {
        select: vi.fn(() =>
          chainableSelect(Promise.resolve({ data: [], error: null, count: null })),
        ),
      }
    })

    await useAccountsStore.getState().load()

    expect(calls).toEqual(['subscribe', 'query'])
  })

  it('applies a realtime event that arrives during the initial load, exactly once', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    let resolveLoad!: (v: unknown) => void
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(new Promise((resolve) => void (resolveLoad = resolve)))),
    }))

    const load = useAccountsStore.getState().load()
    cc.insert(accountRow('acc-live')) // mid-load: buffered, not applied live
    expect(useAccountsStore.getState().accounts).toEqual([])

    resolveLoad({ data: [], error: null, count: null })
    await load

    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-live'])

    // A duplicate of the same event must not create a second row.
    cc.insert(accountRow('acc-live'))
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
  })

  it('replays mid-load events in arrival order (insert then delete)', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    let resolveLoad!: (v: unknown) => void
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(new Promise((resolve) => void (resolveLoad = resolve)))),
    }))

    const load = useAccountsStore.getState().load()
    cc.insert(accountRow('acc-a'))
    cc.insert(accountRow('acc-b'))
    cc.del(accountRow('acc-a'))
    resolveLoad({ data: [], error: null, count: null })
    await load

    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-b'])
  })

  it('a concurrent newer load wins and still receives the buffered event', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    let resolveOld!: (v: unknown) => void
    let resolveNew!: (v: unknown) => void
    const pending = [
      new Promise((resolve) => void (resolveOld = resolve)),
      new Promise((resolve) => void (resolveNew = resolve)),
    ]
    let call = 0
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(pending[call++])),
    }))

    const older = useAccountsStore.getState().load({
      filters: [{ col: 'name', op: 'eq', value: 'Acct acc-stale' }],
    })
    const newer = useAccountsStore.getState().load()
    cc.insert(accountRow('acc-live'))

    resolveNew({ data: [], error: null, count: null })
    await newer
    resolveOld({ data: [accountRow('acc-stale')], error: null, count: null })
    await older

    // Newer snapshot won; the mid-load event landed exactly once; the stale
    // load's row never appeared.
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-live'])
  })

  it('discards buffered events and late responses after reset (account switch)', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    let resolveLoad!: (v: unknown) => void
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(new Promise((resolve) => void (resolveLoad = resolve)))),
    }))

    const load = useAccountsStore.getState().load()
    cc.insert(accountRow('acc-a')) // buffered mid-load
    useAccountsStore.getState().reset() // user signed out
    resolveLoad({ data: [accountRow('acc-stale')], error: null, count: null })
    await load
    cc.insert(accountRow('acc-after-reset'))

    expect(useAccountsStore.getState().accounts).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Duplicate suppression on every insert path
// ---------------------------------------------------------------------------

describe('duplicate suppression', () => {
  it('add: realtime echo before the insert response does not duplicate', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    // Establish the subscription (as the page's initial load would).
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(Promise.resolve({ data: [], error: null, count: null }))),
    }))
    await useAccountsStore.getState().load()

    const row = accountRow('acc-echo')
    let resolveInsert!: (v: unknown) => void
    const insertPromise = new Promise((resolve) => void (resolveInsert = resolve))
    supabase.from = vi.fn().mockImplementation(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn(() => insertPromise) })),
      })),
    }))

    const add = useAccountsStore.getState().add({
      name: 'Echo',
      type: 'checking',
      currency: 'USD',
      openingBalance: 0,
    })
    cc.insert(row) // echo lands first
    resolveInsert({ data: row, error: null })
    const added = await add

    expect(added.id).toBe('acc-echo')
    expect(useAccountsStore.getState().accounts).toHaveLength(1)
  })

  it('bulkAdd: echoes for the whole batch before the response do not duplicate', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    // Establish the subscription (as the page's initial load would).
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(Promise.resolve({ data: [], error: null, count: null }))),
    }))
    await useTransactionsStore.getState().load()

    const rows = [txRow('tx-echo-1', '2026-03-01'), txRow('tx-echo-2', '2026-03-02')]
    let resolveInsert!: (v: unknown) => void
    const insertPromise = new Promise((resolve) => void (resolveInsert = resolve))
    supabase.from = vi.fn().mockImplementation(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => insertPromise) })),
    }))

    const add = useTransactionsStore.getState().bulkAdd([
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 5,
        currency: 'USD',
        date: new Date('2026-03-01'),
      },
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 7,
        currency: 'USD',
        date: new Date('2026-03-02'),
      },
    ])
    cc.insert(rows[0])
    cc.insert(rows[1])
    resolveInsert({ data: rows, error: null })
    await add

    const txs = useTransactionsStore.getState().transactions
    expect(txs).toHaveLength(2)
    expect(new Set(txs.map((t) => t.id))).toEqual(new Set(['tx-echo-1', 'tx-echo-2']))
    // Date-desc order preserved.
    expect(txs.map((t) => t.id)).toEqual(['tx-echo-2', 'tx-echo-1'])
  })

  it('bulkAdd during an in-flight load is queued and applied once after publish', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    const rows = [txRow('tx-q-1', '2026-03-01'), txRow('tx-q-2', '2026-03-02')]
    let resolveLoad!: (v: unknown) => void
    const loadPromise = new Promise((resolve) => void (resolveLoad = resolve))
    let resolveInsert!: (v: unknown) => void
    const insertPromise = new Promise((resolve) => void (resolveInsert = resolve))
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(loadPromise)),
      insert: vi.fn(() => ({ select: vi.fn(() => insertPromise) })),
    }))

    const load = useTransactionsStore.getState().load()
    const add = useTransactionsStore.getState().bulkAdd([
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 5,
        currency: 'USD',
        date: new Date('2026-03-01'),
      },
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 7,
        currency: 'USD',
        date: new Date('2026-03-02'),
      },
    ])
    cc.insert(rows[0]) // realtime echo mid-load
    cc.insert(rows[1])
    resolveInsert({ data: rows, error: null })
    await add
    // Snapshot publishes without the rows; buffered echo + queued synthetic
    // inserts replay against it — dedupe must keep exactly one copy each.
    resolveLoad({ data: [], error: null, count: null })
    await load

    const txs = useTransactionsStore.getState().transactions
    expect(txs.map((t) => t.id)).toEqual(['tx-q-2', 'tx-q-1'])
  })

  it('add during an in-flight load is queued and applied once after publish', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    const row = accountRow('acc-queued')
    let resolveLoad!: (v: unknown) => void
    const loadPromise = new Promise((resolve) => void (resolveLoad = resolve))
    let resolveInsert!: (v: unknown) => void
    const insertPromise = new Promise((resolve) => void (resolveInsert = resolve))
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => chainableSelect(loadPromise)),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn(() => insertPromise) })),
      })),
    }))

    const load = useAccountsStore.getState().load()
    const add = useAccountsStore.getState().add({
      name: 'Queued',
      type: 'checking',
      currency: 'USD',
      openingBalance: 0,
    })
    cc.insert(row) // echo mid-load
    resolveInsert({ data: row, error: null })
    await add
    resolveLoad({ data: [], error: null, count: null })
    await load

    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-queued'])
  })
})

// ---------------------------------------------------------------------------
// Update / delete reconcile
// ---------------------------------------------------------------------------

describe('update and delete reconcile', () => {
  it('update applies last-write-wins and evicts rows edited out of the filter', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    getTable('transactions').push(
      txRow('tx-1', '2026-03-01', { type: 'income' }),
      txRow('tx-2', '2026-03-02', { type: 'income' }),
    )

    await useTransactionsStore.getState().load({ filters: incomeFilter })
    expect(useTransactionsStore.getState().transactions).toHaveLength(2)

    // In-place replacement (last write wins).
    cc.update(txRow('tx-1', '2026-03-01', { type: 'income', amount: 99 }))
    let txs = useTransactionsStore.getState().transactions
    expect(txs.find((t) => t.id === 'tx-1')?.amount).toBe(99)
    expect(txs).toHaveLength(2)

    // Edited out of the filtered set → evicted.
    cc.update(txRow('tx-1', '2026-03-01', { type: 'expense' }))
    txs = useTransactionsStore.getState().transactions
    expect(txs.map((t) => t.id)).toEqual(['tx-2'])

    // Inserts for other filter sets are ignored.
    cc.insert(txRow('tx-3', '2026-03-03', { type: 'expense' }))
    expect(useTransactionsStore.getState().transactions).toHaveLength(1)
  })

  it('delete evicts the row, corrects total, and loadMore stays consistent', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(5)
    const table = getTable('transactions')

    await useTransactionsStore.getState().load({ limit: 3 })
    expect(useTransactionsStore.getState().total).toBe(5)

    // Server-side delete + realtime event (the row is held: it heads the
    // date-desc order).
    const victim = table.find((r) => r.id === 'tx-00004')!
    table.splice(table.indexOf(victim), 1)
    cc.del(victim)

    const state = useTransactionsStore.getState()
    expect(state.transactions).toHaveLength(2)
    expect(state.total).toBe(4)

    await state.loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(txs).toHaveLength(4)
    expect(new Set(txs.map((t) => t.id)).size).toBe(4)
    expect(useTransactionsStore.getState().total).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Paged-window rule
// ---------------------------------------------------------------------------

describe('paged window rule', () => {
  it('a realtime row within the loaded window is inserted in sorted position', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(200)

    await useTransactionsStore.getState().load({ limit: 50 })
    expect(useTransactionsStore.getState().transactions).toHaveLength(50)

    // Newer than every loaded row → becomes the new head.
    getTable('transactions').push(txRow('tx-fresh', '2026-02-01'))
    cc.insert(txRow('tx-fresh', '2026-02-01'))

    const state = useTransactionsStore.getState()
    expect(state.transactions[0].id).toBe('tx-fresh')
    expect(state.transactions).toHaveLength(51)
    expect(state.total).toBe(201)

    // Ordering is intact and loadMore continues without dupes or skips.
    await state.loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(txs).toHaveLength(101)
    expect(new Set(txs.map((t) => t.id)).size).toBe(101)
    expect(useTransactionsStore.getState().hasMore).toBe(true)
  })

  it('a realtime row beyond the loaded window is left for loadMore, counted in total', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(200)

    await useTransactionsStore.getState().load({ limit: 50 })
    // Older than every loaded row → beyond the window.
    getTable('transactions').push(txRow('tx-ancient', '2025-12-01', { amount: 42 }))
    cc.insert(txRow('tx-ancient', '2025-12-01', { amount: 42 }))

    let state = useTransactionsStore.getState()
    expect(state.transactions).toHaveLength(50) // not applied
    expect(state.total).toBe(201) // but counted

    // Paging on: the row arrives exactly once through loadMore.
    while (useTransactionsStore.getState().hasMore) {
      await useTransactionsStore.getState().loadMore()
    }
    const txs = useTransactionsStore.getState().transactions
    expect(txs).toHaveLength(201)
    expect(new Set(txs.map((t) => t.id)).size).toBe(201)
    expect(txs.filter((t) => t.id === 'tx-ancient')).toHaveLength(1)
    state = useTransactionsStore.getState()
    expect(state.total).toBe(201)
  })

  it('an update to a row beyond the window does not corrupt paging', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(200)

    await useTransactionsStore.getState().load({ limit: 50 })
    getTable('transactions').push(txRow('tx-ancient', '2025-12-01'))
    cc.update(txRow('tx-ancient', '2025-12-01', { amount: 42 })) // not held → ignored

    const state = useTransactionsStore.getState()
    expect(state.transactions).toHaveLength(50)
    expect(state.total).toBe(200)

    await state.loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(new Set(txs.map((t) => t.id)).size).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Reconnect
// ---------------------------------------------------------------------------

describe('reconnect reconcile', () => {
  it('refetches silently after a disconnect and rejoining', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    getTable('accounts').push(accountRow('acc-1'))

    await useAccountsStore.getState().load()
    expect(useAccountsStore.getState().accounts).toHaveLength(1)

    // First SUBSCRIBED (initial join) must not trigger a refetch.
    const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>
    const callsBefore = fromMock.mock.calls.length
    cc.status('SUBSCRIBED')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((supabase.from as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsBefore,
    )

    // Row written "offline", then the socket errors and rejoins.
    getTable('accounts').push(accountRow('acc-2'))
    cc.status('CHANNEL_ERROR')
    cc.status('SUBSCRIBED')

    await vi.waitFor(() => {
      expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-1', 'acc-2'])
    })
    expect(useAccountsStore.getState().loading).toBe(false)
  })

  it('a failed reconcile does not wipe the collection', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    getTable('accounts').push(accountRow('acc-1'))

    let call = 0
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => {
        call++
        return chainableSelect(
          call === 1
            ? Promise.resolve({ data: getTable('accounts'), error: null })
            : Promise.resolve({ data: null, error: { message: 'still offline' } }),
        )
      }),
    }))

    await useAccountsStore.getState().load()
    expect(useAccountsStore.getState().accounts).toHaveLength(1)

    cc.status('CHANNEL_ERROR')
    cc.status('SUBSCRIBED')
    await vi.waitFor(() => {
      expect(useAccountsStore.getState().error).toBe('still offline')
    })
    // Existing data is kept.
    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['acc-1'])
  })

  it('debounces reconcile refetches on a flapping link', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    getTable('accounts').push(accountRow('acc-1'))

    await useAccountsStore.getState().load()
    const fromMock = supabase.from as unknown as ReturnType<typeof vi.fn>
    const queriesPerLoad = fromMock.mock.calls.length

    // First rejoin: reconcile fires (debounce window is fresh after reset).
    cc.status('CHANNEL_ERROR')
    cc.status('SUBSCRIBED')
    await vi.waitFor(() => {
      expect(fromMock.mock.calls.length).toBe(queriesPerLoad * 2)
    })

    // Immediate re-flap within the debounce window: no second refetch.
    cc.status('CHANNEL_ERROR')
    cc.status('SUBSCRIBED')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fromMock.mock.calls.length).toBe(queriesPerLoad * 2)
  })
})

// ---------------------------------------------------------------------------
// Comparator: id tiebreak for Date sort keys
// ---------------------------------------------------------------------------

describe('comparator id tiebreak', () => {
  it('same-date inserts land at the server position (id tiebreak reachable for Date keys)', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    // Same date for all rows; tx-r2 sorts between tx-r1 and tx-r3 by id.
    getTable('transactions').push(txRow('tx-r1', '2026-01-01'), txRow('tx-r3', '2026-01-01'))

    await useTransactionsStore.getState().load()
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-r1',
      'tx-r3',
    ])

    cc.insert(txRow('tx-r2', '2026-01-01'))

    // Server order for (date desc, id asc) is tx-r1, tx-r2, tx-r3.
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-r1',
      'tx-r2',
      'tx-r3',
    ])
  })
})

// ---------------------------------------------------------------------------
// Paged-window rule on the app's own mutation paths
// ---------------------------------------------------------------------------

describe('paged window rule: app mutation paths', () => {
  it('add beyond the window defers to loadMore (no silently skipped row)', async () => {
    // Server order: tx-00002 (01-03), tx-00001 (01-02), tx-00000 (01-01).
    seedTransactions(3)
    await useTransactionsStore.getState().load({ limit: 2 })
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-00002',
      'tx-00001',
    ])

    // Back-dated row through the public add path: sorts beyond the window.
    const added = await useTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 5,
      currency: 'USD',
      date: new Date('2025-12-01'),
    })

    // Not appended: it would break the prefix invariant loadMore relies on.
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-00002',
      'tx-00001',
    ])
    expect(useTransactionsStore.getState().total).toBe(4)

    // Paging continues from the right offset: EVERY row loads exactly once.
    await useTransactionsStore.getState().loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(txs.map((t) => t.id)).toEqual(['tx-00002', 'tx-00001', 'tx-00000', added.id])
  })

  it('bulkAdd beyond the window defers to loadMore', async () => {
    seedTransactions(3)
    await useTransactionsStore.getState().load({ limit: 2 })

    const [imported] = await useTransactionsStore.getState().bulkAdd([
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 9,
        currency: 'USD',
        date: new Date('2025-11-01'),
      },
    ])

    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-00002',
      'tx-00001',
    ])
    expect(useTransactionsStore.getState().total).toBe(4)

    await useTransactionsStore.getState().loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(txs.map((t) => t.id)).toEqual(['tx-00002', 'tx-00001', 'tx-00000', imported.id])
  })

  it('a realtime update moving a held row beyond the window evicts it (loadMore stays consistent)', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(3)
    await useTransactionsStore.getState().load({ limit: 2 })

    // Server-side update + realtime echo: tx-00001 moves out of the window.
    const table = getTable('transactions')
    const row = table.find((r) => r.id === 'tx-00001')!
    row.date = '2025-11-01'
    cc.update({ ...row })

    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual(['tx-00002'])
    expect(useTransactionsStore.getState().total).toBe(3)

    // Paging continues from the right offset: tx-00000 is not skipped.
    await useTransactionsStore.getState().loadMore()
    const txs = useTransactionsStore.getState().transactions
    expect(txs.map((t) => t.id)).toEqual(['tx-00002', 'tx-00000', 'tx-00001'])
    expect(
      txs
        .find((t) => t.id === 'tx-00001')
        ?.date.toISOString()
        .slice(0, 10),
    ).toBe('2025-11-01')
  })

  it('an optimistic update moving a row beyond the window evicts it', async () => {
    // The mock validates transaction updates against the accounts table.
    getTable('accounts').push(accountRow('acc-1'))
    seedTransactions(3)
    await useTransactionsStore.getState().load({ limit: 2 })

    // The real mock builder applies the update to the in-memory table too,
    // keeping the server ordering in sync.
    await useTransactionsStore.getState().update('tx-00001', { date: new Date('2025-11-01') })

    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual(['tx-00002'])

    await useTransactionsStore.getState().loadMore()
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual([
      'tx-00002',
      'tx-00000',
      'tx-00001',
    ])
  })

  it('an update moving a row within the window keeps replace-in-place', async () => {
    const cc = controlledChannel()
    supabase.channel = vi.fn(() => cc.channel)
    seedTransactions(3)
    await useTransactionsStore.getState().load({ limit: 2 })

    // New date is still newer than the window head → within the window.
    cc.update(txRow('tx-00001', '2026-01-25'))

    const state = useTransactionsStore.getState()
    expect(state.transactions.map((t) => t.id).sort()).toEqual(['tx-00001', 'tx-00002'])
    expect(
      state.transactions
        .find((t) => t.id === 'tx-00001')
        ?.date.toISOString()
        .slice(0, 10),
    ).toBe('2026-01-25')
  })
})
