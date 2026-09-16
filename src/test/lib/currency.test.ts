import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/lib/currency'

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
  })

  it('formats EUR correctly', () => {
    const result = formatCurrency(1234.56, 'EUR')
    expect(result).toMatch(/€/)
    expect(result).toMatch(/1,234\.56/)
  })

  it('formats zero correctly', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0')
  })

  it('formats without decimals if whole number', () => {
    expect(formatCurrency(100, 'USD')).toBe('$100')
  })
})

import { roundCurrency, reliableBaseAmount, sumReliableBase } from '@/lib/currency'
import type { Transaction } from '@/types'

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    accountId: 'a1',
    categoryId: null,
    type: 'expense',
    amount: 100,
    currency: 'USD',
    baseAmount: 100,
    baseCurrency: 'USD',
    fxRate: null,
    fxDate: null,
    baseAmountStale: false,
    date: new Date('2026-05-01'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('roundCurrency', () => {
  it('rounds to the currency minor units', () => {
    expect(roundCurrency(10.12345, 'USD')).toBe(10.12)
    expect(roundCurrency(1000.56, 'JPY')).toBe(1001)
  })
})

describe('reliableBaseAmount', () => {
  it('trusts identity rows (currency === reporting) regardless of stale flag', () => {
    expect(reliableBaseAmount(txn({ currency: 'USD', baseCurrency: 'USD' }), 'USD')).toBe(100)
    expect(
      reliableBaseAmount(
        txn({ currency: 'USD', baseCurrency: 'USD', baseAmountStale: true }),
        'USD',
      ),
    ).toBe(100)
  })

  it('trusts fresh conversions for the current reporting currency', () => {
    expect(
      reliableBaseAmount(
        txn({ currency: 'EUR', baseAmount: 108, baseCurrency: 'USD', fxRate: 1.08 }),
        'USD',
      ),
    ).toBe(108)
  })

  it('excludes rows converted for a different reporting currency', () => {
    expect(
      reliableBaseAmount(txn({ currency: 'EUR', baseAmount: 108, baseCurrency: 'USD' }), 'GBP'),
    ).toBeNull()
  })

  it('excludes stale rows to avoid silent 1:1 misrepresentation', () => {
    expect(
      reliableBaseAmount(
        txn({ currency: 'EUR', baseAmount: 100, baseCurrency: 'EUR', baseAmountStale: true }),
        'USD',
      ),
    ).toBeNull()
  })
})

describe('sumReliableBase', () => {
  it('sums reliable rows and counts unconverted ones', () => {
    const txns = [
      txn({ id: 'a', currency: 'USD' }),
      txn({ id: 'b', currency: 'EUR', baseAmount: 50, baseCurrency: 'USD' }),
      txn({ id: 'c', currency: 'EUR', baseAmount: 99, baseCurrency: 'EUR', baseAmountStale: true }),
    ]
    const { total, unconverted } = sumReliableBase(txns, 'USD')
    expect(total).toBe(150)
    expect(unconverted).toBe(1)
  })
})
