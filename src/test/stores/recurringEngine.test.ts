import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { resetAllTables, getTable, mockSupabase } from '@/test/supabase-mock'

// Issue #15: the store's wiring to the DB engine RPC — applyNow and the
// catch-up-on-open worker. Engine semantics themselves are covered by the
// real-PostgreSQL harness (supabase/tests/run_recurring_engine_tests.sh).

function seedItem(overrides: Record<string, unknown> = {}) {
  const table = getTable('recurring_transactions')
  const item = {
    id: `rt-${table.length + 1}`,
    user_id: 'mock-user-id',
    account_id: 'acc-1',
    category_id: null,
    type: 'expense',
    amount: 100,
    currency: 'USD',
    description: 'Test recurring',
    frequency: 'monthly',
    interval_value: 1,
    day_of_month: 15,
    start_date: '2026-01-15',
    end_date: null,
    next_date: '2099-01-15',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
  table.push(item)
  return item
}

const rpcMock = () => vi.mocked(mockSupabase.rpc)

describe('recurring engine store wiring', () => {
  beforeEach(() => {
    resetAllTables()
    rpcMock().mockClear()
    useRecurringTransactionsStore.setState({
      items: [],
      loading: false,
      error: null,
      _unsub: null,
    })
  })

  it('applyNow invokes the engine RPC with computed provenance and reloads', async () => {
    seedItem({ id: 'rt-due', amount: 100, currency: 'USD' })
    await useRecurringTransactionsStore.getState().load()

    rpcMock().mockResolvedValue({ data: 1, error: null })
    const applied = await useRecurringTransactionsStore.getState().applyNow('rt-due')

    expect(applied).toBe(1)
    expect(rpcMock()).toHaveBeenCalledWith(
      'apply_recurring_occurrence',
      expect.objectContaining({
        p_recurring_id: 'rt-due',
        p_base_amount: 100,
        p_base_currency: 'USD',
        p_base_stale: false,
      }),
    )
  })

  it('applyNow surfaces engine errors on the store', async () => {
    seedItem({ id: 'rt-due' })
    await useRecurringTransactionsStore.getState().load()

    rpcMock().mockResolvedValue({ data: null, error: { message: 'engine boom' } })
    await expect(useRecurringTransactionsStore.getState().applyNow('rt-due')).rejects.toThrow(
      'engine boom',
    )
    expect(useRecurringTransactionsStore.getState().error).toBe('engine boom')
  })

  it('applyNow throws for an unknown id', async () => {
    await expect(useRecurringTransactionsStore.getState().applyNow('nope')).rejects.toThrow(
      'not found',
    )
  })

  it('catchUp applies every due schedule and skips future/paused ones', async () => {
    seedItem({ id: 'rt-a', next_date: '2020-01-01' })
    seedItem({ id: 'rt-b', next_date: '2020-01-01' })
    seedItem({ id: 'rt-future', next_date: '2099-01-01' })
    seedItem({ id: 'rt-paused', next_date: '2020-01-01', is_active: false })
    await useRecurringTransactionsStore.getState().load()

    rpcMock().mockResolvedValue({ data: 2, error: null })
    const total = await useRecurringTransactionsStore.getState().catchUp()

    expect(total).toBe(4)
    const engineCalls = rpcMock().mock.calls.filter(([fn]) => fn === 'apply_recurring_occurrence')
    expect(engineCalls.length).toBe(2)
    expect(
      engineCalls.map(([, args]) => (args as { p_recurring_id: string }).p_recurring_id).sort(),
    ).toEqual(['rt-a', 'rt-b'])
  })

  it('catchUp with nothing due never calls the engine', async () => {
    seedItem({ next_date: '2099-01-01' })
    await useRecurringTransactionsStore.getState().load()

    const total = await useRecurringTransactionsStore.getState().catchUp()

    expect(total).toBe(0)
    expect(rpcMock()).not.toHaveBeenCalled()
  })

  it('catchUp propagates engine failures', async () => {
    seedItem({ id: 'rt-due', next_date: '2020-01-01' })
    await useRecurringTransactionsStore.getState().load()

    rpcMock().mockResolvedValue({ data: null, error: { message: 'engine down' } })
    await expect(useRecurringTransactionsStore.getState().catchUp()).rejects.toThrow('engine down')
    expect(useRecurringTransactionsStore.getState().error).toBe('engine down')
  })
})
