import type { Transaction } from '@/types'

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Round to the currency's standard minor-unit precision (e.g. 2 for USD, 0 for JPY). */
export function roundCurrency(amount: number, currency: string): number {
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  const factor = 10 ** digits
  return Math.round(amount * factor) / factor
}

/**
 * The transaction's amount expressed in the reporting currency, or null when no
 * reliable conversion exists.
 *
 * Currency semantics:
 * - `t.currency` is the currency the amount is denominated in (the account's
 *   currency for the transaction's account).
 * - `t.baseAmount`/`t.baseCurrency` record a conversion that was computed for a
 *   specific reporting currency at write time, with `fxRate`/`fxDate`
 *   provenance.
 * - Identity rows (`t.currency === reporting`) are trusted as-is.
 * - Rows flagged `baseAmountStale` or converted for a different reporting
 *   currency are excluded (null) until re-saved.
 */
export function reliableBaseAmount(t: Transaction, reporting: string): number | null {
  if (t.currency === reporting) return t.amount
  if (t.baseCurrency === reporting && !t.baseAmountStale) return t.baseAmount
  return null
}
