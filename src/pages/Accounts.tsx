import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { AccountDialog, type AccountFormData } from '@/pages/accounts/AccountDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Account, AccountType } from '@/types'
import { formatCurrency } from '@/lib/currency'

const TYPE_COLORS: Record<AccountType, string> = {
  checking: 'default',
  savings: 'secondary',
  investment: 'default',
  credit: 'destructive',
  cash: 'outline',
}

export default function Accounts() {
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const getEmptyForm = (): AccountFormData => ({
    name: '',
    type: 'checking',
    currency: baseCurrency,
    balance: '',
    notes: '',
  })

  const accounts = useAccountsStore((s) => s.accounts)
  const loading = useAccountsStore((s) => s.loading)
  const load = useAccountsStore((s) => s.load)
  const add = useAccountsStore((s) => s.add)
  const update = useAccountsStore((s) => s.update)
  const remove = useAccountsStore((s) => s.remove)
  const transactions = useTransactionsStore((s) => s.transactions)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<AccountFormData>(getEmptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)

  useEffect(() => {
    load()
  }, [load])

  function openAdd() {
    setEditing(null)
    setForm(getEmptyForm())
    setDialogOpen(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    setForm({
      name: account.name,
      type: account.type,
      currency: account.currency,
      balance: String(account.balance),
      notes: account.notes ?? '',
    })
    setDialogOpen(true)
  }

  function confirmDelete(account: Account) {
    setDeleteTarget(account)
  }

  async function handleSave() {
    try {
      const data = {
        name: form.name.trim(),
        type: form.type,
        currency: form.currency,
        balance: parseFloat(form.balance) || 0,
        notes: form.notes.trim() || undefined,
      }

      if (!data.name) return

      if (editing) {
        await update(editing.id, data)
      } else {
        await add(data)
      }

      setDialogOpen(false)
      setEditing(null)
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  async function handleDelete() {
    try {
      if (!deleteTarget) return
      await remove(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">Manage your financial accounts.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add Account
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-1">No accounts yet</p>
          <p className="text-sm">Add your first account to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        TYPE_COLORS[account.type] as
                          | 'default'
                          | 'secondary'
                          | 'destructive'
                          | 'outline'
                      }
                    >
                      {account.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{account.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={account.balance < 0 ? 'text-destructive' : ''}>
                      {formatCurrency(account.balance, account.currency)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(account)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => confirmDelete(account)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action
            cannot be undone.
            {(() => {
              const count = transactions.filter((t) => t.accountId === deleteTarget?.id).length
              return count > 0 ? (
                <span className="block mt-1 text-cinnabar font-medium">
                  {count} transaction{count !== 1 ? 's' : ''} will become unlinked.
                </span>
              ) : null
            })()}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
