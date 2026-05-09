import { db } from "@/db"
import type { ExchangeRate } from "@/types"

const API_BASE = "https://open.er-api.com/v6/latest"

export async function fetchExchangeRate(from: string, to: string): Promise<number | null> {
  try {
    const resp = await fetch(`${API_BASE}/${from}`)
    const data = await resp.json()
    if (data.result === "success" && data.rates[to]) {
      return data.rates[to] as number
    }
    return null
  } catch {
    return null
  }
}

export async function getOrFetchRate(from: string, to: string, date: Date): Promise<number | null> {
  if (from === to) return 1

  // Check database first
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const existing = await db.exchangeRates
    .where("[fromCurrency+toCurrency+date]")
    .equals([from, to, dayStart])
    .first()

  if (existing) return existing.rate

  // Fetch from API
  const rate = await fetchExchangeRate(from, to)
  if (rate) {
    const entry: ExchangeRate = {
      id: `${from}-${to}-${dayStart.toISOString()}`,
      fromCurrency: from,
      toCurrency: to,
      rate,
      date: dayStart,
    }
    await db.exchangeRates.put(entry)
    return rate
  }

  return null
}

export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  date: Date = new Date()
): Promise<number> {
  if (from === to) return amount
  const rate = await getOrFetchRate(from, to, date)
  if (rate) return amount * rate
  return amount // Fallback: no conversion
}
