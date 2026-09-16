import { describe, it, expect, beforeEach } from 'vitest'
import {
  fetchReportSummary,
  fetchMonthlySeries,
  fetchCategoryBreakdown,
  fetchBudgetSpending,
} from '@/services/reports'
import { failNextRpc, mockSupabase, resetAllTables } from '@/test/supabase-mock'

/**
 * The reports service is a thin wrapper over the DB aggregate RPCs
 * (20260918000002_report_aggregates.sql): assert the RPC name, parameters
 * (reporting currency is explicit) and result mapping.
 */
describe('reports service', () => {
  beforeEach(() => {
    resetAllTables()
  })

  it('fetchReportSummary passes range + currency and maps the single row', async () => {
    mockSupabase.rpc.mockImplementation(async (fn: string) => {
      expect(fn).toBe('report_summary')
      return {
        data: [{ income: 100, expense: 40, unconverted: 2, total: 12 }],
        error: null,
      }
    })

    const summary = await fetchReportSummary('2026-01-01', '2026-12-31', 'EUR')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('report_summary', {
      p_from: '2026-01-01',
      p_to: '2026-12-31',
      p_currency: 'EUR',
    })
    expect(summary).toEqual({ income: 100, expense: 40, unconverted: 2, total: 12 })
  })

  it('fetchMonthlySeries maps month_start rows', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [
        { month_start: '2026-01-01', income: 10, expense: 5, unconverted: 1 },
        { month_start: '2026-02-01', income: 20, expense: 0, unconverted: 0 },
      ],
      error: null,
    })

    const rows = await fetchMonthlySeries('2026-01-01', '2026-02-28', 'USD')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('report_monthly', {
      p_from: '2026-01-01',
      p_to: '2026-02-28',
      p_currency: 'USD',
    })
    expect(rows).toEqual([
      { month: '2026-01-01', income: 10, expense: 5, unconverted: 1 },
      { month: '2026-02-01', income: 20, expense: 0, unconverted: 0 },
    ])
  })

  it('fetchCategoryBreakdown maps category columns with null grouping', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          category_id: null,
          category_name: null,
          category_color: null,
          category_icon: null,
          income: 0,
          expense: 30,
        },
        {
          category_id: 'c1',
          category_name: 'Food',
          category_color: '#fff',
          category_icon: 'apple',
          income: 5,
          expense: 40,
        },
      ],
      error: null,
    })

    const rows = await fetchCategoryBreakdown('2026-01-01', '2026-12-31', 'USD')

    expect(rows).toEqual([
      { categoryId: null, name: null, color: null, icon: null, income: 0, expense: 30 },
      { categoryId: 'c1', name: 'Food', color: '#fff', icon: 'apple', income: 5, expense: 40 },
    ])
  })

  it('fetchBudgetSpending passes the client-local today', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [
        {
          budget_id: 'b1',
          budget_name: 'B',
          budget_amount: 500,
          budget_period: 'monthly',
          spent: 120,
        },
      ],
      error: null,
    })

    const rows = await fetchBudgetSpending('2026-03-15', 'USD')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('budget_spending', {
      p_today: '2026-03-15',
      p_currency: 'USD',
    })
    expect(rows).toEqual([{ id: 'b1', name: 'B', amount: 500, period: 'monthly', spent: 120 }])
  })

  it('propagates RPC errors', async () => {
    failNextRpc('report_summary: permission denied')

    await expect(fetchReportSummary('2026-01-01', '2026-12-31', 'USD')).rejects.toThrow(
      /permission denied/,
    )
  })
})
