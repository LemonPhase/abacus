import { describe, it, expect } from 'vitest'
import {
  calculateProjection,
  calculateTotalProjection,
  formatInvestmentValue,
} from '@/lib/investments'
import type { InvestmentPlan } from '@/types'

function createPlan(overrides: Partial<InvestmentPlan> = {}): InvestmentPlan {
  return {
    id: 'test-1',
    name: 'Test Plan',
    type: 'stock',
    initialAmount: 0,
    monthlyContribution: 0,
    annualReturnRate: 0,
    currency: 'USD',
    notes: '',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('calculateProjection', () => {
  it('returns correct projection for a simple plan (1 year)', () => {
    const plan = createPlan({
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 10,
    })
    const result = calculateProjection(plan, 1)

    expect(result).toHaveLength(1)
    // annualContribution = 100 * 12 = 1200
    // totalInvested = 1000 + 1200 = 2200
    // totalValue = (1000 + 1200) * 1.10 = 2420
    expect(result[0]).toEqual({
      year: 1,
      principal: 2200,
      returns: 220,
      totalValue: 2420,
    })
  })

  it('returns multiple years correctly (horizonYears=3)', () => {
    const plan = createPlan({
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 10,
    })
    const result = calculateProjection(plan, 3)

    expect(result).toHaveLength(3)

    // Year 1: principal=2200, totalValue=2420, returns=220
    expect(result[0].year).toBe(1)
    expect(result[0].principal).toBe(2200)
    expect(result[0].totalValue).toBe(2420)
    expect(result[0].returns).toBeCloseTo(220, 10)

    // Year 2: principal=3400, totalValue=3982
    expect(result[1].year).toBe(2)
    expect(result[1].principal).toBe(3400)
    // totalValue is rounded: (2420+1200)*1.10 = 3982
    expect(result[1].totalValue).toBe(3982)
    // returns uses pre-rounding value: 3982.0000000000005 - 3400
    expect(result[1].returns).toBeCloseTo(582, 10)

    // Year 3: principal=4600, totalValue=5700.2
    expect(result[2].year).toBe(3)
    expect(result[2].principal).toBe(4600)
    expect(result[2].totalValue).toBe(5700.2)
    expect(result[2].returns).toBeCloseTo(1100.2, 10)
  })

  it('zero initial amount and contribution returns zero returns', () => {
    const plan = createPlan({
      initialAmount: 0,
      monthlyContribution: 0,
      annualReturnRate: 10,
    })
    const result = calculateProjection(plan, 3)

    expect(result).toHaveLength(3)
    for (const year of result) {
      expect(year.principal).toBe(0)
      expect(year.returns).toBe(0)
      expect(year.totalValue).toBe(0)
    }
  })

  it('zero return rate gives principal growth only', () => {
    const plan = createPlan({
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 0,
    })
    const result = calculateProjection(plan, 3)

    // Year 1: principal=2200, totalValue=2200, returns=0
    expect(result[0]).toEqual({ year: 1, principal: 2200, returns: 0, totalValue: 2200 })
    // Year 2: principal=3400, totalValue=3400, returns=0
    expect(result[1]).toEqual({ year: 2, principal: 3400, returns: 0, totalValue: 3400 })
    // Year 3: principal=4600, totalValue=4600, returns=0
    expect(result[2]).toEqual({ year: 3, principal: 4600, returns: 0, totalValue: 4600 })
  })

  it('high return rate compound growth is computed correctly', () => {
    const plan = createPlan({
      initialAmount: 1000,
      monthlyContribution: 0,
      annualReturnRate: 100, // doubles every year
    })
    const result = calculateProjection(plan, 2)

    // Year 1: principal=1000, totalValue=1000*2=2000, returns=1000
    expect(result[0]).toEqual({ year: 1, principal: 1000, returns: 1000, totalValue: 2000 })
    // Year 2: principal=1000, totalValue=2000*2=4000, returns=3000
    expect(result[1]).toEqual({ year: 2, principal: 1000, returns: 3000, totalValue: 4000 })
  })
})

describe('calculateTotalProjection', () => {
  it('returns empty array for empty plans list', () => {
    const result = calculateTotalProjection([], 3)
    expect(result).toEqual([])
  })

  it('single plan returns approximately same as calculateProjection', () => {
    const plan = createPlan({
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 10,
    })
    const totalResult = calculateTotalProjection([plan], 3)
    const singleResult = calculateProjection(plan, 3)

    // calculateTotalProjection uses rounded totalValue for returns,
    // calculateProjection uses pre-rounding value, so values may
    // differ at the floating-point level
    expect(totalResult).toHaveLength(singleResult.length)
    for (let i = 0; i < totalResult.length; i++) {
      expect(totalResult[i].year).toBe(singleResult[i].year)
      expect(totalResult[i].principal).toBe(singleResult[i].principal)
      expect(totalResult[i].totalValue).toBe(singleResult[i].totalValue)
      expect(totalResult[i].returns).toBeCloseTo(singleResult[i].returns, 10)
    }
  })

  it('combines two plans correctly', () => {
    const planA = createPlan({
      id: 'plan-a',
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 10,
    })
    const planB = createPlan({
      id: 'plan-b',
      initialAmount: 500,
      monthlyContribution: 50,
      annualReturnRate: 5,
    })
    const result = calculateTotalProjection([planA, planB], 2)

    expect(result).toHaveLength(2)

    // Compute individual projections
    const projA = calculateProjection(planA, 2)
    const projB = calculateProjection(planB, 2)

    // Year 1: sums of individual values
    expect(result[0].year).toBe(1)
    expect(result[0].principal).toBe(projA[0].principal + projB[0].principal)
    expect(result[0].totalValue).toBe(
      Math.round((projA[0].totalValue + projB[0].totalValue) * 100) / 100,
    )
    expect(result[0].returns).toBe(result[0].totalValue - result[0].principal)

    // Year 2
    expect(result[1].year).toBe(2)
    expect(result[1].principal).toBe(projA[1].principal + projB[1].principal)
    expect(result[1].totalValue).toBe(
      Math.round((projA[1].totalValue + projB[1].totalValue) * 100) / 100,
    )
    expect(result[1].returns).toBe(result[1].totalValue - result[1].principal)
  })
})

describe('formatInvestmentValue', () => {
  it('formats USD amount without decimals', () => {
    expect(formatInvestmentValue(1234, 'USD')).toBe('$1,234')
  })

  it('formats EUR amount', () => {
    expect(formatInvestmentValue(5000, 'EUR')).toBe('€5,000')
  })

  it('formats JPY amount', () => {
    expect(formatInvestmentValue(1000000, 'JPY')).toBe('¥1,000,000')
  })

  it('rounds large number to 0 decimal places', () => {
    expect(formatInvestmentValue(1234567.89, 'USD')).toBe('$1,234,568')
  })
})
