import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Account, Category, TransactionKind } from "@/types"

const TRANSACTION_TYPES: TransactionKind[] = ["income", "expense", "transfer"]

export interface TxFormData {
  accountId: string
  categoryId: string
  type: TransactionKind
  amount: string
  date: string
  description: string
  toAccountId: string
}

interface TransactionDialogProps {
  open: boolean
  editing: boolean
  form: TxFormData
  accounts: Account[]
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onFormChange: (form: TxFormData) => void
  onSave: () => void
}

export function TransactionDialog({
  open,
  editing,
  form,
  accounts,
  categories,
  onOpenChange,
  onFormChange,
  onSave,
}: TransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                onFormChange({
                  ...form,
                  type: (v ?? "expense") as TransactionKind,
                  categoryId: "",
                })
              }
              items={TRANSACTION_TYPES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Account</Label>
            <Select
              value={form.accountId}
              onValueChange={(v) => onFormChange({ ...form, accountId: v ?? "" })}
              items={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={form.categoryId}
              onValueChange={(v) => onFormChange({ ...form, categoryId: v ?? "" })}
              items={categories
                .filter((c) => (form.type === "transfer" ? true : c.type === form.type))
                .map((c) => ({ value: c.id, label: c.name }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((c) => (form.type === "transfer" ? true : c.type === form.type))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => onFormChange({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => onFormChange({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tx-desc">Description</Label>
            <Input
              id="tx-desc"
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              placeholder="e.g. Grocery shopping"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!form.accountId || !form.categoryId || !form.amount}>
            {editing ? "Save" : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
