import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchExchangeRate, getRate, convertCurrency } from '@/services/exchange'
import { getTable, resetAllTables } from '@/test/supabase-mock'

let mockFetch: ReturnType<typeof vi.fn>

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  resetAllTables()
  vi.unstubAllGlobals()
})

describe('fetchExchangeRate', () => {
  it('returns rate on successful API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { EUR: 0.92 } }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBe(0.92)
  })

  it('returns null on non-ok HTTP response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })

  it('returns null when API result is not success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'error', rates: {} }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })

  it('returns null when target currency not in rates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { GBP: 0.78 } }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })

  it('returns null on malformed provider payloads', async () => {
    for (const body of [
      null,
      'nope',
      { result: 'success' },
      { result: 'success', rates: 'not-an-object' },
      { result: 'success', rates: { EUR: '0.9' } },
      { result: 'success', rates: { EUR: -1 } },
      { result: 'success', rates: { EUR: Number.NaN } },
    ]) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(body) })
      expect(await fetchExchangeRate('USD', 'EUR')).toBeNull()
    }
  })

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })
})

describe('getRate', () => {
  it('returns 1 with identity provenance when from and to currencies are the same', async () => {
    const quote = await getRate('USD', 'USD', new Date('2026-05-01'))
    expect(quote).toEqual({ rate: 1, asOf: '2026-05-01' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('labels a current quote with today as asOf, even for a historical date', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { USD: 1.08 } }),
    })

    const quote = await getRate('EUR', 'USD', new Date('2020-01-01'))
    expect(quote).toEqual({ rate: 1.08, asOf: todayStr() })
    // Historical dates must not be filled with a current quote.
    expect(getTable('exchange_rates')).toHaveLength(0)
  })

  it('does not read cache rows for historical dates', async () => {
    getTable('exchange_rates').push({
      id: 'old',
      from_currency: 'EUR',
      to_currency: 'USD',
      rate: 0.5,
      date: '2020-01-01',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { USD: 1.08 } }),
    })

    const quote = await getRate('EUR', 'USD', new Date('2020-01-01'))
    expect(quote?.rate).toBe(1.08)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('reads the cache for same-day quotes without fetching', async () => {
    getTable('exchange_rates').push({
      id: 'today',
      from_currency: 'EUR',
      to_currency: 'USD',
      rate: 1.05,
      date: todayStr(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const quote = await getRate('EUR', 'USD', new Date())
    expect(quote).toEqual({ rate: 1.05, asOf: todayStr() })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('writes fetched same-day quotes to the cache (awaited)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { USD: 1.08 } }),
    })

    const quote = await getRate('EUR', 'USD', new Date())
    expect(quote?.rate).toBe(1.08)
    const rows = getTable('exchange_rates')
    expect(rows).toHaveLength(1)
    expect(rows[0].from_currency).toBe('EUR')
    expect(rows[0].to_currency).toBe('USD')
    expect(rows[0].rate).toBe(1.08)
    expect(rows[0].date).toBe(todayStr())
  })

  it('reuses the cached same-day quote instead of refetching (duplicate fills collapse)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { USD: 1.08 } }),
    })

    await getRate('EUR', 'USD', new Date())
    await getRate('EUR', 'USD', new Date())
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns null when API fetch fails and no cache', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await getRate('EUR', 'USD', new Date())
    expect(rate).toBeNull()
  })
})

describe('convertCurrency', () => {
  it('returns same amount when currencies match', async () => {
    const result = await convertCurrency(100, 'USD', 'USD')
    expect(result).toBe(100)
  })

  it('converts amount using fetched rate', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: 'success', rates: { JPY: 150 } }),
    })

    const result = await convertCurrency(10, 'USD', 'JPY', new Date('2026-05-01'))
    expect(result).toBe(1500)
  })

  it('returns null when rate lookup fails — no silent 1:1 fallback', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await convertCurrency(100, 'USD', 'EUR', new Date('2026-05-01'))
    expect(result).toBeNull()
  })
})
