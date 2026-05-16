import { describe, it, expect } from 'vitest'
import { computeNextDate, formatFrequency, getUpcomingDates } from '@/lib/recurring'
import type { RecurringTransaction } from '@/types'

function makeDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day)
}

describe('computeNextDate', () => {
  it('advances daily by interval', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'daily', 1)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(16)
  })

  it('advances daily by interval of 3', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'daily', 3)
    expect(result.getDate()).toBe(18)
  })

  it('advances weekly by interval', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'weekly', 1)
    expect(result.getDate()).toBe(22)
  })

  it('advances weekly by interval of 2', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'weekly', 2)
    expect(result.getDate()).toBe(29)
  })

  it('advances monthly by interval', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'monthly', 1)
    expect(result.getMonth()).toBe(1) // Feb
    expect(result.getDate()).toBe(15)
  })

  it('advances monthly by interval of 3', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'monthly', 3)
    expect(result.getMonth()).toBe(3) // Apr
    expect(result.getDate()).toBe(15)
  })

  it('advances monthly with dayOfMonth, clamping for short months', () => {
    const result = computeNextDate(makeDate(2026, 1, 31), 'monthly', 1, 31)
    expect(result.getMonth()).toBe(1) // Feb
    expect(result.getDate()).toBe(28) // clamped
  })

  it('advances monthly with dayOfMonth specified', () => {
    const result = computeNextDate(makeDate(2026, 1, 31), 'monthly', 1, 5)
    expect(result.getMonth()).toBe(1) // Feb
    expect(result.getDate()).toBe(5)
  })

  it('advances yearly by interval', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'yearly', 1)
    expect(result.getFullYear()).toBe(2027)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(15)
  })

  it('advances yearly by interval of 2', () => {
    const result = computeNextDate(makeDate(2026, 1, 15), 'yearly', 2)
    expect(result.getFullYear()).toBe(2028)
  })
})

describe('formatFrequency', () => {
  it('formats singular daily', () => {
    expect(formatFrequency('daily', 1)).toBe('Daily')
  })

  it('formats plural daily', () => {
    expect(formatFrequency('daily', 3)).toBe('Every 3 days')
  })

  it('formats singular weekly', () => {
    expect(formatFrequency('weekly', 1)).toBe('Weekly')
  })

  it('formats plural weekly', () => {
    expect(formatFrequency('weekly', 2)).toBe('Every 2 weeks')
  })

  it('formats singular monthly', () => {
    expect(formatFrequency('monthly', 1)).toBe('Monthly')
  })

  it('formats plural monthly', () => {
    expect(formatFrequency('monthly', 3)).toBe('Every 3 months')
  })

  it('formats singular yearly', () => {
    expect(formatFrequency('yearly', 1)).toBe('Yearly')
  })

  it('formats plural yearly', () => {
    expect(formatFrequency('yearly', 2)).toBe('Every 2 years')
  })
})

describe('getUpcomingDates', () => {
  function makeItem(overrides: Partial<RecurringTransaction> = {}): RecurringTransaction {
    return {
      id: 'rt-1',
      accountId: 'acc1',
      categoryId: null,
      type: 'expense',
      amount: 100,
      currency: 'USD',
      description: 'Test',
      frequency: 'monthly',
      intervalValue: 1,
      dayOfMonth: 15,
      startDate: makeDate(2026, 1, 15),
      endDate: null,
      nextDate: makeDate(2026, 1, 15),
      isActive: true,
      createdAt: makeDate(2026, 1, 1),
      updatedAt: makeDate(2026, 1, 1),
      ...overrides,
    }
  }

  it('returns upcoming dates for monthly', () => {
    const item = makeItem()
    const dates = getUpcomingDates(item, 3)
    expect(dates).toHaveLength(3)
    expect(dates[0].getMonth()).toBe(0) // Jan
    expect(dates[0].getDate()).toBe(15)
    expect(dates[1].getMonth()).toBe(1) // Feb
    expect(dates[1].getDate()).toBe(15)
  })

  it('stops at endDate', () => {
    const item = makeItem({ endDate: makeDate(2026, 3, 20) })
    const dates = getUpcomingDates(item, 10)
    expect(dates.length).toBeLessThanOrEqual(3)
  })
})
