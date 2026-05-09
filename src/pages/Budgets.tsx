import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { useBudgetsStore } from "@/stores/budgetsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { Budget, BudgetPeriod } from "@/types"
import { ICON_MAP } from "@/lib/icons"
import { formatCurrency } from "@/lib/format"



function getPeriodLabel(date: Date, period: BudgetPeriod): string {
  if (period === "monthly") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }
  return date.getFullYear().toString()
}

function getPeriodBounds(date: Date, period: BudgetPeriod): { start: Date; end: Date } {
  if (period === "monthly") {
    const y = date.getFullYear()
    const m = date.getMonth()
    return {
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 0, 23, 59, 59),
    }
  }
  const y = date.getFullYear()
  return {
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31, 23, 59, 59),
  }
}

interface BudgetProgress {
  spent: number
  percentage: number
  status: "good" | "warning" | "danger" | "over"
}

const STATUS_COLORS: Record<BudgetProgress["status"], { bar: string; text: string }> = {
  good: { bar: "bg-emerald-500", text: "text-emerald-600" },
  warning: { bar: "bg-amber-500", text: "text-amber-600" },
  danger: { bar: "bg-orange-500", text: "text-orange-600" },
  over: { bar: "bg-rose-500", text: "text-rose-600" },
}

interface FormData {
  name: string
  categoryIds: string[]
  amount: string
  period: BudgetPeriod
  startDate: string
}

const emptyForm: FormData = {
  name: "",
  categoryIds: [],
  amount: "",
  period: "monthly",
  startDate: new Date().toISOString().slice(0, 7) + "-01",
}

export default function Budgets() {
  const { budgets, load, add, update, remove } = useBudgetsStore()
  const { categories, load: loadCategories } = useCategoriesStore()
  const { transactions, load: loadTransactions } = useTransactionsStore()
  const { baseCurrency } = useSettingsStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null)
  const currentPeriod = useMemo(() => new Date(), [])

  useEffect(() => {
    load()
    loadCategories()
    loadTransactions()
  }, [load, loadCategories, loadTransactions])

  function computeProgress(budget: Budget): BudgetProgress {
    const { start, end } = getPeriodBounds(currentPeriod, budget.period)
    const spent = transactions
      .filter((t) => {
        if (t.type !== "expense") return false
        if (!budget.categoryIds.includes(t.categoryId)) return false
        const d = new Date(t.date)
        return d >= start && d <= end
      })
      .reduce((sum, t) => sum + t.baseAmount, 0)

    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
    const status: BudgetProgress["status"] =
      pct < 50 ? "good" : pct < 80 ? "warning" : pct < 100 ? "danger" : "over"

    return { spent, percentage: pct, status }
  }

  function getCategoryName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? "Unknown"
  }

  function openAdd() {
    setEditing(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  function openEdit(budget: Budget) {
    setEditing(budget)
    setForm({
      name: budget.name,
      categoryIds: [...budget.categoryIds],
      amount: String(budget.amount),
      period: budget.period,
      startDate: new Date(budget.startDate).toISOString().slice(0, 10),
    })
    setDialogOpen(true)
  }

  function toggleCategory(id: string) {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }))
  }

  async function handleSave() {
    const amount = parseFloat(form.amount) || 0
    if (!form.name.trim() || !amount || form.categoryIds.length === 0) return

    const data = {
      name: form.name.trim(),
      categoryIds: form.categoryIds,
      amount,
      period: form.period,
      startDate: new Date(form.startDate),
    }

    if (editing) {
      await update(editing.id, data)
    } else {
      await add(data)
    }

    setDialogOpen(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await remove(deleteTarget.id)
    setDeleteTarget(null)
  }

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === "expense"), [categories])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-muted-foreground">Set and track your budget goals.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add Budget
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-1">No budgets yet</p>
          <p className="text-sm">Create your first budget to start tracking.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((budget) => {
            const progress = computeProgress(budget)
            const colors = STATUS_COLORS[progress.status]
            return (
              <div key={budget.id} className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{budget.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {budget.categoryIds.map(getCategoryName).join(", ")} · {getPeriodLabel(new Date(budget.startDate), budget.period)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(budget)}>
                      <Pencil className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(budget)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className={`text-lg font-bold tabular-nums ${colors.text}`}>
                      {formatCurrency(progress.spent, baseCurrency)}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      of {formatCurrency(budget.amount, baseCurrency)}
                    </span>
                  </div>

                  <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                      style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progress.percentage.toFixed(0)}% used</span>
                    <span>
                      {progress.percentage >= 100
                        ? "Over budget!"
                        : `${formatCurrency(budget.amount - progress.spent, baseCurrency)} left`}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Budget" : "Add Budget"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="budget-name">Name</Label>
              <Input
                id="budget-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monthly Food"
              />
            </div>
            <div className="grid gap-2">
              <Label>Period</Label>
              <Select value={form.period} onValueChange={(v: string | null) => setForm({ ...form, period: (v ?? "monthly") as BudgetPeriod })} items={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="budget-amount">Amount</Label>
                <Input
                  id="budget-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="budget-date">Start Date</Label>
                <Input
                  id="budget-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Categories</Label>
              <div className="max-h-48 overflow-y-auto rounded-lg border p-3 space-y-1">
                {expenseCategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No expense categories available.</p>
                ) : (
                  expenseCategories.map((cat) => {
                    const CatIcon = ICON_MAP[cat.icon ?? ""]
                    return (
                      <label
                        key={cat.id}
                        className="flex items-center gap-2.5 py-1 cursor-pointer rounded hover:bg-muted/50 px-1"
                      >
                        <Checkbox
                          checked={form.categoryIds.includes(cat.id)}
                          onCheckedChange={() => toggleCategory(cat.id)}
                        />
                        {CatIcon ? (
                          <CatIcon className="size-4 shrink-0" style={{ color: cat.color }} />
                        ) : (
                          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                        )}
                        <span className="text-sm">{cat.name}</span>
                      </label>
                    )
                  })
                )}
              </div>
              {form.name.trim() && form.amount && form.categoryIds.length === 0 && (
                <p className="text-xs text-muted-foreground">Select at least one category.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.amount || form.categoryIds.length === 0}>
              {editing ? "Save" : "Add Budget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Budget</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
