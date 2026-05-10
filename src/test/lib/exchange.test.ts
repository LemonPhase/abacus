import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchExchangeRate, getOrFetchRate, convertCurrency } from '@/services/exchange'
import { resetAllTables } from '@/test/supabase-mock'

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  resetAllTables()
})

describe('fetchExchangeRate', () => {
  it('returns rate on successful API response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: 'success', rates: { EUR: 0.92 } }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBe(0.92)
  })

  it('returns null when API result is not success', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: 'error', rates: {} }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })

  it('returns null when target currency not in rates', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: 'success', rates: { GBP: 0.78 } }),
    })

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await fetchExchangeRate('USD', 'EUR')
    expect(rate).toBeNull()
  })
})

describe('getOrFetchRate', () => {
  it('returns 1 when from and to currencies are the same', async () => {
    const rate = await getOrFetchRate('USD', 'USD', new Date('2026-05-01'))
    expect(rate).toBe(1)
  })

  it('fetches from API when not cached and stores result', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ result: 'success', rates: { EUR: 0.92 } }),
    })

    const rate = await getOrFetchRate('USD', 'EUR', new Date('2026-05-01'))
    expect(rate).toBe(0.92)
  })

  it('returns null when API fetch fails and no cache', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const rate = await getOrFetchRate('USD', 'EUR', new Date('2026-05-01'))
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
      json: () => Promise.resolve({ result: 'success', rates: { JPY: 150 } }),
    })

    const result = await convertCurrency(10, 'USD', 'JPY', new Date('2026-05-01'))
    expect(result).toBe(1500)
  })

  it('returns original amount when rate lookup fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await convertCurrency(100, 'USD', 'EUR', new Date('2026-05-01'))
    expect(result).toBe(100)
  })
})
