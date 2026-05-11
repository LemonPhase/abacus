import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { BudgetGauge } from '@/components/budgets/BudgetGauge'
import { Loader2, TrendingDown, TrendingUp, Wallet, PiggyBank } from 'lucide-react'
import { getBudgetColors, getBudgetStatus } from '@/lib/budget'
import { Button } from '@/components/ui/button'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ICON_MAP } from '@/lib/icons'
import { formatCurrency } from '@/lib/currency'
import { CHART_COLORS, INCOME_COLOR, EXPENSE_COLOR } from '@/lib/chartColors'

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = 'default',
}: {
  title: string
  value: string
  icon: React.ElementType
  trend?: 'up' | 'down'
  variant?: 'default' | 'primary'
}) {
  const isPrimary = variant === 'primary'
  return (
    <div
      className={`group flex flex-col gap-3 rounded-xl p-5 transition-shadow duration-200 ${
        isPrimary
          ? 'bg-primary text-primary-foreground border border-primary/20'
          : 'bg-card border border-border/30 hover:border-primary/10'
      }`}
    >
      <div className="flex items-center justify-between">
        <p
          className={`text-sm font-medium tracking-wide uppercase ${
            isPrimary ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          {title}
        </p>
        <div
          className={`flex size-8 items-center justify-center rounded-lg ${
            isPrimary ? 'bg-primary-foreground/10' : 'bg-muted'
          }`}
        >
          <Icon
            className={`size-4 ${isPrimary ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}
          />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend === 'up' ? 'text-jade' : 'text-cinnabar'}`}
          >
            {trend === 'up' ? (
              <TrendingUp className="size-3" />
            ) : (
              <TrendingDown className="size-3" />
            )}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const loadingAccounts = useAccountsStore((s) => s.loading)
  const transactions = useTransactionsStore((s) => s.transactions)
  const loadTxn = useTransactionsStore((s) => s.load)
  const loadingTxn = useTransactionsStore((s) => s.loading)
  const budgets = useBudgetsStore((s) => s.budgets)
  const loadBudgets = useBudgetsStore((s) => s.load)
  const loadingBudgets = useBudgetsStore((s) => s.loading)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const loadingCategories = useCategoriesStore((s) => s.loading)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const navigate = useNavigate()

  useEffect(() => {
    loadAccounts()
    loadTxn()
    loadBudgets()
    loadCategories()
  }, [loadAccounts, loadTxn, loadBudgets, loadCategories])

  const netWorth = useMemo(() => accounts.reduce((sum, a) => sum + a.balance, 0), [accounts])

  const monthlyData = useMemo(() => {
    const now = new Date()
    const months: { label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        income: 0,
        expense: 0,
      })
    }
    for (const t of transactions) {
      const d = new Date(t.date)
      const idx = months.findIndex((m) => {
        const md = new Date(d.getFullYear(), d.getMonth(), 1)
        const nowd = new Date(now.getFullYear(), now.getMonth() - (5 - months.indexOf(m)), 1)
        return md.getTime() === nowd.getTime()
      })
      if (idx === -1) continue
      if (t.type === 'income') months[idx].income += t.baseAmount
      if (t.type === 'expense') months[idx].expense += t.baseAmount
    }
    return months
  }, [transactions])

  const categorySpending = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      const d = new Date(t.date)
      if (d < start || d > end) continue
      const name = categories.find((c) => c.id === t.categoryId)?.name ?? 'Other'
      map.set(name, (map.get(name) ?? 0) + t.baseAmount)
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [transactions, categories])

  const currentMonthIncome = useMemo(() => {
    if (monthlyData.length === 0) return 0
    return monthlyData[monthlyData.length - 1].income
  }, [monthlyData])

  const currentMonthExpense = useMemo(() => {
    if (monthlyData.length === 0) return 0
    return monthlyData[monthlyData.length - 1].expense
  }, [monthlyData])

  const budgetRemaining = useMemo(() => {
    const now = new Date()
    let total = 0
    for (const b of budgets) {
      if (b.period !== 'monthly') continue
      const s = new Date(b.startDate)
      if (s.getFullYear() !== now.getFullYear() || s.getMonth() !== now.getMonth()) continue
      let spent = 0
      for (const t of transactions) {
        if (t.type !== 'expense') continue
        if (!t.categoryId) continue
        if (!b.categoryIds.includes(t.categoryId)) continue
        const d = new Date(t.date)
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          spent += t.baseAmount
        }
      }
      total += b.amount - spent
    }
    return total
  }, [budgets, transactions])

  const aggregateBudgetProgress = useMemo(() => {
    if (budgets.length === 0) return null
    const now = new Date()
    let totalSpent = 0
    let totalBudget = 0
    for (const b of budgets) {
      totalBudget += b.amount
      for (const t of transactions) {
        if (t.type !== 'expense') continue
        if (!t.categoryId) continue
        if (!b.categoryIds.includes(t.categoryId)) continue
        const d = new Date(t.date)
        if (
          b.period === 'monthly'
            ? d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            : d.getFullYear() === now.getFullYear()
        ) {
          totalSpent += t.baseAmount
        }
      }
    }
    const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    return { spent: totalSpent, total: totalBudget, percentage: pct }
  }, [budgets, transactions])

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions])
  const isLoading = loadingAccounts || loadingTxn || loadingBudgets || loadingCategories

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your financial overview at a glance.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Net Worth"
              value={formatCurrency(netWorth, baseCurrency)}
              icon={Wallet}
              variant="primary"
            />
            <StatCard
              title="Income"
              value={formatCurrency(currentMonthIncome, baseCurrency)}
              icon={TrendingUp}
              trend="up"
            />
            <StatCard
              title="Expenses"
              value={formatCurrency(currentMonthExpense, baseCurrency)}
              icon={TrendingDown}
              trend="down"
            />
            <StatCard
              title="Budget Left"
              value={formatCurrency(budgetRemaining, baseCurrency)}
              icon={PiggyBank}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-card p-5 border border-border/30">
              <h2 className="text-sm font-semibold tracking-tight mb-4">Income vs Expenses</h2>
              {monthlyData.every((m) => m.income === 0 && m.expense === 0) ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <p className="text-sm">No transaction data yet</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/transactions')}>
                    Add Transaction
                  </Button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <ChartTooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                    <Bar dataKey="income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} name="Income" />
                    <Bar
                      dataKey="expense"
                      fill={EXPENSE_COLOR}
                      radius={[4, 4, 0, 0]}
                      name="Expense"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl bg-card p-5 border border-border/30">
              <h2 className="text-sm font-semibold tracking-tight mb-4">Spending by Category</h2>
              {categorySpending.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                  <p className="text-sm">No spending data this month</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/transactions')}>
                    Add Transaction
                  </Button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={categorySpending}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categorySpending.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              {categorySpending.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                  {categorySpending.slice(0, 6).map((cat, i) => {
                    const CatIcon =
                      ICON_MAP[categories.find((c) => c.name === cat.name)?.icon ?? '']
                    return (
                      <div
                        key={cat.name}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        {CatIcon ? (
                          <CatIcon
                            className="size-3.5 shrink-0"
                            style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        ) : (
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        )}
                        {cat.name}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-card p-5 border border-border/30">
              <h2 className="text-sm font-semibold tracking-tight mb-3">Recent Transactions</h2>
              {recentTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
                  <p className="text-sm">No transactions yet</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/transactions')}>
                    Add Transaction
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between py-1.5 border-b border-muted last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {tx.description ||
                            (tx.type === 'transfer'
                              ? 'Transfer'
                              : categories.find((c) => c.id === tx.categoryId)?.name ||
                                'Transaction')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {accounts.find((a) => a.id === tx.accountId)?.name}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold tabular-nums shrink-0 ${tx.type === 'income' || (tx.type === 'transfer' && tx.amount > 0) ? 'text-jade' : tx.type === 'expense' || (tx.type === 'transfer' && tx.amount < 0) ? 'text-cinnabar' : ''}`}
                      >
                        {tx.type === 'income' || (tx.type === 'transfer' && tx.amount > 0)
                          ? '+'
                          : tx.type === 'expense' || (tx.type === 'transfer' && tx.amount < 0)
                            ? '−'
                            : '↔'}
                        {formatCurrency(Math.abs(tx.baseAmount), baseCurrency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-card p-5 border border-border/30">
              <h2 className="text-sm font-semibold tracking-tight mb-4">Active Budgets</h2>
              {budgets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
                  <p className="text-sm">No budgets yet</p>
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/budgets')}>
                    Create Budget
                  </Button>
                </div>
              ) : (
                <>
                  {aggregateBudgetProgress && (
                    <div className="flex items-center justify-center mb-4">
                      <BudgetGauge
                        percentage={aggregateBudgetProgress.percentage}
                        spent={formatCurrency(aggregateBudgetProgress.spent, baseCurrency)}
                        total={formatCurrency(aggregateBudgetProgress.total, baseCurrency)}
                        size={140}
                      />
                    </div>
                  )}
                  <div className="space-y-3">
                    {budgets.slice(0, 4).map((b) => {
                      const now = new Date()
                      let spent = 0
                      for (const t of transactions) {
                        if (t.type !== 'expense') continue
                        if (!t.categoryId) continue
                        if (!b.categoryIds.includes(t.categoryId)) continue
                        const d = new Date(t.date)
                        if (
                          b.period === 'monthly'
                            ? d.getMonth() === now.getMonth() &&
                              d.getFullYear() === now.getFullYear()
                            : d.getFullYear() === now.getFullYear()
                        ) {
                          spent += t.baseAmount
                        }
                      }
                      const pct = b.amount > 0 ? Math.min((spent / b.amount) * 100, 100) : 0
                      const colors = getBudgetColors(getBudgetStatus(pct))
                      return (
                        <div key={b.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{b.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${colors.bar}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
