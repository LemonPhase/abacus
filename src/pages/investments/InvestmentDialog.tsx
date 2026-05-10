import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INVESTMENT_TYPE_LABELS } from './constants'
import type { InvestmentPlan, InvestmentType } from '@/types'

const INVESTMENT_TYPES: InvestmentType[] = [
  'fixed_income',
  'index_fund',
  'stock',
  'real_estate',
  'cash',
  'crypto',
  'other',
]

export interface InvestmentFormData {
  name: string
  type: InvestmentType
  initialAmount: string
  monthlyContribution: string
  annualReturnRate: string
  notes: string
}

interface InvestmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: InvestmentPlan | null
  form: InvestmentFormData
  onFormChange: (form: InvestmentFormData) => void
  onSave: () => void
}

export function InvestmentDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSave,
}: InvestmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Investment' : 'Add Investment'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. S&P 500 Index Fund"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v: string | null) =>
                onFormChange({
                  ...form,
                  type: (v ?? 'index_fund') as InvestmentType,
                })
              }
              items={INVESTMENT_TYPES.map((t) => ({
                value: t,
                label: INVESTMENT_TYPE_LABELS[t],
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INVESTMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="inv-initial">Initial Amount</Label>
              <Input
                id="inv-initial"
                type="number"
                step="0.01"
                min="0"
                value={form.initialAmount}
                onChange={(e) => onFormChange({ ...form, initialAmount: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-monthly">Monthly Contribution</Label>
              <Input
                id="inv-monthly"
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyContribution}
                onChange={(e) =>
                  onFormChange({
                    ...form,
                    monthlyContribution: e.target.value,
                  })
                }
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inv-return">Annual Return Rate (%)</Label>
            <Input
              id="inv-return"
              type="number"
              step="0.1"
              value={form.annualReturnRate}
              onChange={(e) =>
                onFormChange({
                  ...form,
                  annualReturnRate: e.target.value,
                })
              }
              placeholder="e.g. 7"
            />
            <p className="text-xs text-muted-foreground">
              Typical: Fixed Income 2-5%, Index Funds 7-10%, Stocks 8-12%, Crypto 20%+
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Input
              id="inv-notes"
              value={form.notes}
              onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
              placeholder="e.g. Vanguard VOO"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!form.name.trim()}>
            {editing ? 'Save' : 'Add Investment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
