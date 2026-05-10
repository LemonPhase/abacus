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
import type { Account, AccountType } from '@/types'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'BRL']
const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'investment', 'credit', 'cash']

export interface AccountFormData {
  name: string
  type: AccountType
  currency: string
  balance: string
  notes: string
}

interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Account | null
  form: AccountFormData
  onFormChange: (form: AccountFormData) => void
  onSave: () => void
}

export function AccountDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSave,
}: AccountDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Account' : 'Add Account'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="acct-name">Name</Label>
            <Input
              id="acct-name"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. Main Checking"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => onFormChange({ ...form, type: v as AccountType })}
              items={ACCOUNT_TYPES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => onFormChange({ ...form, currency: v ?? 'USD' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acct-balance">Balance</Label>
              <Input
                id="acct-balance"
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => onFormChange({ ...form, balance: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!form.name.trim()}>
            {editing ? 'Save' : 'Add Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
