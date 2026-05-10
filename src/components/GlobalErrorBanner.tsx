import { AlertCircle, X } from 'lucide-react'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'

export default function GlobalErrorBanner() {
  const accountsError = useAccountsStore((s) => s.error)
  const clearAccountsError = useAccountsStore((s) => s.clearError)

  const categoriesError = useCategoriesStore((s) => s.error)
  const clearCategoriesError = useCategoriesStore((s) => s.clearError)

  const transactionsError = useTransactionsStore((s) => s.error)
  const clearTransactionsError = useTransactionsStore((s) => s.clearError)

  const budgetsError = useBudgetsStore((s) => s.error)
  const clearBudgetsError = useBudgetsStore((s) => s.clearError)

  const investmentsError = useInvestmentPlansStore((s) => s.error)
  const clearInvestmentsError = useInvestmentPlansStore((s) => s.clearError)

  const errors = [
    { msg: accountsError, clear: clearAccountsError },
    { msg: categoriesError, clear: clearCategoriesError },
    { msg: transactionsError, clear: clearTransactionsError },
    { msg: budgetsError, clear: clearBudgetsError },
    { msg: investmentsError, clear: clearInvestmentsError },
  ].filter((e) => e.msg !== null)

  if (errors.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full">
      {errors.map((err, i) => (
        <div
          key={i}
          className="bg-destructive text-destructive-foreground p-4 rounded-lg shadow-lg flex items-start gap-3 animate-in slide-in-from-top-2"
        >
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium">{err.msg}</div>
          <button
            onClick={err.clear}
            className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
          >
            <X className="size-5" />
          </button>
        </div>
      ))}
    </div>
  )
}
