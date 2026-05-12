import type { InvestmentPlan, ProjectionYear } from '@/types'

const MONTHS_PER_YEAR = 12

export function calculateProjection(plan: InvestmentPlan, horizonYears: number): ProjectionYear[] {
  const years: ProjectionYear[] = []
  const annualContribution = plan.monthlyContribution * MONTHS_PER_YEAR
  let totalValue = plan.initialAmount
  let totalInvested = plan.initialAmount

  for (let y = 1; y <= horizonYears; y++) {
    totalInvested += annualContribution
    totalValue = (totalValue + annualContribution) * (1 + plan.annualReturnRate / 100)
    years.push({
      year: y,
      principal: totalInvested,
      returns: totalValue - totalInvested,
      totalValue: Math.round(totalValue * 100) / 100,
    })
  }

  return years
}

export function calculateTotalProjection(
  plans: InvestmentPlan[],
  horizonYears: number,
): ProjectionYear[] {
  if (plans.length === 0) return []

  // Pre-compute each plan's full projection once (O(P × H))
  const planProjections = plans.map((p) => calculateProjection(p, horizonYears))

  const combined: ProjectionYear[] = []
  for (let y = 0; y < horizonYears; y++) {
    let totalValue = 0
    let totalInvested = 0

    for (const projection of planProjections) {
      totalValue += projection[y].totalValue
      totalInvested += projection[y].principal
    }

    combined.push({
      year: y + 1,
      principal: totalInvested,
      returns: totalValue - totalInvested,
      totalValue: Math.round(totalValue * 100) / 100,
    })
  }

  return combined
}

export function formatInvestmentValue(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}
