import { describe, it, expect, beforeEach, vi } from 'vitest'
import { exportAllData } from '@/services/export'
import { getTable, resetAllTables, failNextSelect, mockSupabase } from '@/test/supabase-mock'
import { useSettingsStore } from '@/stores/settingsStore'

/**
 * Export regression tests for issue #11: every page of every table is read
 * (more than one max_rows page), partial failures abort loudly, and the v3
 * payload shape (budgets[].category_ids derived from associations) is kept.
 */
describe('exportAllData', () => {
  beforeEach(() => {
    resetAllTables()
    localStorage.clear()
    useSettingsStore.getState().reset()
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
  })

  function txnRow(i: number) {
    return {
      id: `tx-${String(i).padStart(5, '0')}`,
      user_id: 'user-1',
      account_id: 'acc-1',
      category_id: null,
      type: 'expense',
      amount: 1,
      currency: 'USD',
      base_amount: 1,
      base_currency: 'USD',
      base_amount_stale: false,
      date: '2026-01-01',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
  }

  it('exports every row of a table spanning multiple max_rows pages', async () => {
    getTable('transactions').push(...Array.from({ length: 2500 }, (_, i) => txnRow(i)))
    getTable('accounts').push({
      id: 'acc-1',
      user_id: 'user-1',
      name: 'A',
      type: 'checking',
      currency: 'USD',
      balance: 0,
      opening_balance: 0,
      notes: null,
      created_at: '',
      updated_at: '',
    })

    const data = await exportAllData()

    expect(data.version).toBe(3)
    expect(data.transactions).toHaveLength(2500)
    expect(data.accounts).toHaveLength(1)
  })

  it('derives budgets[].category_ids from the association table (v3 shape)', async () => {
    getTable('budgets').push({
      id: 'b1',
      user_id: 'user-1',
      name: 'B',
      amount: 100,
      period: 'monthly',
      start_date: '2026-01-01',
      created_at: '',
      updated_at: '',
    })
    getTable('budget_categories').push(
      { budget_id: 'b1', category_id: 'c1', user_id: 'user-1' },
      { budget_id: 'b1', category_id: 'c2', user_id: 'user-1' },
    )

    const data = await exportAllData()

    expect(data.budgets).toEqual([
      expect.objectContaining({ id: 'b1', category_ids: ['c1', 'c2'] }),
    ])
  })

  it('aborts with context when a page read fails', async () => {
    getTable('transactions').push(...Array.from({ length: 2500 }, (_, i) => txnRow(i)))

    // The next page read (first table, first page) fails: the whole export
    // aborts loudly instead of writing a partial file.
    failNextSelect('boom')

    await expect(exportAllData()).rejects.toThrow(/Export failed reading/)
  })

  it('aborts when the signed-in user changes mid-export', async () => {
    let current = 'user-1'
    mockSupabase.auth.getSession.mockImplementation(async () => ({
      data: { session: { user: { id: current } } },
      error: null,
    }))

    getTable('accounts').push({
      id: 'a',
      user_id: 'user-1',
      name: 'A',
      type: 'checking',
      currency: 'USD',
      balance: 0,
      opening_balance: 0,
      notes: null,
      created_at: '',
      updated_at: '',
    })

    const promise = exportAllData()
    current = 'user-2'
    await expect(promise).rejects.toThrow(/export aborted/)
    vi.restoreAllMocks()
  })
})
