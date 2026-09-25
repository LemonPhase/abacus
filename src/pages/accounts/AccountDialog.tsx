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
import { formatCurrency } from '@/lib/currency'
import { RequiredMark } from '@/components/RequiredMark'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'BRL']
const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'investment', 'credit', 'cash']

export interface AccountFormData {
  name: string
  type: AccountType
  currency: string
  openingBalance: string
  notes: string
}

interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Account | null
  form: AccountFormData
  onFormChange: (form: AccountFormData) => void
  onSave: () => void
  /**
   * 20260918000001_input_invariants.sql pins an account's currency while
   * transactions reference it; the field is disabled and annotated instead of
   * letting the user hit the database's foreign-key rejection.
   */
  currencyLocked?: boolean
}

export function AccountDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSave,
  currencyLocked = false,
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
            <Label htmlFor="acct-name">
              Name <RequiredMark />
            </Label>
            <Input
              id="acct-name"
              aria-required="true"
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
              <Label htmlFor="acct-currency">Currency</Label>
              <Select
                value={form.currency}
                disabled={currencyLocked}
                onValueChange={(v) => onFormChange({ ...form, currency: v ?? 'USD' })}
              >
                <SelectTrigger id="acct-currency">
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
              {currencyLocked && (
                <p className="text-xs text-muted-foreground">
                  Currency can&apos;t be changed while transactions reference this account.
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acct-balance">Opening balance</Label>
              <Input
                id="acct-balance"
                type="number"
                step="0.01"
                value={form.openingBalance}
                onChange={(e) => onFormChange({ ...form, openingBalance: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          {editing && (
            <div className="grid gap-2">
              <Label className="text-muted-foreground">Current balance (derived)</Label>
              <p className="text-sm tabular-nums">
                {formatCurrency(editing.balance, editing.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                The current balance is the opening balance plus this account&apos;s transactions. To
                correct it, adjust the opening balance.
              </p>
            </div>
          )}
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
