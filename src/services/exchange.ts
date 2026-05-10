import { supabase } from '@/supabase/client'
import { mapKeysToSnake } from '@/lib/case'
import type { Database } from '@/supabase/database.types'

const API_BASE = 'https://open.er-api.com/v6/latest'

export async function fetchExchangeRate(from: string, to: string): Promise<number | null> {
  try {
    const resp = await fetch(`${API_BASE}/${from}`)
    const data = await resp.json()
    if (data.result === 'success' && data.rates[to]) {
      return data.rates[to] as number
    }
    return null
  } catch {
    return null
  }
}

export async function getOrFetchRate(from: string, to: string, date: Date): Promise<number | null> {
  if (from === to) return 1

  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dateStr = dayStart.toISOString().split('T')[0]

  const { data: existing, error } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', from)
    .eq('to_currency', to)
    .eq('date', dateStr)
    .maybeSingle()

  if (error) return null
  if (existing) return existing.rate

  const rate = await fetchExchangeRate(from, to)
  if (rate) {
    const { error: insertError } = await supabase.from('exchange_rates').insert(
      mapKeysToSnake({
        fromCurrency: from,
        toCurrency: to,
        rate,
        date: dateStr,
      }) as Database['public']['Tables']['exchange_rates']['Insert'],
    )
    if (insertError) return null
    return rate
  }

  return null
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  date: Date = new Date(),
): Promise<number> {
  if (from === to) return amount
  const rate = await getOrFetchRate(from, to, date)
  if (rate) return amount * rate
  return amount
}
