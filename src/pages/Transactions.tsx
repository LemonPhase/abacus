import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, Plus, Pencil, Trash2, Upload, FileText } from 'lucide-react'
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
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { CrudFilter } from '@/stores/crudStore'
import { getRate, type RateQuote } from '@/services/exchange'
import { roundCurrency } from '@/lib/currency'
import { parseCSV, detectColumns, parseAmount, parseDate, type ColumnMapping } from '@/lib/csv'
import type { Transaction, TransactionKind, NewTransaction } from '@/types'
import { ICON_MAP } from '@/lib/icons'
import { formatCurrency } from '@/lib/currency'
import { DEFAULT_CATEGORY_COLOR } from '@/lib/chartColors'
import { TransactionDialog, type TxFormData } from '@/pages/transactions/TransactionDialog'
import {
  TransactionFilters,
  type TransactionFiltersValue,
} from '@/pages/transactions/TransactionFilters'
import { CsvImportDialog, type CsvMappedRow } from '@/pages/transactions/CsvImportDialog'

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const PAGE_SIZE = 50

/** Translate the UI filter bar into server-side (snake_case) filters. */
function buildFilters(f: TransactionFiltersValue): CrudFilter[] {
  const out: CrudFilter[] = []
  if (f.account !== 'all') out.push({ col: 'account_id', op: 'eq', value: f.account })
  if (f.category !== 'all') out.push({ col: 'category_id', op: 'eq', value: f.category })
  if (f.type !== 'all') out.push({ col: 'type', op: 'eq', value: f.type })
  if (f.dateFrom) out.push({ col: 'date', op: 'gte', value: f.dateFrom })
  if (f.dateTo) out.push({ col: 'date', op: 'lte', value: f.dateTo })
  return out
}

const emptyTxForm: TxFormData = {
  accountId: '',
  categoryId: '',
  type: 'expense',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  toAccountId: '',
}

export default function Transactions() {
  const transactions = useTransactionsStore((s) => s.transactions)
  const loading = useTransactionsStore((s) => s.loading)
  const loadingMore = useTransactionsStore((s) => s.loadingMore)
  const hasMore = useTransactionsStore((s) => s.hasMore)
  const total = useTransactionsStore((s) => s.total)
  const loadTx = useTransactionsStore((s) => s.load)
  const loadMoreTx = useTransactionsStore((s) => s.loadMore)
  const add = useTransactionsStore((s) => s.add)
  const bulkAdd = useTransactionsStore((s) => s.bulkAdd)
  const update = useTransactionsStore((s) => s.update)
  const remove = useTransactionsStore((s) => s.remove)
  const createTransfer = useTransactionsStore((s) => s.createTransfer)
  const editTransfer = useTransactionsStore((s) => s.editTransfer)
  const deleteTransfer = useTransactionsStore((s) => s.deleteTransfer)
  const convertTransferToPlain = useTransactionsStore((s) => s.convertTransferToPlain)
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<TxFormData>(emptyTxForm)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  // Idempotency key for the next transfer RPC; stable across save retries.
  const [transferKey, setTransferKey] = useState(() => crypto.randomUUID())
  const [saveError, setSaveError] = useState<string | null>(null)

  // Filters (applied server-side; changing them reloads the first page)
  const [filters, setFilters] = useState<TransactionFiltersValue>({
    account: 'all',
    category: 'all',
    type: 'all',
    dateFrom: '',
    dateTo: '',
  })

  // CSV import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvStep, setCsvStep] = useState<'upload' | 'map' | 'preview'>('upload')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([])
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({
    date: '',
    description: '',
    amount: '',
    type: '',
  })
  const [csvMappedRows, setCsvMappedRows] = useState<CsvMappedRow[]>([])
  const [csvAccountId, setCsvAccountId] = useState('')
  const [csvCategoryId, setCsvCategoryId] = useState('')

  useEffect(() => {
    loadTx({ limit: PAGE_SIZE, filters: buildFilters(filters) })
    loadAccounts()
    loadCategories()
  }, [loadTx, loadAccounts, loadCategories, filters])

  // Auto-open add dialog when arriving via FAB (?add=true)
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    if (searchParams.get('add') === 'true' && !loading) {
      openAdd()
      const next = new URLSearchParams(searchParams)
      next.delete('add')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams, loading])

  const filtersActive =
    filters.account !== 'all' ||
    filters.category !== 'all' ||
    filters.type !== 'all' ||
    !!filters.dateFrom ||
    !!filters.dateTo

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyTxForm, date: new Date().toISOString().slice(0, 10) })
    // Fresh idempotency key per dialog session: save-click retries reuse it.
    setTransferKey(crypto.randomUUID())
    setSaveError(null)
    setDialogOpen(true)
  }

  // The partner leg of a transfer row, via the stable transfer id (falling
  // back to the legacy correlative link for rows written before it existed).
  function partnerOf(tx: Transaction): Transaction | undefined {
    if (tx.type !== 'transfer') return undefined
    if (tx.transferId) {
      return transactions.find((t) => t.transferId === tx.transferId && t.id !== tx.id)
    }
    if (tx.correlativeId) return transactions.find((t) => t.id === tx.correlativeId)
    return undefined
  }

  function openEdit(tx: Transaction) {
    setEditing(tx.id)
    let accountId = tx.accountId
    let toAccountId = ''

    const correlative = partnerOf(tx)
    if (tx.type === 'transfer' && correlative) {
      if (tx.amount < 0) {
        toAccountId = correlative.accountId
      } else {
        accountId = correlative.accountId
        toAccountId = tx.accountId
      }
    }

    setForm({
      accountId,
      categoryId: tx.categoryId ?? '',
      type: tx.type,
      amount: String(Math.abs(tx.amount)),
      date: new Date(tx.date).toISOString().slice(0, 10),
      description: tx.description ?? '',
      toAccountId,
    })
    // Fresh key in case an edit converts the row into a new transfer pair.
    setTransferKey(crypto.randomUUID())
    setSaveError(null)
    setDialogOpen(true)
  }

  /** FX quote for a cross-currency transfer, or null when unavailable — no silent 1:1 fallback. */
  async function getTransferQuote(
    fromCurrency: string,
    toCurrency: string,
  ): Promise<RateQuote | null> {
    if (fromCurrency === toCurrency) return { rate: 1, asOf: form.date }
    return getRate(fromCurrency, toCurrency, new Date(form.date))
  }

  async function handleSave() {
    setSaveError(null)
    try {
      const amount = parseFloat(form.amount) || 0
      if (!form.accountId || (!form.categoryId && form.type !== 'transfer') || !amount) return

      const account = accounts.find((a) => a.id === form.accountId)
      const currency = account?.currency ?? baseCurrency

      if (form.type === 'transfer') {
        if (!form.toAccountId) return
        const toAccount = accounts.find((a) => a.id === form.toAccountId)
        const toCurrency = toAccount?.currency ?? currency
        const quote = await getTransferQuote(currency, toCurrency)
        if (!quote) {
          setSaveError(
            `Exchange rate ${currency} → ${toCurrency} is unavailable right now. Try again later, or transfer between accounts in the same currency.`,
          )
          return
        }
        const convertedAmount = roundCurrency(amount * quote.rate, toCurrency)
        const date = new Date(form.date)
        const description = form.description.trim() || undefined
        const categoryId = form.categoryId || null

        // One atomic RPC per operation; the RPC owns both legs, their linkage
        // and the balance effects (20260917000002_atomic_transfers.sql).
        // Per-leg base-amount provenance is computed in the store (computeBase).
        if (editing) {
          const tx = transactions.find((t) => t.id === editing)
          if (tx?.type === 'transfer' && tx.transferId) {
            await editTransfer({
              transferId: tx.transferId,
              fromAccountId: form.accountId,
              toAccountId: form.toAccountId,
              amount,
              convertedAmount,
              categoryId,
              date,
              description,
            })
          } else {
            // Non-transfer converted into a transfer (or a legacy unlinked
            // leg adopted): the existing row becomes the outgoing leg.
            await createTransfer({
              idempotencyKey: transferKey,
              fromAccountId: form.accountId,
              toAccountId: form.toAccountId,
              amount,
              convertedAmount,
              categoryId,
              date,
              description,
              existingTransactionId: editing,
            })
          }
        } else {
          await createTransfer({
            idempotencyKey: transferKey,
            fromAccountId: form.accountId,
            toAccountId: form.toAccountId,
            amount,
            convertedAmount,
            categoryId,
            date,
            description,
          })
        }
      } else if (editing) {
        const tx = transactions.find((t) => t.id === editing)
        if (tx?.type === 'transfer' && tx.transferId) {
          // Transfer converted into a plain transaction: partner deleted and
          // this row rewritten in one RPC.
          await convertTransferToPlain({
            transactionId: editing,
            newType: form.type,
            amount,
            accountId: form.accountId,
            categoryId: form.categoryId || null,
            date: new Date(form.date),
            description: form.description.trim() || undefined,
          })
        } else {
          await update(editing, {
            accountId: form.accountId,
            categoryId: form.categoryId,
            type: form.type,
            amount,
            currency,
            date: new Date(form.date),
            description: form.description.trim() || undefined,
          })
        }
      } else {
        await add({
          accountId: form.accountId,
          categoryId: form.categoryId,
          type: form.type,
          amount,
          currency,
          date: new Date(form.date),
          description: form.description.trim() || undefined,
        })
      }

      setDialogOpen(false)
      setEditing(null)
      if (!editing) {
        setFilters({ account: 'all', category: 'all', type: 'all', dateFrom: '', dateTo: '' })
      }
      loadAccounts()
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  async function handleDelete() {
    try {
      if (!deleteTarget) return
      const tx = transactions.find((t) => t.id === deleteTarget)

      if (tx?.type === 'transfer' && tx.transferId) {
        // Removes both legs atomically (also covers deleting either leg of
        // the pair — the dialog is per-row but the whole pair goes).
        await deleteTransfer(tx.transferId)
      } else {
        await remove(deleteTarget)
      }
      loadAccounts()
      setDeleteTarget(null)
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  async function handleCsvFile(file: File) {
    const result = await parseCSV(file)
    setCsvHeaders(result.headers)
    setCsvRawRows(result.rows)
    const detected = detectColumns(result.headers)
    setCsvMapping(detected)
    setCsvStep('map')
  }

  async function handleCsvImport() {
    try {
      const account = accounts.find((a) => a.id === csvAccountId)
      const currency = account?.currency ?? baseCurrency

      const rowsToInsert: NewTransaction[] = []

      for (const row of csvMappedRows) {
        const parsedAmount = parseAmount(row.amount)
        if (!parsedAmount) continue
        const date = parseDate(row.date)
        if (!date) continue

        let type: TransactionKind = row.type ?? 'expense'
        if (!row.type) {
          type = parsedAmount < 0 ? 'expense' : 'income'
        }

        rowsToInsert.push({
          accountId: csvAccountId,
          categoryId: csvCategoryId,
          type,
          amount: Math.abs(parsedAmount),
          currency,
          date,
          description: row.description.trim() || undefined,
        })
      }

      if (rowsToInsert.length > 0) {
        await bulkAdd(rowsToInsert)
      }

      setCsvDialogOpen(false)
      setCsvStep('upload')
      setCsvHeaders([])
      setCsvRawRows([])
      setCsvMappedRows([])
      setFilters({ account: 'all', category: 'all', type: 'all', dateFrom: '', dateTo: '' })
      loadAccounts()
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const getAccountName = (id: string) => accountById.get(id)?.name ?? 'Unknown'
  const getCategoryName = (id: string | null) =>
    id ? (categoryById.get(id)?.name ?? 'Unknown') : '—'
  const getCategoryIcon = (id: string | null) => (id ? (categoryById.get(id)?.icon ?? null) : null)
  const getCategoryColor = (id: string | null) =>
    id ? (categoryById.get(id)?.color ?? DEFAULT_CATEGORY_COLOR) : DEFAULT_CATEGORY_COLOR

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Track your income and expenses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/app/transactions/import')}>
            <FileText className="size-4" />
            Import Statement
          </Button>
          <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
            <Upload className="size-4" />
            Import CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus className="size-4" />
            Add Transaction
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Filters */}
          <TransactionFilters
            accounts={accounts}
            categories={categories}
            value={filters}
            onChange={setFilters}
            onClear={() =>
              setFilters({ account: 'all', category: 'all', type: 'all', dateFrom: '', dateTo: '' })
            }
          />

          {transactions.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-1">
                {filtersActive ? 'No transactions match your filters' : 'No transactions yet'}
              </p>
              <p className="text-sm">
                {filtersActive
                  ? 'Try adjusting your filters.'
                  : 'Add your first transaction or import a CSV file to get started.'}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="max-w-48">Description</TableHead>
                      <TableHead className="text-right w-28">Amount</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs tabular-nums">
                          {formatDate(new Date(tx.date))}
                        </TableCell>
                        <TableCell className="text-xs">{getAccountName(tx.accountId)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              const iconName = getCategoryIcon(tx.categoryId)
                              const IconComp = iconName ? ICON_MAP[iconName] : null
                              return IconComp ? (
                                <IconComp
                                  className="size-3.5 shrink-0"
                                  style={{ color: getCategoryColor(tx.categoryId) }}
                                />
                              ) : (
                                <span
                                  className="size-2 rounded-full shrink-0"
                                  style={{ backgroundColor: getCategoryColor(tx.categoryId) }}
                                />
                              )
                            })()}
                            <span className="text-xs">{getCategoryName(tx.categoryId)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-48">
                          {tx.description || '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right text-xs tabular-nums font-medium ${tx.type === 'income' || (tx.type === 'transfer' && tx.amount > 0) ? 'text-jade' : tx.type === 'expense' || (tx.type === 'transfer' && tx.amount < 0) ? 'text-cinnabar' : ''}`}
                        >
                          {tx.type === 'income' || (tx.type === 'transfer' && tx.amount > 0)
                            ? '+'
                            : tx.type === 'expense' || (tx.type === 'transfer' && tx.amount < 0)
                              ? '−'
                              : '↔'}{' '}
                          {formatCurrency(Math.abs(tx.amount), tx.currency)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button variant="ghost" size="icon-xs" onClick={() => openEdit(tx)}>
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setDeleteTarget(tx.id)}
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
              {total !== null && (
                <p className="text-xs text-muted-foreground mt-3 px-1 tabular-nums">
                  Showing {transactions.length} of {total} transactions
                </p>
              )}
              {hasMore && (
                <div className="flex justify-center mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMoreTx()}
                    className="gap-2"
                  >
                    {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Add/Edit Dialog */}
      <TransactionDialog
        open={dialogOpen}
        editing={!!editing}
        form={form}
        accounts={accounts}
        categories={categories}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        onFormChange={setForm}
        onSave={handleSave}
        error={saveError}
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
            <DialogTitle>Delete Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this transaction?</p>
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

      {/* CSV Import Dialog */}
      <CsvImportDialog
        open={csvDialogOpen}
        step={csvStep}
        headers={csvHeaders}
        rawRows={csvRawRows}
        mapping={csvMapping}
        mappedRows={csvMappedRows}
        accountId={csvAccountId}
        categoryId={csvCategoryId}
        accounts={accounts}
        categories={categories}
        onOpenChange={(open) => {
          setCsvDialogOpen(open)
          if (!open) {
            setCsvStep('upload')
            setCsvHeaders([])
            setCsvRawRows([])
            setCsvMappedRows([])
          }
        }}
        onFileSelected={handleCsvFile}
        onStepChange={setCsvStep}
        onMappingChange={setCsvMapping}
        onMappedRowsChange={setCsvMappedRows}
        onAccountChange={setCsvAccountId}
        onCategoryChange={setCsvCategoryId}
        onImport={handleCsvImport}
      />
    </div>
  )
}
