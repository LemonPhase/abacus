import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  fetchCategoryBreakdown,
  fetchMonthlySeries,
  fetchReportSummary,
  type CategoryBreakdownRow,
  type MonthlyBucket,
  type ReportSummary,
} from '@/services/reports'
import { subscribeToTable } from '@/supabase/realtime'
import { useSettingsStore } from '@/stores/settingsStore'
import { ICON_MAP } from '@/lib/icons'
import { formatCurrency } from '@/lib/currency'
import {
  CHART_COLORS,
  INCOME_COLOR,
  EXPENSE_COLOR,
  DEFAULT_CATEGORY_COLOR,
} from '@/lib/chartColors'

/** Local YYYY-MM-DD (never toISOString — that shifts to UTC). */
function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Month skeleton (first-of-month keys) covering [from, to], inclusive. */
function monthSkeleton(from: Date, to: Date): Map<string, MonthBucketUI> {
  const months = new Map<string, MonthBucketUI>()
  const current = new Date(from.getFullYear(), from.getMonth(), 1)
  while (current <= to) {
    months.set(localDateString(current), {
      label: current.toLocaleDateString('en-US', { month: 'short' }),
      yearLabel: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income: 0,
      expense: 0,
      netWorth: 0,
    })
    current.setMonth(current.getMonth() + 1)
  }
  return months
}

interface MonthBucketUI {
  label: string
  yearLabel: string
  income: number
  expense: number
  netWorth: number
}

export default function Reports() {
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(
    new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
  )
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))

  const [summary, setSummary] = useState<ReportSummary>({
    income: 0,
    expense: 0,
    unconverted: 0,
    total: 0,
  })
  const [monthly, setMonthly] = useState<MonthlyBucket[]>([])
  const [categoryRows, setCategoryRows] = useState<CategoryBreakdownRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Only the newest report load may publish (rapid date-range changes).
  const loadSeqRef = useRef(0)

  useEffect(() => {
    async function loadReport() {
      const seq = ++loadSeqRef.current
      try {
        const [s, m, c] = await Promise.all([
          fetchReportSummary(dateFrom, dateTo, baseCurrency),
          fetchMonthlySeries(dateFrom, dateTo, baseCurrency),
          fetchCategoryBreakdown(dateFrom, dateTo, baseCurrency),
        ])
        if (seq !== loadSeqRef.current) return
        setSummary(s)
        setMonthly(m)
        setCategoryRows(c)
        setError(null)
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load report data')
      } finally {
        if (seq === loadSeqRef.current) setLoading(false)
      }
    }

    void loadReport()
    // Keep the report live with the transactions table.
    return subscribeToTable('transactions', () => {
      void loadReport()
    })
  }, [dateFrom, dateTo, baseCurrency])

  const summaryNet = summary.income - summary.expense

  const unconvertedCount = summary.unconverted

  const incomeVsExpense = useMemo(() => {
    const skeleton = monthSkeleton(new Date(dateFrom), new Date(dateTo + 'T23:59:59'))
    for (const m of monthly) {
      const entry = skeleton.get(m.month)
      if (entry) {
        entry.income = m.income
        entry.expense = m.expense
      }
    }
    return Array.from(skeleton.values())
  }, [monthly, dateFrom, dateTo])

  const netWorthTimeline = useMemo(() => {
    const skeleton = monthSkeleton(new Date(dateFrom), new Date(dateTo + 'T23:59:59'))
    const byMonth = new Map(monthly.map((m) => [m.month, m]))
    let running = 0
    return Array.from(skeleton.entries()).map(([key, v]) => {
      const row = byMonth.get(key)
      running += row ? row.income - row.expense : 0
      return { label: v.yearLabel, netWorth: running }
    })
  }, [monthly, dateFrom, dateTo])

  const categoryBreakdown = useMemo(() => {
    return categoryRows
      .map((c) => ({
        name: c.name ?? 'Unknown',
        color: c.color ?? DEFAULT_CATEGORY_COLOR,
        icon: c.icon,
        income: c.income,
        expense: c.expense,
      }))
      .sort((a, b) => b.expense + b.income - (a.expense + a.income))
  }, [categoryRows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Analyze your financial data over time.</p>
      </div>

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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-cinnabar">{error}</p>
      ) : (
        <>
          {unconvertedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {unconvertedCount} transaction{unconvertedCount > 1 ? 's' : ''} not yet converted to{' '}
              {baseCurrency} {unconvertedCount > 1 ? 'are' : 'is'} excluded from these totals; edit
              them to convert.
            </p>
          )}

          {summary.total === 0 ? (
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
                    className={`text-2xl font-bold mt-1 ${summaryNet >= 0 ? 'text-jade' : 'text-cinnabar'}`}
                  >
                    {formatCurrency(summaryNet, baseCurrency)}
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
