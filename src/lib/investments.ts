import type { InvestmentPlan, ProjectionYear } from "@/types"

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

export function calculateTotalProjection(plans: InvestmentPlan[], horizonYears: number): ProjectionYear[] {
  if (plans.length === 0) return []
  const combined: ProjectionYear[] = []

  for (let y = 1; y <= horizonYears; y++) {
    let totalValue = 0
    let totalInvested = 0

    for (const plan of plans) {
      const projection = calculateProjection(plan, y)
      const yearData = projection[projection.length - 1]
      totalValue += yearData.totalValue
      totalInvested += yearData.principal
    }

    combined.push({
      year: y,
      principal: totalInvested,
      returns: totalValue - totalInvested,
      totalValue: Math.round(totalValue * 100) / 100,
    })
  }

  return combined
}

export function formatInvestmentValue(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}

export const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  fixed_income: "Fixed Income",
  index_fund: "Index Fund",
  stock: "Individual Stock",
  real_estate: "Real Estate",
  cash: "Cash / Savings",
  crypto: "Crypto",
  other: "Other",
}

export const INVESTMENT_TYPE_COLORS: Record<string, string> = {
  fixed_income: "#3b82f6",
  index_fund: "#22c55e",
  stock: "#ef4444",
  real_estate: "#f59e0b",
  cash: "#8b5cf6",
  crypto: "#ec4899",
  other: "#64748b",
}
