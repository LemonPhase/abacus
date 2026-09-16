import { describe, it, expect } from 'vitest'
import { formatFrequency } from '@/lib/recurring'

describe('formatFrequency', () => {
  it('formats singular daily', () => {
    expect(formatFrequency('daily', 1)).toBe('Daily')
  })

  it('formats plural daily', () => {
    expect(formatFrequency('daily', 3)).toBe('Every 3 days')
  })

  it('formats singular weekly', () => {
    expect(formatFrequency('weekly', 1)).toBe('Weekly')
  })

  it('formats plural weekly', () => {
    expect(formatFrequency('weekly', 2)).toBe('Every 2 weeks')
  })

  it('formats singular monthly', () => {
    expect(formatFrequency('monthly', 1)).toBe('Monthly')
  })

  it('formats plural monthly', () => {
    expect(formatFrequency('monthly', 3)).toBe('Every 3 months')
  })

  it('formats singular yearly', () => {
    expect(formatFrequency('yearly', 1)).toBe('Yearly')
  })

  it('formats plural yearly', () => {
    expect(formatFrequency('yearly', 2)).toBe('Every 2 years')
  })
})
