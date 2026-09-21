import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/currency'
import type { ReconcileResult } from '@/lib/statement'
import type { Account, Category, ExtractedStatement, ImportReviewRow, ReviewFlag } from '@/types'
import type { RowGroup } from '@/pages/StatementImport'

const NONE = '__none__'

const FLAG_LABELS: Record<ReviewFlag, string> = {
  pending: 'Pending',
  duplicate: 'Duplicate',
  lowConfidence: 'Low confidence',
  uncategorized: 'Needs category',
}

interface ReviewStepProps {
  statement: ExtractedStatement
  groups: RowGroup[]
  accounts: Account[]
  categories: Category[]
  sourceAccountId: string
  sourceAccountCurrency: string
  reconcile: ReconcileResult | null
  truncated?: boolean
  skippedCount?: number
  confirming?: boolean
  confirmError?: string | null
  confirmDisabled: boolean
  onUpdateRow: (id: string, patch: Partial<ImportReviewRow>) => void
  onToggleGroup: (key: string, included: boolean) => void
  onSetRowCategory: (row: ImportReviewRow, categoryId: string) => void
  onApplyCategoryToGroup: (key: string, categoryId: string) => void
  onSetCounterpart: (rowId: string, accountId: string) => void
  onConfirm: () => void
  onDiscard: () => void
  onBack: () => void
}

function FlagsBadges({ flags }: { flags: ReviewFlag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Badge key={f} variant={f === 'uncategorized' ? 'destructive' : 'secondary'}>
          {FLAG_LABELS[f]}
        </Badge>
      ))}
    </div>
  )
}

export function ReviewStep({
  statement,
  groups,
  accounts,
  categories,
  sourceAccountId,
  sourceAccountCurrency,
  reconcile,
  truncated = false,
  skippedCount = 0,
  confirming = false,
  confirmError = null,
  confirmDisabled,
  onUpdateRow,
  onToggleGroup,
  onSetRowCategory,
  onApplyCategoryToGroup,
  onSetCounterpart,
  onConfirm,
  onDiscard,
  onBack,
}: ReviewStepProps) {
  const currency = statement.currency ?? sourceAccountCurrency
  const currencyMismatch =
    statement.currency !== null && statement.currency !== sourceAccountCurrency
  const balancesKnown = statement.openingBalance !== null && statement.closingBalance !== null
  const counterpartOptions = accounts.filter(
    (a) => a.currency === currency && a.id !== sourceAccountId,
  )
  const includedCount = groups
    .flatMap((g) => g.rows)
    .filter((r) => r.included)
    .reduce((n, r) => n + (r.type === 'transfer' ? 2 : 1), 0)

  function updateExtraction(row: ImportReviewRow, patch: Partial<ImportReviewRow['extraction']>) {
    onUpdateRow(row.id, { extraction: { ...row.extraction, ...patch } })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Statement</h1>
          <p className="text-muted-foreground">
            {statement.bankName ? `${statement.bankName} · ` : ''}
            {statement.accountHint ? `${statement.accountHint} · ` : ''}
            {statement.periodStart ? `${statement.periodStart} to ${statement.periodEnd} · ` : ''}
            {currency}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={onBack}>
            Back to Transactions
          </Button>
          <Button variant="ghost" onClick={onDiscard}>
            <Trash2 className="size-4" />
            Discard
          </Button>
        </div>
      </div>

      {(truncated || skippedCount > 0) && (
        <div className="rounded-xl border border-cinnabar/30 bg-cinnabar/5 p-4 text-sm">
          {truncated && (
            <p>Statement text was truncated at the size limit — later pages may be missing.</p>
          )}
          {skippedCount > 0 && (
            <p className={truncated ? 'mt-1' : undefined}>
              {skippedCount} unreadable {skippedCount === 1 ? 'row was' : 'rows were'} skipped while
              parsing — check the balance banner below.
            </p>
          )}
        </div>
      )}

      {currencyMismatch && (
        <div className="rounded-xl border border-cinnabar/30 bg-cinnabar/5 p-4 text-sm">
          Statement currency ({statement.currency}) differs from the account currency (
          {sourceAccountCurrency}). Rows will be recorded in {statement.currency}.
        </div>
      )}

      {!balancesKnown && (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Opening/closing balance not found in the statement — balance reconciliation is
          unavailable. Double-check the amounts before confirming.
        </div>
      )}

      {reconcile &&
        (reconcile.ok ? (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-jade tabular-nums">
            <CheckCircle2 className="size-4" />
            Balance reconciles: closing {formatCurrency(reconcile.expected, currency)}
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-cinnabar/30 bg-cinnabar/5 p-4 text-sm tabular-nums">
            <AlertTriangle className="size-4 mt-0.5 shrink-0 text-cinnabar" />
            <span>
              Balance is off by {formatCurrency(reconcile.diff, currency)} (expected{' '}
              {formatCurrency(reconcile.expected, currency)}, computed{' '}
              {formatCurrency(reconcile.actual, currency)}). Excluded rows are the usual cause — you
              can still import.
            </span>
          </div>
        ))}

      <div className="space-y-4">
        {groups.map((group) => {
          const hasCategoryRows = group.rows.some((r) => r.type !== 'transfer')
          return (
            <div
              key={group.key}
              className="rounded-xl border border-border/30 bg-card text-card-foreground"
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-border/30 px-4 py-2.5">
                <span className="font-medium text-sm">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {group.rows.length} {group.rows.length === 1 ? 'row' : 'rows'}
                </span>
                {hasCategoryRows && (
                  <Select
                    value={NONE}
                    onValueChange={(v: string | null) =>
                      onApplyCategoryToGroup(group.key, v === NONE ? '' : (v ?? ''))
                    }
                    items={[
                      { value: NONE, label: 'Apply category to group…' },
                      ...categories.map((c) => ({
                        value: c.id,
                        label: `${c.name} (${c.type})`,
                      })),
                    ]}
                  >
                    <SelectTrigger
                      className="h-7 w-44 text-xs"
                      aria-label={`Apply category to ${group.label}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Apply category to group…</SelectItem>
                      {categories
                        .filter((c) => c.type === 'expense' || c.type === 'income')
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleGroup(group.key, true)}
                    aria-label={`Include all ${group.label}`}
                  >
                    <Plus className="size-3.5" />
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleGroup(group.key, false)}
                    aria-label={`Exclude all ${group.label}`}
                  >
                    <Trash2 className="size-3.5" />
                    None
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-border/30">
                {group.rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                    <Checkbox
                      checked={row.included}
                      onCheckedChange={(v) => onUpdateRow(row.id, { included: v === true })}
                      aria-label={`Include ${group.label} ${row.extraction.date}`}
                    />
                    <Input
                      type="date"
                      value={row.extraction.date}
                      onChange={(e) => updateExtraction(row, { date: e.target.value })}
                      className="h-7 w-36 text-xs tabular-nums"
                      aria-label="Date"
                    />
                    <Input
                      value={row.extraction.description}
                      onChange={(e) => updateExtraction(row, { description: e.target.value })}
                      className="h-7 min-w-40 flex-1 text-xs"
                      aria-label="Description"
                    />
                    <span
                      className={`text-sm tabular-nums ${row.extraction.direction === 'debit' ? 'text-cinnabar' : 'text-jade'}`}
                    >
                      {row.extraction.direction === 'debit' ? '−' : '+'}
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.extraction.amount}
                      onChange={(e) =>
                        updateExtraction(row, { amount: Number(e.target.value) || 0 })
                      }
                      className="h-7 w-28 text-xs tabular-nums"
                      aria-label="Amount"
                    />
                    <Badge variant="outline" className="capitalize">
                      {row.type}
                    </Badge>
                    {row.type !== 'transfer' && (
                      <Select
                        value={row.categoryId ?? NONE}
                        onValueChange={(v: string | null) =>
                          onSetRowCategory(row, v === NONE ? '' : (v ?? ''))
                        }
                        items={[
                          { value: NONE, label: 'No category' },
                          ...categories
                            .filter(
                              (c) => c.type === (row.type === 'income' ? 'income' : 'expense'),
                            )
                            .map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs" aria-label="Category">
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No category</SelectItem>
                          {categories
                            .filter(
                              (c) => c.type === (row.type === 'income' ? 'income' : 'expense'),
                            )
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    {row.type === 'transfer' && (
                      <Select
                        value={row.counterpartAccountId ?? NONE}
                        onValueChange={(v: string | null) => {
                          if (v && v !== NONE) onSetCounterpart(row.id, v)
                        }}
                        items={[
                          { value: NONE, label: 'Pick counterpart…' },
                          ...counterpartOptions.map((a) => ({
                            value: a.id,
                            label: `${a.name} (${a.currency})`,
                          })),
                        ]}
                      >
                        <SelectTrigger
                          className="h-7 w-44 text-xs"
                          aria-label="Counterpart account"
                        >
                          <SelectValue placeholder="Counterpart account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Pick counterpart…</SelectItem>
                          {counterpartOptions.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.currency})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FlagsBadges flags={row.flags} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {confirmError && (
        <p className="text-right text-sm text-cinnabar" role="alert">
          {confirmError}
        </p>
      )}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border/60 bg-background py-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {includedCount} transaction{includedCount === 1 ? '' : 's'} selected
        </span>
        <Button onClick={onConfirm} disabled={confirmDisabled || confirming || includedCount === 0}>
          {confirming
            ? 'Adding…'
            : `Add ${includedCount} transaction${includedCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  )
}
