import { useEffect, useState, useMemo } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useBudgetsStore } from "@/stores/budgetsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { Budget, BudgetPeriod } from "@/types"
import { BudgetDialog, type BudgetFormData } from "@/pages/budgets/BudgetDialog"
import { BudgetList } from "@/pages/budgets/BudgetList"



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

const emptyForm: BudgetFormData = {
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
  const [form, setForm] = useState<BudgetFormData>(emptyForm)
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
        if (!t.categoryId || !budget.categoryIds.includes(t.categoryId)) return false
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
        <BudgetList
          budgets={budgets}
          baseCurrency={baseCurrency}
          getPeriodLabel={getPeriodLabel}
          getCategoryName={getCategoryName}
          computeProgress={computeProgress}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      {/* Add/Edit Dialog */}
      <BudgetDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onToggleCategory={toggleCategory}
        onSave={handleSave}
        expenseCategories={expenseCategories}
      />

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
