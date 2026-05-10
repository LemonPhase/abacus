import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import {
  calculateProjection,
  formatInvestmentValue,
  INVESTMENT_TYPE_COLORS,
  INVESTMENT_TYPE_LABELS,
} from '@/lib/investments'
import type { InvestmentPlan } from '@/types'
import { Pencil, Trash2 } from 'lucide-react'

interface InvestmentListProps {
  plans: InvestmentPlan[]
  horizonYears: number
  baseCurrency: string
  onEdit: (plan: InvestmentPlan) => void
  onDelete: (plan: InvestmentPlan) => void
}

export function InvestmentList({
  plans,
  horizonYears,
  baseCurrency,
  onEdit,
  onDelete,
}: InvestmentListProps) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Initial</TableHead>
            <TableHead className="text-right">Monthly</TableHead>
            <TableHead className="text-right">Return/yr</TableHead>
            <TableHead className="text-right">After {horizonYears}y</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => {
            const proj = calculateProjection(plan, horizonYears)
            const final = proj[proj.length - 1]
            return (
              <TableRow key={plan.id}>
                <TableCell className="font-medium">{plan.name}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    style={{ borderColor: INVESTMENT_TYPE_COLORS[plan.type] }}
                  >
                    {INVESTMENT_TYPE_LABELS[plan.type]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatInvestmentValue(plan.initialAmount, baseCurrency)}
                </TableCell>
                <TableCell className="text-right">
                  {formatInvestmentValue(plan.monthlyContribution, baseCurrency)}
                </TableCell>
                <TableCell className="text-right">{plan.annualReturnRate}%</TableCell>
                <TableCell className="text-right font-semibold">
                  {final && formatInvestmentValue(final.totalValue, baseCurrency)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-xs" onClick={() => onEdit(plan)}>
                      <Pencil className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => onDelete(plan)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
