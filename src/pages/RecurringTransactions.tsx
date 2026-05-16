import { useEffect, useState, useMemo } from 'react'
import { Loader2, Plus, Pencil, Trash2, CalendarClock, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { formatFrequency, computeNextDate } from '@/lib/recurring'
import { formatCurrency } from '@/lib/currency'
import { DEFAULT_CATEGORY_COLOR } from '@/lib/chartColors'
import { ICON_MAP } from '@/lib/icons'
import type { RecurringTransaction, RecurringFrequency, RecurringTransactionKind } from '@/types'
import { RecurringDialog, type RecurringFormData } from '@/pages/recurring/RecurringDialog'

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const emptyForm: RecurringFormData = {
  accountId: '',
  categoryId: '',
  type: 'expense',
  amount: '',
  description: '',
  frequency: 'monthly',
  intervalValue: '1',
  dayOfMonth: '',
  startDate: new Date().toISOString().slice(0, 10),
  endDate: '',
  isActive: true,
}

export default function RecurringTransactions() {
  const items = useRecurringTransactionsStore((s) => s.items)
  const loading = useRecurringTransactionsStore((s) => s.loading)
  const loadItems = useRecurringTransactionsStore((s) => s.load)
  const add = useRecurringTransactionsStore((s) => s.add)
  const update = useRecurringTransactionsStore((s) => s.update)
  const remove = useRecurringTransactionsStore((s) => s.remove)
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const addTx = useTransactionsStore((s) => s.add)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringTransaction | null>(null)
  const [form, setForm] = useState<RecurringFormData>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTransaction | null>(null)
  const [applyTarget, setApplyTarget] = useState<RecurringTransaction | null>(null)

  useEffect(() => {
    loadItems()
    loadAccounts()
    loadCategories()
  }, [loadItems, loadAccounts, loadCategories])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const getAccountName = (id: string) => accountById.get(id)?.name ?? 'Unknown'
  const getCategoryName = (id: string | null) =>
    id ? (categoryById.get(id)?.name ?? 'Unknown') : '—'
  const getCategoryIcon = (id: string | null) => (id ? (categoryById.get(id)?.icon ?? null) : null)
  const getCategoryColor = (id: string | null) =>
    id ? (categoryById.get(id)?.color ?? DEFAULT_CATEGORY_COLOR) : DEFAULT_CATEGORY_COLOR

  const getCurrency = (id: string) => accountById.get(id)?.currency ?? baseCurrency

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm, startDate: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  function openEdit(item: RecurringTransaction) {
    setEditing(item)
    setForm({
      accountId: item.accountId,
      categoryId: item.categoryId ?? '',
      type: item.type,
      amount: String(item.amount),
      description: item.description ?? '',
      frequency: item.frequency,
      intervalValue: String(item.intervalValue),
      dayOfMonth: item.dayOfMonth != null ? String(item.dayOfMonth) : '',
      startDate: new Date(item.startDate).toISOString().slice(0, 10),
      endDate: item.endDate ? new Date(item.endDate).toISOString().slice(0, 10) : '',
      isActive: item.isActive,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    try {
      const amount = parseFloat(form.amount) || 0
      if (!form.accountId || !form.categoryId || !amount) return
      const account = accounts.find((a) => a.id === form.accountId)
      const currency = account?.currency ?? baseCurrency
      const intervalValue = parseInt(form.intervalValue, 10) || 1
      const dayOfMonth = form.dayOfMonth ? parseInt(form.dayOfMonth, 10) : null

      const startDate = new Date(form.startDate)
      const nextDate = startDate
      const endDate = form.endDate ? new Date(form.endDate) : null

      const data = {
        accountId: form.accountId,
        categoryId: form.categoryId || null,
        type: form.type as RecurringTransactionKind,
        amount,
        currency,
        description: form.description.trim() || undefined,
        frequency: form.frequency as RecurringFrequency,
        intervalValue,
        dayOfMonth,
        startDate,
        endDate,
        nextDate,
        isActive: form.isActive,
      }

      if (editing) {
        await update(editing.id, data)
      } else {
        await add(data)
      }
      setDialogOpen(false)
      setEditing(null)
    } catch {
      // Error in store → GlobalErrorBanner
    }
  }

  async function handleDelete() {
    try {
      if (!deleteTarget) return
      await remove(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error in store
    }
  }

  async function handleApplyNow() {
    try {
      if (!applyTarget) return
      const item = applyTarget
      const account = accounts.find((a) => a.id === item.accountId)
      const currency = account?.currency ?? baseCurrency

      await addTx({
        accountId: item.accountId,
        categoryId: item.categoryId,
        type: item.type,
        amount: item.amount,
        currency,
        date: new Date(item.nextDate),
        description: item.description ? `${item.description}` : undefined,
      })

      const nextDate = computeNextDate(
        new Date(item.nextDate),
        item.frequency,
        item.intervalValue,
        item.dayOfMonth,
      )

      if (item.endDate && nextDate > new Date(item.endDate)) {
        await update(item.id, { isActive: false })
      } else {
        await update(item.id, { nextDate })
      }

      setApplyTarget(null)
      loadItems()
    } catch {
      // Error in store
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recurring</h1>
          <p className="text-muted-foreground">
            Schedule bills and income that repeat automatically.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add Recurring
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <CalendarClock className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium mb-1">No recurring transactions</p>
          <p className="text-sm">
            Set up recurring bills and income so you don&apos;t have to enter them manually.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right w-28">Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Next Date</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isDue = item.isActive && new Date(item.nextDate) <= new Date()
                return (
                  <TableRow key={item.id} className={!item.isActive ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{item.description || '—'}</span>
                        {!item.isActive && (
                          <span className="text-xs text-muted-foreground">Paused</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{getAccountName(item.accountId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const iconName = getCategoryIcon(item.categoryId)
                          const IconComp = iconName ? ICON_MAP[iconName] : null
                          return IconComp ? (
                            <IconComp
                              className="size-3.5 shrink-0"
                              style={{ color: getCategoryColor(item.categoryId) }}
                            />
                          ) : (
                            <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: getCategoryColor(item.categoryId) }}
                            />
                          )
                        })()}
                        <span className="text-xs">{getCategoryName(item.categoryId)}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={`text-right text-xs tabular-nums font-medium ${item.type === 'income' ? 'text-jade' : 'text-cinnabar'}`}
                    >
                      {item.type === 'income' ? '+' : '−'}{' '}
                      {formatCurrency(item.amount, getCurrency(item.accountId))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatFrequency(item.frequency, item.intervalValue)}
                      {item.dayOfMonth != null && item.frequency === 'monthly'
                        ? ` (day ${item.dayOfMonth})`
                        : ''}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      <div className="flex flex-col">
                        <span className={isDue ? 'text-cinnabar font-medium' : ''}>
                          {formatDate(new Date(item.nextDate))}
                        </span>
                        {isDue && <span className="text-xs text-cinnabar">Due now</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {isDue && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            title="Apply now"
                            onClick={() => setApplyTarget(item)}
                          >
                            <Play className="size-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-xs" onClick={() => openEdit(item)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteTarget(item)}
                        >
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
      )}

      {/* Add/Edit Dialog */}
      <RecurringDialog
        open={dialogOpen}
        editing={editing}
        form={form}
        accounts={accounts}
        categories={categories}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        onFormChange={setForm}
        onSave={handleSave}
      />

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Recurring Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete{' '}
            <strong>{deleteTarget?.description || 'this recurring transaction'}</strong>? This will
            not delete any past transactions.
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

      {/* Apply Now Dialog */}
      <Dialog
        open={!!applyTarget}
        onOpenChange={(open) => {
          if (!open) setApplyTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Recurring Transaction</DialogTitle>
          </DialogHeader>
          {applyTarget && (
            <p className="text-muted-foreground">
              This will create a{' '}
              <strong>
                {applyTarget.type === 'income' ? '+' : '−'}
                {formatCurrency(applyTarget.amount, getCurrency(applyTarget.accountId))}
              </strong>{' '}
              transaction on <strong>{formatDate(new Date(applyTarget.nextDate))}</strong> for{' '}
              <strong>{applyTarget.description || 'this item'}</strong>, and advance the next
              occurrence.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleApplyNow}>Apply Now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
