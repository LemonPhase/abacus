import { useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ICON_MAP } from '@/lib/icons'
import { formatCurrency } from '@/lib/currency'
import {
  CHART_COLORS,
  INCOME_COLOR,
  EXPENSE_COLOR,
  DEFAULT_CATEGORY_COLOR,
} from '@/lib/chartColors'

export default function Reports() {
  const loadAccounts = useAccountsStore((s) => s.load)
  const loadingAccounts = useAccountsStore((s) => s.loading)
  const transactions = useTransactionsStore((s) => s.transactions)
  const loadTxn = useTransactionsStore((s) => s.load)
  const loadingTxn = useTransactionsStore((s) => s.loading)
  const categories = useCategoriesStore((s) => s.categories)
  const loadCategories = useCategoriesStore((s) => s.load)
  const loadingCategories = useCategoriesStore((s) => s.loading)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)

  const isLoading = loadingAccounts || loadingTxn || loadingCategories
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
  )
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))

  useEffect(() => {
    loadAccounts()
    loadTxn()
    loadCategories()
  }, [loadAccounts, loadTxn, loadCategories])

  const filteredTxn = useMemo(() => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo + 'T23:59:59')
    return transactions.filter((t) => {
      const d = new Date(t.date)
      return d >= from && d <= to
    })
  }, [transactions, dateFrom, dateTo])

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of filteredTxn) {
      if (t.type === 'income') income += t.baseAmount
      if (t.type === 'expense') expense += t.baseAmount
    }
    return { income, expense, net: income - expense }
  }, [filteredTxn])

  const categoryBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; icon: string | null; income: number; expense: number }
    >()
    for (const t of filteredTxn) {
      const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined
      const key = cat?.id ?? t.categoryId ?? '__uncategorized__'
      if (!map.has(key)) {
        map.set(key, {
          name: cat?.name ?? 'Unknown',
          color: cat?.color ?? DEFAULT_CATEGORY_COLOR,
          icon: cat?.icon ?? null,
          income: 0,
          expense: 0,
        })
      }
      const entry = map.get(key)!
      if (t.type === 'income') entry.income += t.baseAmount
      if (t.type === 'expense') entry.expense += t.baseAmount
    }
    return Array.from(map.values()).sort((a, b) => b.expense + b.income - (a.expense + a.income))
  }, [filteredTxn, categoryMap])

  const netWorthTimeline = useMemo(() => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo + 'T23:59:59')
    const months: { label: string; netWorth: number }[] = []
    let current = new Date(from.getFullYear(), from.getMonth(), 1)
    while (current <= to) {
      months.push({
        label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        netWorth: 0,
      })
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }

    // Simple net worth: cumulative income - expense
    let running = 0
    let monthIdx = 0
    const sorted = [...filteredTxn].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    for (const t of sorted) {
      const d = new Date(t.date)
      while (monthIdx < months.length) {
        const mStart = new Date(from.getFullYear(), from.getMonth() + monthIdx, 1)
        const mEnd = new Date(from.getFullYear(), from.getMonth() + monthIdx + 1, 0)
        if (d >= mStart && d <= mEnd) break
        months[monthIdx].netWorth = running
        monthIdx++
      }
      if (t.type === 'income') running += t.baseAmount
      if (t.type === 'expense') running -= t.baseAmount
    }
    while (monthIdx < months.length) {
      months[monthIdx].netWorth = running
      monthIdx++
    }
    return months
  }, [filteredTxn, dateFrom, dateTo])

  const incomeVsExpense = useMemo(() => {
    const from = new Date(dateFrom)
    const to = new Date(dateTo + 'T23:59:59')
    const months: { label: string; income: number; expense: number }[] = []
    let current = new Date(from.getFullYear(), from.getMonth(), 1)
    while (current <= to) {
      months.push({
        label: current.toLocaleDateString('en-US', { month: 'short' }),
        income: 0,
        expense: 0,
      })
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }
    for (const t of filteredTxn) {
      const d = new Date(t.date)
      const idx = months.findIndex((_m, i) => {
        const ms = new Date(from.getFullYear(), from.getMonth() + i, 1)
        return d >= ms && d < new Date(from.getFullYear(), from.getMonth() + i + 1, 1)
      })
      if (idx === -1) continue
      if (t.type === 'income') months[idx].income += t.baseAmount
      if (t.type === 'expense') months[idx].expense += t.baseAmount
    }
    return months
  }, [filteredTxn, dateFrom, dateTo])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Analyze your financial data over time.</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="h-8 w-36"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="h-8 w-36"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {filteredTxn.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-1">No data for this period</p>
              <p className="text-sm">
                Try adjusting the date range or add some transactions first.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Income</p>
                  <p className="text-2xl font-bold text-jade mt-1">
                    {formatCurrency(summary.income, baseCurrency)}
                  </p>
                </div>
                <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Expenses</p>
                  <p className="text-2xl font-bold text-cinnabar mt-1">
                    {formatCurrency(summary.expense, baseCurrency)}
                  </p>
                </div>
                <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Net</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${summary.net >= 0 ? 'text-jade' : 'text-cinnabar'}`}
                  >
                    {formatCurrency(summary.net, baseCurrency)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="text-sm font-semibold mb-4">Income vs Expenses</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={incomeVsExpense}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ChartTooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                      <Bar
                        dataKey="income"
                        fill={INCOME_COLOR}
                        radius={[4, 4, 0, 0]}
                        name="Income"
                      />
                      <Bar
                        dataKey="expense"
                        fill={EXPENSE_COLOR}
                        radius={[4, 4, 0, 0]}
                        name="Expense"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                  <h2 className="text-sm font-semibold mb-4">Net Worth Over Time</h2>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={netWorthTimeline}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <ChartTooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                      <Line
                        type="monotone"
                        dataKey="netWorth"
                        stroke={CHART_COLORS[2]}
                        strokeWidth={2}
                        dot={false}
                        name="Net Worth"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <h2 className="text-sm font-semibold mb-4">Category Breakdown</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Expenses</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryBreakdown.map((cat) => (
                      <TableRow key={cat.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const IconComp = cat.icon ? ICON_MAP[cat.icon] : null
                              return IconComp ? (
                                <IconComp
                                  className="size-4 shrink-0"
                                  style={{ color: cat.color }}
                                />
                              ) : (
                                <span
                                  className="size-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cat.color }}
                                />
                              )
                            })()}
                            {cat.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-jade">
                          {formatCurrency(cat.income, baseCurrency)}
                        </TableCell>
                        <TableCell className="text-right text-cinnabar">
                          {formatCurrency(cat.expense, baseCurrency)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium ${cat.income - cat.expense >= 0 ? 'text-jade' : 'text-cinnabar'}`}
                        >
                          {formatCurrency(cat.income - cat.expense, baseCurrency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
