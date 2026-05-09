import { useEffect, useState, useMemo } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import { ChartTooltip } from "@/components/ChartTooltip"
import { useInvestmentPlansStore } from "@/stores/investmentPlansStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { InvestmentPlan } from "@/types"
import {
  calculateProjection, calculateTotalProjection,
  formatInvestmentValue, INVESTMENT_TYPE_COLORS,
} from "@/lib/investments"
import { InvestmentDialog, type InvestmentFormData } from "@/pages/investments/InvestmentDialog"
import { InvestmentList } from "@/pages/investments/InvestmentList"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const emptyForm: InvestmentFormData = {
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
  const [form, setForm] = useState<InvestmentFormData>(emptyForm)
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
                  <ChartTooltip formatter={(v: number) => formatInvestmentValue(v, baseCurrency)} />
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
                  <ChartTooltip formatter={(v: number) => formatInvestmentValue(v, baseCurrency)} />
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
          <InvestmentList
            plans={plans}
            horizonYears={horizonYears}
            baseCurrency={baseCurrency}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        </>
      )}

      {/* Add/Edit Dialog */}
      <InvestmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
      />

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
