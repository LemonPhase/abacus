import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { parseCSV, detectColumns, applyMapping, parseAmount, parseDate, type ColumnMapping } from "@/lib/csv"
import type { TransactionKind } from "@/types"
import { ICON_MAP } from "@/lib/icons"

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const TRANSACTION_TYPES: TransactionKind[] = ["income", "expense", "transfer"]

interface TxFormData {
  accountId: string
  categoryId: string
  type: TransactionKind
  amount: string
  date: string
  description: string
  toAccountId: string
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
  const [filterAccount, setFilterAccount] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  // CSV import state
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const [csvStep, setCsvStep] = useState<"upload" | "map" | "preview">("upload")
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRawRows, setCsvRawRows] = useState<Record<string, string>[]>([])
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({ date: "", description: "", amount: "", type: "" })
  const [csvMappedRows, setCsvMappedRows] = useState<{ date: string; description: string; amount: string; type?: "income" | "expense" }[]>([])
  const [csvAccountId, setCsvAccountId] = useState("")
  const [csvCategoryId, setCsvCategoryId] = useState("")

  useEffect(() => {
    loadTx()
    loadAccounts()
    loadCategories()
  }, [loadTx, loadAccounts, loadCategories])

  const filteredTxn = useMemo(() => {
    return transactions.filter((t) => {
      if (filterAccount !== "all" && t.accountId !== filterAccount) return false
      if (filterCategory !== "all" && t.categoryId !== filterCategory) return false
      if (filterType !== "all" && t.type !== filterType) return false
      if (filterDateFrom && new Date(t.date) < new Date(filterDateFrom)) return false
      if (filterDateTo && new Date(t.date) > new Date(filterDateTo + "T23:59:59")) return false
      return true
    })
  }, [transactions, filterAccount, filterCategory, filterType, filterDateFrom, filterDateTo])

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

  function handleCsvRemap() {
    const mapped = applyMapping(csvRawRows, csvMapping)
    setCsvMappedRows(mapped)
    setCsvStep("preview")
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
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">Account</Label>
          <Select value={filterAccount} onValueChange={(v) => setFilterAccount(v ?? "all")}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Category</Label>
          <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "all")}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            className="h-8 w-36 text-xs"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>
        {(filterAccount !== "all" || filterCategory !== "all" || filterType !== "all" || filterDateFrom || filterDateTo) && (
          <Button
            variant="ghost"
            size="xs"
            className="mb-0.5"
            onClick={() => {
              setFilterAccount("all")
              setFilterCategory("all")
              setFilterType("all")
              setFilterDateFrom("")
              setFilterDateTo("")
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

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
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: (v ?? "expense") as TransactionKind })}>
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
              <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v ?? "" })}>
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
              <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v ?? "" })}>
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
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-desc">Description</Label>
              <Input
                id="tx-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Grocery shopping"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.accountId || !form.categoryId || !form.amount}>
              {editing ? "Save" : "Add Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      <Dialog open={csvDialogOpen} onOpenChange={(open) => { setCsvDialogOpen(open); if (!open) { setCsvStep("upload"); setCsvHeaders([]); setCsvRawRows([]); setCsvMappedRows([]) }}}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {csvStep === "upload" && "Import CSV"}
              {csvStep === "map" && "Map Columns"}
              {csvStep === "preview" && "Preview Import"}
            </DialogTitle>
          </DialogHeader>

          {csvStep === "upload" && (
            <div className="py-8">
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <Upload className="size-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">Click to upload a CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">Bank exports, spreadsheets, etc.</p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleCsvFile(file)
                  }}
                />
              </label>
            </div>
          )}

          {csvStep === "map" && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Match CSV columns to transaction fields. Auto-detected where possible.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Date column</Label>
                  <Select value={csvMapping.date} onValueChange={(v: string | null) => setCsvMapping({ ...csvMapping, date: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Amount column</Label>
                  <Select value={csvMapping.amount} onValueChange={(v: string | null) => setCsvMapping({ ...csvMapping, amount: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Description column</Label>
                  <Select value={csvMapping.description} onValueChange={(v: string | null) => setCsvMapping({ ...csvMapping, description: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Type column (optional)</Label>
                  <Select value={csvMapping.type} onValueChange={(v: string | null) => setCsvMapping({ ...csvMapping, type: v ?? "" })}>
                    <SelectTrigger><SelectValue placeholder="Auto-detect" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto-detect</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsvStep("upload")}>Back</Button>
                <Button onClick={handleCsvRemap} disabled={!csvMapping.date || !csvMapping.amount}>Preview</Button>
              </DialogFooter>
            </div>
          )}

          {csvStep === "preview" && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Account</Label>
                  <Select value={csvAccountId} onValueChange={(v: string | null) => setCsvAccountId(v ?? "")}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Default Category</Label>
                  <Select value={csvCategoryId} onValueChange={(v: string | null) => setCsvCategoryId(v ?? "")}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.type === "expense")
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {csvMappedRows.length} transactions will be imported.
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvMappedRows.slice(0, 50).map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{row.date}</TableCell>
                        <TableCell className="text-xs max-w-40 truncate">{row.description}</TableCell>
                        <TableCell className="text-xs text-right">{row.amount}</TableCell>
                        <TableCell className="text-xs">{row.type ?? "auto"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCsvStep("map")}>Back</Button>
                <Button onClick={handleCsvImport} disabled={!csvAccountId || !csvCategoryId || csvMappedRows.length === 0}>
                  Import {csvMappedRows.length} Transactions
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
