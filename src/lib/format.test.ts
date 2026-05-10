import { describe, it, expect } from 'vitest'
import { formatCurrency } from './format'

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
