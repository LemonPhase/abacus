import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { BarChart3, Loader2, TrendingDown, TrendingUp, Wallet, PiggyBank } from 'lucide-react'
import { getBudgetColors, getBudgetStatus } from '@/lib/budget'
import { convertCurrency } from '@/services/exchange'
import {
  fetchBudgetSpending,
  fetchCategoryBreakdown,
  fetchMonthlySeries,
  type BudgetSpendingRow,
  type CategoryBreakdownRow,
  type MonthlyBucket,
} from '@/services/reports'
import { subscribeToTable } from '@/supabase/realtime'
import { Button } from '@/components/ui/button'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
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

/** Local YYYY-MM-DD (never toISOString — that shifts to UTC). */
function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function Dashboard() {
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const loadingAccounts = useAccountsStore((s) => s.loading)
  const transactions = useTransactionsStore((s) => s.transactions)
  const loadTxn = useTransactionsStore((s) => s.load)
  const loadingTxn = useTransactionsStore((s) => s.loading)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const navigate = useNavigate()

  // Income/expense/category/budget aggregates come from DB RPCs
  // (20260918000002_report_aggregates.sql) so totals cover the full dataset
  // under RLS instead of whatever subset the client had loaded.
  const [monthly, setMonthly] = useState<MonthlyBucket[]>([])
  const [categoryRows, setCategoryRows] = useState<CategoryBreakdownRow[]>([])
  const [budgetRows, setBudgetRows] = useState<BudgetSpendingRow[]>([])
  const [unconvertedTxns, setUnconvertedTxns] = useState(0)
  const [aggregatesLoading, setAggregatesLoading] = useState(true)
  const [aggregatesError, setAggregatesError] = useState<string | null>(null)
  // Only the newest aggregate load may publish (rapid baseCurrency changes).
  const loadSeqRef = useRef(0)

  useEffect(() => {
    async function loadAggregates() {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      const seq = ++loadSeqRef.current
      try {
        const [monthlyRows, categories, budgets] = await Promise.all([
          fetchMonthlySeries(localDateString(from), localDateString(monthEnd), baseCurrency),
          fetchCategoryBreakdown(
            localDateString(monthStart),
            localDateString(monthEnd),
            baseCurrency,
          ),
          fetchBudgetSpending(localDateString(now), baseCurrency),
        ])
        if (seq !== loadSeqRef.current) return
        setMonthly(monthlyRows)
        setCategoryRows(categories)
        setBudgetRows(budgets)
        setUnconvertedTxns(monthlyRows.reduce((sum, m) => sum + m.unconverted, 0))
        setAggregatesError(null)
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        setAggregatesError(e instanceof Error ? e.message : 'Failed to load report data')
      } finally {
        if (seq === loadSeqRef.current) setAggregatesLoading(false)
      }
    }

    void loadAggregates()
    // Keep the aggregate charts live with the transactions table.
    return subscribeToTable('transactions', () => {
      void loadAggregates()
    })
  }, [baseCurrency])

  useEffect(() => {
    loadAccounts()
    // Only the recent list is needed locally (page 1 of the date-desc order);
    // the charts aggregate in the database.
    loadTxn({ limit: 50 })
  }, [loadAccounts, loadTxn])

  // Account balances are denominated in each account's currency; convert each
  // to the reporting currency (current quote — net worth is a current value).
  // Accounts whose rate is unavailable are excluded and counted, never summed 1:1.
  const [netWorth, setNetWorth] = useState<number | null>(null)
  const [unconvertedAccounts, setUnconvertedAccounts] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function convertBalances() {
      let total = 0
      let failed = 0
      for (const a of accounts) {
        const converted = await convertCurrency(a.balance, a.currency, baseCurrency)
        if (converted === null) failed++
        else total += converted
      }
      if (!cancelled) {
        setNetWorth(total)
        setUnconvertedAccounts(failed)
      }
    }
    convertBalances()
    return () => {
      cancelled = true
    }
  }, [accounts, baseCurrency])

  const monthlyData = useMemo(() => {
    const now = new Date()
    const byMonth = new Map(monthly.map((m) => [m.month, m]))
    const months: { label: string; income: number; expense: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const row = byMonth.get(localDateString(d))
      months.push({
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        income: row?.income ?? 0,
        expense: row?.expense ?? 0,
      })
    }
    return months
  }, [monthly])

  const categorySpending = useMemo(() => {
    return categoryRows
      .filter((c) => c.expense > 0)
      .map((c) => ({ name: c.name ?? 'Other', value: c.expense, icon: c.icon }))
      .sort((a, b) => b.value - a.value)
  }, [categoryRows])

  const currentMonthIncome = useMemo(() => {
    if (monthlyData.length === 0) return 0
    return monthlyData[monthlyData.length - 1].income
  }, [monthlyData])

  const currentMonthExpense = useMemo(() => {
    if (monthlyData.length === 0) return 0
    return monthlyData[monthlyData.length - 1].expense
  }, [monthlyData])

  const budgetRemaining = useMemo(() => {
    let total = 0
    for (const b of budgetRows) {
      if (b.period !== 'monthly') continue
      total += b.amount - b.spent
    }
    return total
  }, [budgetRows])

  const aggregateBudgetProgress = useMemo(() => {
    if (budgetRows.length === 0) return null
    let totalSpent = 0
    let totalBudget = 0
    for (const b of budgetRows) {
      totalBudget += b.amount
      totalSpent += b.spent
    }
    const pct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    return { spent: totalSpent, total: totalBudget, percentage: pct }
  }, [budgetRows])

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions])
  const isLoading = loadingAccounts || loadingTxn || aggregatesLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your financial overview at a glance.</p>
        </div>
        {/* Reports are absorbed into Home on mobile — desktop has the sidebar link. */}
        <Link
          to="/app/reports"
          className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <BarChart3 className="size-4" />
          Full reports
        </Link>
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
              value={netWorth === null ? '…' : formatCurrency(netWorth, baseCurrency)}
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

          {aggregatesError && <p className="text-sm text-cinnabar">{aggregatesError}</p>}

          {(unconvertedAccounts > 0 || unconvertedTxns > 0) && (
            <p className="text-xs text-muted-foreground">
              {unconvertedAccounts > 0 &&
                `${unconvertedAccounts} account${unconvertedAccounts > 1 ? 's' : ''} excluded from Net Worth (exchange rate unavailable). `}
              {unconvertedTxns > 0 &&
                `${unconvertedTxns} transaction${unconvertedTxns > 1 ? 's' : ''} not yet converted to ${baseCurrency} ${unconvertedTxns > 1 ? 'are' : 'is'} excluded from totals; edit them to convert.`}
            </p>
          )}

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
                    const CatIcon = ICON_MAP[cat.icon ?? '']
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
                          {tx.description || (tx.type === 'transfer' ? 'Transfer' : 'Transaction')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {accounts.find((a) => a.id === tx.accountId)?.name ?? 'Unknown'}
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
                        {formatCurrency(Math.abs(tx.amount), tx.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-card p-5 border border-border/30">
              <h2 className="text-sm font-semibold tracking-tight mb-4">Active Budgets</h2>
              {budgetRows.length === 0 ? (
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
                    {budgetRows.slice(0, 4).map((b) => {
                      const rawPct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0
                      const colors = getBudgetColors(getBudgetStatus(rawPct))
                      const pct = Math.min(rawPct, 100)
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
