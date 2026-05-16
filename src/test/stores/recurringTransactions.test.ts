import { describe, it, expect, beforeEach } from 'vitest'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { resetAllTables, getTable } from '@/test/supabase-mock'

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
    next_date: '2026-01-15',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
  table.push(item)
  return item
}

describe('useRecurringTransactionsStore', () => {
  beforeEach(() => {
    resetAllTables()
    useRecurringTransactionsStore.setState({
      items: [],
      loading: false,
      error: null,
      _unsub: null,
    })
  })

  it('loads items from the mock db', async () => {
    seedItem({ description: 'Netflix' })
    seedItem({ description: 'Rent' })

    await useRecurringTransactionsStore.getState().load()
    const items = useRecurringTransactionsStore.getState().items
    expect(items.length).toBe(2)
  })

  it('adds a new recurring transaction', async () => {
    const accounts = getTable('accounts')
    accounts.push({
      id: 'acc-1',
      user_id: 'mock-user-id',
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      balance: 1000,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    await useRecurringTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 15,
      currency: 'USD',
      description: 'Netflix',
      frequency: 'monthly',
      intervalValue: 1,
      dayOfMonth: null,
      startDate: new Date('2026-01-01'),
      endDate: null,
      nextDate: new Date('2026-01-01'),
      isActive: true,
    })

    const items = useRecurringTransactionsStore.getState().items
    expect(items.length).toBe(1)
    expect(items[0].description).toBe('Netflix')
  })

  it('removes a recurring transaction', async () => {
    seedItem()
    await useRecurringTransactionsStore.getState().load()
    const items = useRecurringTransactionsStore.getState().items
    expect(items.length).toBe(1)

    await useRecurringTransactionsStore.getState().remove(items[0].id)
    expect(useRecurringTransactionsStore.getState().items.length).toBe(0)
  })

  it('getActive returns only active items', async () => {
    seedItem({ description: 'Active', is_active: true })
    seedItem({ description: 'Paused', is_active: false })

    await useRecurringTransactionsStore.getState().load()
    const active = useRecurringTransactionsStore.getState().getActive()
    expect(active.length).toBe(1)
    expect(active[0].description).toBe('Active')
  })

  it('getDue returns items with nextDate <= today', async () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    seedItem({ description: 'Due', next_date: '2020-01-01', is_active: true })
    seedItem({ description: 'Future', next_date: '2099-12-31', is_active: true })

    await useRecurringTransactionsStore.getState().load()
    const due = useRecurringTransactionsStore.getState().getDue()
    expect(due.length).toBe(1)
    expect(due[0].description).toBe('Due')
  })

  it('updates a recurring transaction', async () => {
    const seeded = seedItem({ description: 'Original' })
    await useRecurringTransactionsStore.getState().load()

    await useRecurringTransactionsStore.getState().update(seeded.id, {
      description: 'Updated',
    })

    const items = useRecurringTransactionsStore.getState().items
    expect(items[0].description).toBe('Updated')
  })
})
