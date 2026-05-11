export type BudgetStatus = 'good' | 'warning' | 'danger' | 'over'

export interface BudgetStatusColors {
  bar: string
  text: string
}

const STATUS_MAP: Record<BudgetStatus, BudgetStatusColors> = {
  good: { bar: 'bg-jade', text: 'text-jade' },
  warning: { bar: 'bg-amber-500', text: 'text-amber-600' },
  danger: { bar: 'bg-orange-500', text: 'text-orange-600' },
  over: { bar: 'bg-cinnabar', text: 'text-cinnabar' },
}

export function getBudgetStatus(percentage: number): BudgetStatus {
  if (percentage < 50) return 'good'
  if (percentage < 80) return 'warning'
  if (percentage < 100) return 'danger'
  return 'over'
}

export function getBudgetColors(status: BudgetStatus): BudgetStatusColors {
  return STATUS_MAP[status]
}
