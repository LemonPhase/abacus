import { lazy, Suspense, useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react'
import { AccountDialog, type AccountFormData } from '@/pages/accounts/AccountDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

type AccountsTab = 'accounts' | 'investments'

// Lazy: the embedded investments view pulls in recharts (~400 KB) — keep it
// out of the main bundle exactly like the old standalone page route did.
const InvestmentsView = lazy(() => import('@/pages/investments/InvestmentsView'))

function ViewFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Host page for accounts and investment plans. `initialTab` deep-links an
 * absorbed segment: /app/investments renders this page with Investments active.
 */
export default function Accounts({ initialTab = 'accounts' }: { initialTab?: AccountsTab }) {
  const [tab, setTab] = useState<AccountsTab>(initialTab)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const getEmptyForm = (): AccountFormData => ({
    name: '',
    type: 'checking',
    currency: baseCurrency,
    openingBalance: '',
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
      openingBalance: String(account.openingBalance),
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
        // balance is derived by the database (opening_balance + ledger effects);
        // opening_balance is the explicit correction path. Never send `balance`.
        openingBalance: parseFloat(form.openingBalance) || 0,
        notes: form.notes.trim() || undefined,
      }

      if (!data.name) return

      if (editing) {
        await update(editing.id, data)
        // balance is derived in the database; the optimistic update only
        // merges the request fields, so reload to pick up the authoritative row.
        await load()
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
          <p className="text-muted-foreground">
            {tab === 'accounts'
              ? 'Manage your financial accounts.'
              : 'Plan and project your investment growth over time.'}
          </p>
        </div>
        {tab === 'accounts' && (
          <Button onClick={openAdd}>
            <Plus className="size-4" />
            Add Account
          </Button>
        )}
      </div>

      {/* Accounts | Investments — investments live here as a segment (mobile IA consolidation) */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as AccountsTab)}>
        <TabsList>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="investments">Investments</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === 'investments' ? (
        <Suspense fallback={<ViewFallback />}>
          <InvestmentsView />
        </Suspense>
      ) : loading ? (
        <ViewFallback />
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
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Edit ${account.name}`}
                        onClick={() => openEdit(account)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${account.name}`}
                        onClick={() => confirmDelete(account)}
                      >
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
        currencyLocked={editing != null && transactions.some((t) => t.accountId === editing.id)}
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
