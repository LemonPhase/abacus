import { describe, it, expect } from 'vitest'

function getPeriodBounds(date: Date, period: 'monthly' | 'yearly'): { start: Date; end: Date } {
  if (period === 'monthly') {
    const y = date.getFullYear()
    const m = date.getMonth()
    return {
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 0, 23, 59, 59),
    }
  }
  const y = date.getFullYear()
  return {
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31, 23, 59, 59),
  }
}

describe('getPeriodBounds', () => {
  it('returns correct monthly bounds for January', () => {
    const { start, end } = getPeriodBounds(new Date('2026-01-15'), 'monthly')
    expect(start).toEqual(new Date(2026, 0, 1))
    expect(end).toEqual(new Date(2026, 0, 31, 23, 59, 59))
  })

  it('returns correct monthly bounds for February (leap year)', () => {
    const { start, end } = getPeriodBounds(new Date('2024-02-10'), 'monthly')
    expect(start).toEqual(new Date(2024, 1, 1))
    expect(end).toEqual(new Date(2024, 1, 29, 23, 59, 59))
  })

  it('returns correct yearly bounds', () => {
    const { start, end } = getPeriodBounds(new Date('2026-06-15'), 'yearly')
    expect(start).toEqual(new Date(2026, 0, 1))
    expect(end).toEqual(new Date(2026, 11, 31, 23, 59, 59))
  })
})
