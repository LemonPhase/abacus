import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useAccountsStore } from "@/stores/accountsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { parseCSV, detectColumns, parseAmount, parseDate, type ColumnMapping } from "@/lib/csv"
import type { TransactionKind } from "@/types"
import { ICON_MAP } from "@/lib/icons"
import { formatCurrency } from "@/lib/format"
import { TransactionDialog, type TxFormData } from "@/pages/transactions/TransactionDialog"
import { TransactionFilters, type TransactionFiltersValue } from "@/pages/transactions/TransactionFilters"
import { CsvImportDialog, type CsvMappedRow } from "@/pages/transactions/CsvImportDialog"



function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const emptyTxForm: TxFormData = {
  accountId: "",
  categoryId: "",
  type: "expense",
  amount: "",
  date: new Date().toISOString().slice(0, 10),
  description: "",
  toAccountId: "",
}

export default function Transactions() {
  const { transactions, load: loadTx, add, update, remove } = useTransactionsStore()
  const { accounts, load: loadAccounts } = useAccountsStore()
  const { categories, load: loadCategories } = useCategoriesStore()
  const { baseCurrency } = useSettingsStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<TxFormData>(emptyTxForm)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Filters
  const [filters, setFilters] = useState<TransactionFiltersValue>({
    account: "all",
    category: "all",
    type: "all",
    dateFrom: "",
    dateTo: "",
  })

  // CSV import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvStep, setCsvStep] = useState<"upload" | "map" | "preview">("upload")
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([])
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({ date: "", description: "", amount: "", type: "" })
  const [csvMappedRows, setCsvMappedRows] = useState<CsvMappedRow[]>([])
  const [csvAccountId, setCsvAccountId] = useState("")
  const [csvCategoryId, setCsvCategoryId] = useState("")

  useEffect(() => {
    loadTx()
    loadAccounts()
    loadCategories()
  }, [loadTx, loadAccounts, loadCategories])

  const filteredTxn = useMemo(() => {
    return transactions.filter((t) => {
      if (filters.account !== "all" && t.accountId !== filters.account) return false
      if (filters.category !== "all" && t.categoryId !== filters.category) return false
      if (filters.type !== "all" && t.type !== filters.type) return false
      if (filters.dateFrom && new Date(t.date) < new Date(filters.dateFrom)) return false
      if (filters.dateTo && new Date(t.date) > new Date(filters.dateTo + "T23:59:59")) return false
      return true
    })
  }, [transactions, filters])

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyTxForm, date: new Date().toISOString().slice(0, 10) })
    setDialogOpen(true)
  }

  function openEdit(tx: (typeof transactions)[0]) {
    setEditing(tx.id)
    setForm({
      accountId: tx.accountId,
      categoryId: tx.categoryId,
      type: tx.type,
      amount: String(tx.amount),
      date: new Date(tx.date).toISOString().slice(0, 10),
      description: tx.description ?? "",
      toAccountId: "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const amount = parseFloat(form.amount) || 0
    if (!form.accountId || !form.categoryId || !amount) return

    const account = accounts.find((a) => a.id === form.accountId)
    const currency = account?.currency ?? baseCurrency

    if (editing) {
      await update(editing, {
        accountId: form.accountId,
        categoryId: form.categoryId,
        type: form.type,
        amount,
        currency,
        date: new Date(form.date),
        description: form.description.trim() || undefined,
      })
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
      setFilters({ account: "all", category: "all", type: "all", dateFrom: "", dateTo: "" })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await remove(deleteTarget)
    setDeleteTarget(null)
  }

  async function handleCsvFile(file: File) {
    const result = await parseCSV(file)
    setCsvHeaders(result.headers)
    setCsvRawRows(result.rows)
    const detected = detectColumns(result.headers)
    setCsvMapping(detected)
    setCsvStep("map")
  }

  async function handleCsvImport() {
    const account = accounts.find((a) => a.id === csvAccountId)
    const currency = account?.currency ?? baseCurrency

    for (const row of csvMappedRows) {
      const amount = parseAmount(row.amount)
      if (!amount) continue
      const date = parseDate(row.date)
      if (!date) continue

      let type: TransactionKind = row.type ?? "expense"
      // Auto-detect: negative amount = expense, positive = income
      if (!row.type) {
        type = amount < 0 ? "expense" : "income"
      }

      await add({
        accountId: csvAccountId,
        categoryId: csvCategoryId,
        type,
        amount: Math.abs(amount),
        currency,
        date,
        description: row.description.trim() || undefined,
      })
    }

    setCsvDialogOpen(false)
    setCsvStep("upload")
    setCsvHeaders([])
    setCsvRawRows([])
    setCsvMappedRows([])
    setFilters({ account: "all", category: "all", type: "all", dateFrom: "", dateTo: "" })
  }

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Unknown"
  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Unknown"
  const getCategoryIcon = (id: string) => categories.find((c) => c.id === id)?.icon ?? null
  const getCategoryColor = (id: string) => categories.find((c) => c.id === id)?.color ?? "#888"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Track your income and expenses.</p>
        </div>
        <div className="flex gap-2">
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

      {/* Filters */}
      <TransactionFilters
        accounts={accounts}
        categories={categories}
        value={filters}
        onChange={setFilters}
        onClear={() => setFilters({ account: "all", category: "all", type: "all", dateFrom: "", dateTo: "" })}
      />

      {filteredTxn.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-1">
            {transactions.length === 0 ? "No transactions yet" : "No transactions match your filters"}
          </p>
          <p className="text-sm">
            {transactions.length === 0 ? "Add your first transaction or import a CSV file to get started." : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
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
              {filteredTxn.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="text-xs tabular-nums">{formatDate(new Date(tx.date))}</TableCell>
                  <TableCell className="text-xs">{getAccountName(tx.accountId)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const iconName = getCategoryIcon(tx.categoryId)
                        const IconComp = iconName ? ICON_MAP[iconName] : null
                        return IconComp ? (
                          <IconComp className="size-3.5 shrink-0" style={{ color: getCategoryColor(tx.categoryId) }} />
                        ) : (
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(tx.categoryId) }} />
                        )
                      })()}
                      <span className="text-xs">{getCategoryName(tx.categoryId)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-48">{tx.description || "—"}</TableCell>
                  <TableCell className={`text-right text-xs tabular-nums font-medium ${tx.type === "income" ? "text-emerald-600" : tx.type === "expense" ? "text-rose-600" : ""}`}>
                    {tx.type === "income" ? "+" : tx.type === "expense" ? "−" : "↔"} {formatCurrency(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon-xs" onClick={() => openEdit(tx)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(tx.id)}>
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
      />

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete this transaction?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
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
            setCsvStep("upload")
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
