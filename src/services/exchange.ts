import { supabase } from '@/supabase/client'
import { mapKeysToSnake } from '@/lib/case'
import type { Database } from '@/supabase/database.types'

const API_BASE = 'https://open.er-api.com/v6/latest'

function dateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface RateQuote {
  rate: number
  /** Date the quote actually applies to (YYYY-MM-DD). */
  asOf: string
}

export async function fetchExchangeRate(from: string, to: string): Promise<number | null> {
  try {
    const resp = await fetch(`${API_BASE}/${from}`)
    if (!resp.ok) return null
    const data: unknown = await resp.json()
    if (!data || typeof data !== 'object') return null
    const { result, rates } = data as { result?: unknown; rates?: unknown }
    if (result !== 'success' || !rates || typeof rates !== 'object') return null
    const rate = (rates as Record<string, unknown>)[to]
    // Validate the provider response: a usable rate must be a positive finite number.
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null
    return rate
  } catch {
    return null
  }
}

/**
 * FX rate for `from` → `to`, or null when unavailable.
 *
 * The provider only serves current quotes, so the cache stores rows labeled
 * with the fetch day only — a quote is never written under a historical date.
 * Every lookup (for past or present transaction dates) reuses today's cached
 * quote when available and reports `asOf` = the fetch day, so provenance is
 * always honest. No calendar-day comparison against the transaction date is
 * made here: comparing a bare calendar date to "today" is timezone-dependent
 * (dialog dates parse as UTC midnight) and would skip the cache read/write in
 * some zones. `date` is used only for the identity conversion's asOf.
 */
export async function getRate(from: string, to: string, date: Date): Promise<RateQuote | null> {
  if (from === to) return { rate: 1, asOf: dateStr(date) }

  const today = dateStr(new Date())

  const { data: existing, error } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .eq('date', today)
    .maybeSingle()
  if (!error && existing) return { rate: existing.rate as number, asOf: today }

  const rate = await fetchExchangeRate(from, to)
  if (rate === null) return null

  // Awaited so the query actually executes. Upsert absorbs duplicate cache
  // fills from concurrent sessions (unique on user/pair/date); a failed
  // write is non-fatal — the fetched rate is still returned.
  const { error: writeError } = await supabase.from('exchange_rates').upsert(
    mapKeysToSnake({
      fromCurrency: from,
      toCurrency: to,
      rate,
      date: today,
    }) as Database['public']['Tables']['exchange_rates']['Insert'],
    { onConflict: 'user_id,from_currency,to_currency,date' },
  )
  if (writeError) console.warn(`FX cache write failed: ${writeError.message}`)

  return { rate, asOf: today }
}

/**
 * Convert `amount` from `from` to `to`, or null when no rate is available.
 * Callers must handle null explicitly — there is no silent 1:1 fallback.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  date: Date = new Date(),
): Promise<number | null> {
  if (from === to) return amount
  const quote = await getRate(from, to, date)
  if (!quote) return null
  return amount * quote.rate
}
