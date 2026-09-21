import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import type { ReconcileResult } from '@/lib/statement'

interface DoneStepProps {
  count: number
  reconcile: ReconcileResult | null
  currency?: string
  onBack: () => void
}

export function DoneStep({ count, reconcile, currency, onBack }: DoneStepProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3 max-w-md">
        <CheckCircle2 className="size-10 text-jade mx-auto" />
        <h1 className="text-2xl font-bold tracking-tight">
          Added {count} transaction{count === 1 ? '' : 's'}
        </h1>
        {reconcile &&
          (reconcile.ok ? (
            <p className="text-sm text-jade">Statement balance reconciled.</p>
          ) : (
            <p className="text-sm text-cinnabar tabular-nums">
              Note: the statement balance was off by{' '}
              {formatCurrency(reconcile.diff, currency ?? 'USD')} — review excluded rows if that
              looks wrong.
            </p>
          ))}
        <Button onClick={onBack}>Back to Transactions</Button>
      </div>
    </div>
  )
}
