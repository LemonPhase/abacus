import { describe, it, expect } from "vitest"
import { calculateProjection, calculateTotalProjection } from "@/lib/investments"
import type { InvestmentPlan } from "@/types"

function makePlan(overrides?: Partial<InvestmentPlan>): InvestmentPlan {
  const now = new Date()
  return {
    id: "test-1",
    name: "Test Fund",
    type: "index_fund",
    initialAmount: 10000,
    monthlyContribution: 500,
    annualReturnRate: 7,
    currency: "USD",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("calculateProjection", () => {
  it("returns correct number of years", () => {
    const plan = makePlan()
    const result = calculateProjection(plan, 10)
    expect(result).toHaveLength(10)
  })

  it("year 1 starts with initial + 12 months of contributions * (1 + rate)", () => {
    const plan = makePlan({ initialAmount: 1000, monthlyContribution: 100, annualReturnRate: 0 })
    const result = calculateProjection(plan, 1)
    // principal = 1000 + 12*100 = 2200
    // With 0% return: totalValue = same
    expect(result[0].principal).toBe(2200)
    expect(result[0].returns).toBe(0)
    expect(result[0].totalValue).toBe(2200)
  })

  it("grows with positive return rate", () => {
    const plan = makePlan({ initialAmount: 10000, monthlyContribution: 0, annualReturnRate: 10 })
    const result = calculateProjection(plan, 1)
    // principal = 10000, total = 10000 * 1.10 = 11000, returns = 1000
    expect(result[0].principal).toBe(10000)
    expect(result[0].returns).toBe(1000)
    expect(result[0].totalValue).toBe(11000)
  })

  it("compound growth over multiple years exceeds simple growth", () => {
    const plan = makePlan({ initialAmount: 10000, monthlyContribution: 0, annualReturnRate: 10 })
    const result = calculateProjection(plan, 10)
    // Year 1: 10000 * 1.1 = 11000
    // Year 10: 10000 * 1.1^10 ≈ 25937
    expect(result[9].totalValue).toBeGreaterThan(20000) // compound > simple
  })

  it("monthly contributions increase principal over time", () => {
    const plan = makePlan({ initialAmount: 0, monthlyContribution: 1000, annualReturnRate: 0 })
    const result = calculateProjection(plan, 2)
    expect(result[0].principal).toBe(12000) // year 1
    expect(result[1].principal).toBe(24000) // year 2
  })
})

describe("calculateTotalProjection", () => {
  it("combines multiple plans", () => {
    const plan1 = makePlan({ id: "a", initialAmount: 5000, monthlyContribution: 0, annualReturnRate: 0 })
    const plan2 = makePlan({ id: "b", initialAmount: 5000, monthlyContribution: 0, annualReturnRate: 0 })
    const result = calculateTotalProjection([plan1, plan2], 1)
    expect(result[0].principal).toBe(10000)
    expect(result[0].totalValue).toBe(10000)
  })

  it("returns empty array for no plans", () => {
    const result = calculateTotalProjection([], 10)
    expect(result).toHaveLength(0)
  })
})
