import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch'
import type { Account, Category, RecurringFrequency, RecurringTransactionKind } from '@/types'
import type { RecurringTransaction } from '@/types'

export interface RecurringFormData {
  accountId: string
  categoryId: string
  type: RecurringTransactionKind
  amount: string
  description: string
  frequency: RecurringFrequency
  intervalValue: string
  dayOfMonth: string
  startDate: string
  endDate: string
  isActive: boolean
}

const FREQUENCIES: RecurringFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']
const TYPES: RecurringTransactionKind[] = ['income', 'expense']

interface RecurringDialogProps {
  open: boolean
  editing: RecurringTransaction | null
  form: RecurringFormData
  accounts: Account[]
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onFormChange: (form: RecurringFormData) => void
  onSave: () => void
}

export function RecurringDialog({
  open,
  editing,
  form,
  accounts,
  categories,
  onOpenChange,
  onFormChange,
  onSave,
}: RecurringDialogProps) {
  const filteredCategories = categories.filter((c) =>
    form.type === 'income' ? c.type === 'income' : c.type === 'expense',
  )

  const showDayOfMonth = form.frequency === 'monthly'

  const isSaveDisabled = !form.accountId || !form.categoryId || !form.amount || !form.intervalValue

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                onFormChange({
                  ...form,
                  type: (v ?? 'expense') as RecurringTransactionKind,
                  categoryId: '',
                })
              }
              items={TYPES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Account</Label>
            <Select
              value={form.accountId}
              onValueChange={(v) => onFormChange({ ...form, accountId: v ?? '' })}
              items={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => onFormChange({ ...form, categoryId: v ?? '' })}
              items={filteredCategories.map((c) => ({ value: c.id, label: c.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="rc-amount">Amount</Label>
              <Input
                id="rc-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rc-desc">Description</Label>
              <Input
                id="rc-desc"
                value={form.description}
                onChange={(e) => onFormChange({ ...form, description: e.target.value })}
                placeholder="e.g. Netflix"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) =>
                  onFormChange({
                    ...form,
                    frequency: (v ?? 'monthly') as RecurringFrequency,
                    dayOfMonth: v === 'monthly' ? form.dayOfMonth : '',
                  })
                }
                items={FREQUENCIES.map((f) => ({
                  value: f,
                  label: f.charAt(0).toUpperCase() + f.slice(1),
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rc-interval">Every</Label>
              <Input
                id="rc-interval"
                type="number"
                min="1"
                max="365"
                value={form.intervalValue}
                onChange={(e) => onFormChange({ ...form, intervalValue: e.target.value })}
                placeholder="1"
              />
            </div>
          </div>
          {showDayOfMonth && (
            <div className="grid gap-2">
              <Label htmlFor="rc-day">Day of Month (optional)</Label>
              <Input
                id="rc-day"
                type="number"
                min="1"
                max="31"
                value={form.dayOfMonth}
                onChange={(e) => onFormChange({ ...form, dayOfMonth: e.target.value })}
                placeholder="Auto"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the start date&apos;s day. Adjusts for shorter months.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="rc-start">Start Date</Label>
              <Input
                id="rc-start"
                type="date"
                value={form.startDate}
                onChange={(e) => onFormChange({ ...form, startDate: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rc-end">End Date (optional)</Label>
              <Input
                id="rc-end"
                type="date"
                value={form.endDate}
                onChange={(e) => onFormChange({ ...form, endDate: e.target.value })}
                placeholder="Never"
              />
            </div>
          </div>
          {editing && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => onFormChange({ ...form, isActive: checked })}
              />
              <span className="text-sm font-medium">Active</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isSaveDisabled}>
            {editing ? 'Save' : 'Add Recurring Transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
