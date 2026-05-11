import { useEffect, useState, useMemo, useCallback } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Budget, BudgetPeriod } from '@/types'
import { formatCurrency } from '@/lib/currency'
import { getBudgetStatus, type BudgetStatus } from '@/lib/budget'
import { BudgetDialog, type BudgetFormData } from '@/pages/budgets/BudgetDialog'
import { BudgetList } from '@/pages/budgets/BudgetList'
import { BudgetGauge } from '@/components/budgets/BudgetGauge'

function getPeriodLabel(date: Date, period: BudgetPeriod): string {
  if (period === 'monthly') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return date.getFullYear().toString()
}

function getPeriodBounds(date: Date, period: BudgetPeriod): { start: Date; end: Date } {
  if (period === 'monthly') {
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
  status: BudgetStatus
}

const emptyForm: BudgetFormData = {
  name: '',
  categoryIds: [],
  amount: '',
  period: 'monthly',
  startDate: new Date().toISOString().slice(0, 7) + '-01',
  subtractFromId: '',
}

export default function Budgets() {
  const budgets = useBudgetsStore((s) => s.budgets)
  const loading = useBudgetsStore((s) => s.loading)
  const load = useBudgetsStore((s) => s.load)
  const add = useBudgetsStore((s) => s.add)
  const update = useBudgetsStore((s) => s.update)
  const remove = useBudgetsStore((s) => s.remove)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const transactions = useTransactionsStore((s) => s.transactions)
  const loadTransactions = useTransactionsStore((s) => s.load)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)

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

  const computeProgress = useCallback(
    (budget: Budget): BudgetProgress => {
      const { start, end } = getPeriodBounds(currentPeriod, budget.period)
      const spent = transactions
        .filter((t) => {
          if (t.type !== 'expense') return false
          if (!t.categoryId || !budget.categoryIds.includes(t.categoryId)) return false
          const d = new Date(t.date)
          return d >= start && d <= end
        })
        .reduce((sum, t) => sum + t.baseAmount, 0)

      const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0
      const status = getBudgetStatus(pct)

      return { spent, percentage: pct, status }
    },
    [transactions, currentPeriod],
  )

  function getCategoryName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? 'Unknown'
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
      subtractFromId: '',
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
    try {
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
        if (form.subtractFromId) {
          const sourceBudget = budgets.find((b) => b.id === form.subtractFromId)
          if (sourceBudget && amount <= sourceBudget.amount) {
            const newSourceAmount = sourceBudget.amount - amount
            await update(sourceBudget.id, {
              name: sourceBudget.name,
              categoryIds: sourceBudget.categoryIds,
              amount: newSourceAmount,
              period: sourceBudget.period,
              startDate: sourceBudget.startDate,
            })
          }
        }
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

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  )

  const totalBudgetProgress = useMemo(() => {
    if (budgets.length === 0) return null
    let totalSpent = 0
    let totalBudget = 0
    for (const b of budgets) {
      const p = computeProgress(b)
      totalSpent += p.spent
      totalBudget += b.amount
    }
    const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    return { spent: totalSpent, total: totalBudget, percentage: pct }
  }, [budgets, computeProgress])

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

      {totalBudgetProgress && (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-6">
            <BudgetGauge
              percentage={totalBudgetProgress.percentage}
              spent={formatCurrency(totalBudgetProgress.spent, baseCurrency)}
              total={formatCurrency(totalBudgetProgress.total, baseCurrency)}
            />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Total Budget Usage</h2>
              <p className="text-sm text-muted-foreground">
                {totalBudgetProgress.percentage >= 100
                  ? `Over budget by ${formatCurrency(totalBudgetProgress.spent - totalBudgetProgress.total, baseCurrency)}`
                  : `${formatCurrency(totalBudgetProgress.total - totalBudgetProgress.spent, baseCurrency)} remaining across all budgets`}
              </p>
              <p className="text-xs text-muted-foreground">
                {budgets.length} budget{budgets.length !== 1 ? 's' : ''} tracked this period
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : budgets.length === 0 ? (
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
        existingBudgets={editing ? [] : budgets}
        formatAmount={(n) => formatCurrency(n, baseCurrency)}
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
            <DialogTitle>Delete Budget</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
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
