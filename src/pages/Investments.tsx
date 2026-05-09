import { useEffect, useState, useMemo } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import { useInvestmentPlansStore } from "@/stores/investmentPlansStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { InvestmentPlan, InvestmentType } from "@/types"
import {
  calculateProjection, calculateTotalProjection,
  formatInvestmentValue, INVESTMENT_TYPE_LABELS, INVESTMENT_TYPE_COLORS,
} from "@/lib/investments"

const INVESTMENT_TYPES: InvestmentType[] = ["fixed_income", "index_fund", "stock", "real_estate", "cash", "crypto", "other"]

interface FormData {
  name: string
  type: InvestmentType
  initialAmount: string
  monthlyContribution: string
  annualReturnRate: string
  notes: string
}

const emptyForm: FormData = {
  name: "",
  type: "index_fund",
  initialAmount: "",
  monthlyContribution: "",
  annualReturnRate: "",
  notes: "",
}

export default function Investments() {
  const { plans, load, add, update, remove } = useInvestmentPlansStore()
  const { baseCurrency } = useSettingsStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InvestmentPlan | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<InvestmentPlan | null>(null)
  const [horizonYears, setHorizonYears] = useState(20)

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(plan: InvestmentPlan) {
    setEditing(plan)
    setForm({
      name: plan.name,
      type: plan.type,
      initialAmount: String(plan.initialAmount),
      monthlyContribution: String(plan.monthlyContribution),
      annualReturnRate: String(plan.annualReturnRate),
      notes: plan.notes ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const data = {
      name: form.name.trim(),
      type: form.type,
      initialAmount: parseFloat(form.initialAmount) || 0,
      monthlyContribution: parseFloat(form.monthlyContribution) || 0,
      annualReturnRate: parseFloat(form.annualReturnRate) || 0,
      currency: baseCurrency,
      notes: form.notes.trim() || undefined,
    }
    if (!data.name) return
    if (editing) await update(editing.id, data)
    else await add(data)
    setDialogOpen(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await remove(deleteTarget.id)
    setDeleteTarget(null)
  }

  const totalProjection = useMemo(() => calculateTotalProjection(plans, horizonYears), [plans, horizonYears])
  const finalYear = totalProjection[totalProjection.length - 1]

  const planProjections = useMemo(() => {
    return plans.map((plan) => {
      const projection = calculateProjection(plan, horizonYears)
      return {
        plan,
        data: projection,
      }
    })
  }, [plans, horizonYears])

  const growthChartData = useMemo(() => {
    const labels = totalProjection.map((y) => `Y${y.year}`)
    const series: Record<string, (number | null)[]> = {}
    for (const { plan, data } of planProjections) {
      series[plan.name] = data.map((y) => y.totalValue)
    }
    // Build overlapping line chart data
    return totalProjection.map((_, i) => {
      const row: Record<string, number | string> = { label: labels[i] }
      for (const { plan, data } of planProjections) {
        row[plan.name] = data[i]?.totalValue ?? 0
      }
      return row
    })
  }, [planProjections, totalProjection])

  const allocationData = useMemo(() => {
    if (!finalYear) return []
    return plans.map((plan) => {
      const proj = calculateProjection(plan, horizonYears)
      const final = proj[proj.length - 1]
      return {
        name: plan.name,
        value: final.totalValue,
        color: INVESTMENT_TYPE_COLORS[plan.type],
      }
    })
  }, [plans, horizonYears, finalYear])

  const GROWTH_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Investments</h1>
          <p className="text-muted-foreground">Plan and project your investment growth over time.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="size-4" />
          Add Investment
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-1">No investment plans yet</p>
          <p className="text-sm">Add investments to see compound growth projections.</p>
        </div>
      ) : (
        <>
          {/* Horizon slider */}
          <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <Label className="text-sm shrink-0">Projection horizon:</Label>
            <input
              type="range"
              min={1}
              max={50}
              value={horizonYears}
              onChange={(e) => setHorizonYears(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-medium tabular-nums w-16 text-right">{horizonYears} years</span>
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Invested</p>
              <p className="text-2xl font-bold mt-1">{finalYear ? formatInvestmentValue(finalYear.principal, baseCurrency) : "$0"}</p>
            </div>
            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Returns</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{finalYear ? formatInvestmentValue(finalYear.returns, baseCurrency) : "$0"}</p>
            </div>
            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Final Portfolio Value</p>
              <p className="text-2xl font-bold mt-1">{finalYear ? formatInvestmentValue(finalYear.totalValue, baseCurrency) : "$0"}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="text-sm font-semibold mb-4">Investment Growth Over Time</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={growthChartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatInvestmentValue(v, baseCurrency)} />
                  <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }} formatter={(v: unknown) => formatInvestmentValue(v as number, baseCurrency)} />
                  {plans.map((plan, i) => (
                    <Line key={plan.id} type="monotone" dataKey={plan.name} stroke={GROWTH_COLORS[i % GROWTH_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <h2 className="text-sm font-semibold mb-4">Portfolio Allocation</h2>
              {allocationData.length > 0 && (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={allocationData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                      {allocationData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: "0.75rem", border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }} formatter={(v: unknown) => formatInvestmentValue(v as number, baseCurrency)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Principal vs Returns breakdown */}
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="text-sm font-semibold mb-4">Principal vs Returns (Year by Year)</h2>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right">Total Value</TableHead>
                    <TableHead className="text-right">Return %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalProjection.map((year) => (
                    <TableRow key={year.year}>
                      <TableCell className="font-medium">{year.year}</TableCell>
                      <TableCell className="text-right">{formatInvestmentValue(year.principal, baseCurrency)}</TableCell>
                      <TableCell className="text-right text-emerald-600">{formatInvestmentValue(year.returns, baseCurrency)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatInvestmentValue(year.totalValue, baseCurrency)}</TableCell>
                      <TableCell className="text-right">
                        {year.principal > 0 ? ((year.returns / year.principal) * 100).toFixed(1) : "0.0"}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Investment Plans List */}
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Initial</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Return/yr</TableHead>
                  <TableHead className="text-right">After {horizonYears}y</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => {
                  const proj = calculateProjection(plan, horizonYears)
                  const final = proj[proj.length - 1]
                  return (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" style={{ borderColor: INVESTMENT_TYPE_COLORS[plan.type] }}>
                          {INVESTMENT_TYPE_LABELS[plan.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatInvestmentValue(plan.initialAmount, baseCurrency)}</TableCell>
                      <TableCell className="text-right">{formatInvestmentValue(plan.monthlyContribution, baseCurrency)}</TableCell>
                      <TableCell className="text-right">{plan.annualReturnRate}%</TableCell>
                      <TableCell className="text-right font-semibold">
                        {final && formatInvestmentValue(final.totalValue, baseCurrency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon-xs" onClick={() => openEdit(plan)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(plan)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Investment" : "Add Investment"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="inv-name">Name</Label>
              <Input id="inv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. S&P 500 Index Fund" />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: string | null) => setForm({ ...form, type: (v ?? "index_fund") as InvestmentType })} items={INVESTMENT_TYPES.map((t) => ({ value: t, label: INVESTMENT_TYPE_LABELS[t] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVESTMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{INVESTMENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="inv-initial">Initial Amount</Label>
                <Input id="inv-initial" type="number" step="0.01" min="0" value={form.initialAmount} onChange={(e) => setForm({ ...form, initialAmount: e.target.value })} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-monthly">Monthly Contribution</Label>
                <Input id="inv-monthly" type="number" step="0.01" min="0" value={form.monthlyContribution} onChange={(e) => setForm({ ...form, monthlyContribution: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-return">Annual Return Rate (%)</Label>
              <Input id="inv-return" type="number" step="0.1" value={form.annualReturnRate} onChange={(e) => setForm({ ...form, annualReturnRate: e.target.value })} placeholder="e.g. 7" />
              <p className="text-xs text-muted-foreground">
                Typical: Fixed Income 2-5%, Index Funds 7-10%, Stocks 8-12%, Crypto 20%+
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-notes">Notes (optional)</Label>
              <Input id="inv-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Vanguard VOO" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? "Save" : "Add Investment"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Investment</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
