import { describe, it, expect } from 'vitest'
import { getBudgetStatus } from '@/lib/budget'

describe('getBudgetStatus', () => {
  it('bands percentage below the limit', () => {
    expect(getBudgetStatus(0)).toBe('good')
    expect(getBudgetStatus(49.9)).toBe('good')
    expect(getBudgetStatus(50)).toBe('warning')
    expect(getBudgetStatus(79.9)).toBe('warning')
    expect(getBudgetStatus(80)).toBe('danger')
    expect(getBudgetStatus(99.9)).toBe('danger')
  })

  it('is neutral at exact break-even and over only past the limit', () => {
    // At exactly 100% spend equals the budget — nothing is overspent.
    expect(getBudgetStatus(100)).toBe('danger')
    expect(getBudgetStatus(100.1)).toBe('over')
    expect(getBudgetStatus(150)).toBe('over')
  })
})
