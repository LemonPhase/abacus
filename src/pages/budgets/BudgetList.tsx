import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import type { Budget, BudgetPeriod } from "@/types"
import { Pencil, Trash2 } from "lucide-react"

interface BudgetProgress {
  spent: number
  percentage: number
  status: "good" | "warning" | "danger" | "over"
}

const STATUS_COLORS: Record<BudgetProgress["status"], { bar: string; text: string }> = {
  good: { bar: "bg-emerald-500", text: "text-emerald-600" },
  warning: { bar: "bg-amber-500", text: "text-amber-600" },
  danger: { bar: "bg-orange-500", text: "text-orange-600" },
  over: { bar: "bg-rose-500", text: "text-rose-600" },
}

interface BudgetListProps {
  budgets: Budget[]
  baseCurrency: string
  getPeriodLabel: (date: Date, period: BudgetPeriod) => string
  getCategoryName: (id: string) => string
  computeProgress: (budget: Budget) => BudgetProgress
  onEdit: (budget: Budget) => void
  onDelete: (budget: Budget) => void
}

export function BudgetList({
  budgets,
  baseCurrency,
  getPeriodLabel,
  getCategoryName,
  computeProgress,
  onEdit,
  onDelete,
}: BudgetListProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {budgets.map((budget) => {
        const progress = computeProgress(budget)
        const colors = STATUS_COLORS[progress.status]
        return (
          <div key={budget.id} className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{budget.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {budget.categoryIds.map(getCategoryName).join(", ")} ·{" "}
                  {getPeriodLabel(new Date(budget.startDate), budget.period)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-xs" onClick={() => onEdit(budget)}>
                  <Pencil className="size-3" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={() => onDelete(budget)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className={`text-lg font-bold tabular-nums ${colors.text}`}>
                  {formatCurrency(progress.spent, baseCurrency)}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  of {formatCurrency(budget.amount, baseCurrency)}
                </span>
              </div>

              <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                  style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress.percentage.toFixed(0)}% used</span>
                <span>
                  {progress.percentage >= 100
                    ? "Over budget!"
                    : `${formatCurrency(budget.amount - progress.spent, baseCurrency)} left`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
