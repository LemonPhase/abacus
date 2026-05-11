import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ICON_MAP } from '@/lib/icons'
import type { Budget, BudgetPeriod, Category } from '@/types'

export interface BudgetFormData {
  name: string
  categoryIds: string[]
  amount: string
  period: BudgetPeriod
  startDate: string
  subtractFromId: string
}

interface BudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Budget | null
  form: BudgetFormData
  onFormChange: (form: BudgetFormData) => void
  onToggleCategory: (id: string) => void
  onSave: () => void
  expenseCategories: Category[]
  existingBudgets: Budget[]
  formatAmount: (n: number) => string
}

export function BudgetDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onToggleCategory,
  onSave,
  expenseCategories,
  existingBudgets,
  formatAmount,
}: BudgetDialogProps) {
  const subtractEnabled = !!form.subtractFromId
  const sourceBudget = subtractEnabled
    ? existingBudgets.find((b) => b.id === form.subtractFromId)
    : null
  const newAmount = parseFloat(form.amount) || 0
  const subtractInvalid: boolean = !!(
    subtractEnabled &&
    sourceBudget &&
    newAmount > sourceBudget.amount
  )
  const sourceNewAmount =
    sourceBudget && subtractEnabled ? Math.max(0, sourceBudget.amount - newAmount) : 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Budget' : 'Add Budget'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="budget-name">Name</Label>
            <Input
              id="budget-name"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. Monthly Food"
            />
          </div>
          <div className="grid gap-2">
            <Label>Period</Label>
            <Select
              value={form.period}
              onValueChange={(v: string | null) =>
                onFormChange({
                  ...form,
                  period: (v ?? 'monthly') as BudgetPeriod,
                })
              }
              items={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="budget-amount">Amount</Label>
              <Input
                id="budget-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="budget-date">Start Date</Label>
              <Input
                id="budget-date"
                type="date"
                value={form.startDate}
                onChange={(e) => onFormChange({ ...form, startDate: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Categories</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-1">
              {expenseCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No expense categories available.</p>
              ) : (
                expenseCategories.map((cat) => {
                  const CatIcon = ICON_MAP[cat.icon ?? '']
                  return (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2.5 py-1 cursor-pointer rounded hover:bg-muted/50 px-1"
                    >
                      <Checkbox
                        checked={form.categoryIds.includes(cat.id)}
                        onCheckedChange={() => onToggleCategory(cat.id)}
                      />
                      {CatIcon ? (
                        <CatIcon className="size-4 shrink-0" style={{ color: cat.color }} />
                      ) : (
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                      )}
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  )
                })
              )}
            </div>
            {form.name.trim() && form.amount && form.categoryIds.length === 0 && (
              <p className="text-xs text-muted-foreground">Select at least one category.</p>
            )}
          </div>
          {!editing && existingBudgets.length > 0 && (
            <div className="grid gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={subtractEnabled}
                  onCheckedChange={(checked) =>
                    onFormChange({
                      ...form,
                      subtractFromId: checked ? existingBudgets[0].id : '',
                    })
                  }
                />
                <span className="text-sm font-medium">Subtract from existing budget</span>
              </label>
              {subtractEnabled && (
                <div className="space-y-2">
                  <Select
                    value={form.subtractFromId}
                    onValueChange={(v: string | null) =>
                      onFormChange({ ...form, subtractFromId: v ?? '' })
                    }
                    items={existingBudgets.map((b) => ({
                      value: b.id,
                      label: `${b.name} (${formatAmount(b.amount)})`,
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a budget..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingBudgets.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({formatAmount(b.amount)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sourceBudget && !subtractInvalid && newAmount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      &quot;{sourceBudget.name}&quot; will be reduced from{' '}
                      {formatAmount(sourceBudget.amount)} to {formatAmount(sourceNewAmount)}.
                    </p>
                  )}
                  {subtractInvalid && sourceBudget && (
                    <p className="text-xs text-cinnabar">
                      New budget amount ({formatAmount(newAmount)}) cannot exceed source budget
                      amount ({formatAmount(sourceBudget.amount)}).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={
              !form.name.trim() || !form.amount || form.categoryIds.length === 0 || subtractInvalid
            }
          >
            {editing ? 'Save' : 'Add Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
