import { describe, it, expect } from 'vitest'
import { getCategoryIcon, ICON_MAP, ICON_NAMES } from '@/lib/icons'

describe('getCategoryIcon', () => {
  it('returns null for undefined', () => {
    expect(getCategoryIcon(undefined)).toBeNull()
  })

  it('returns null for null', () => {
    expect(getCategoryIcon(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getCategoryIcon('')).toBeNull()
  })

  it('returns null for unknown icon name', () => {
    expect(getCategoryIcon('nonexistent')).toBeNull()
  })

  it('returns a valid icon for a known name', () => {
    const icon = getCategoryIcon('wallet')
    expect(icon).not.toBeNull()
  })

  it('returns icons for multiple known names', () => {
    const names = ['wallet', 'home', 'car']
    for (const name of names) {
      const icon = getCategoryIcon(name)
      expect(icon).not.toBeNull()
    }
  })
})

describe('ICON_NAMES', () => {
  it('is an array', () => {
    expect(Array.isArray(ICON_NAMES)).toBe(true)
  })

  it('contains all keys from ICON_MAP', () => {
    const mapKeys = Object.keys(ICON_MAP)
    expect(ICON_NAMES).toEqual(mapKeys)
  })

  it('every key in ICON_NAMES returns a valid icon from getCategoryIcon', () => {
    for (const name of ICON_NAMES) {
      const icon = getCategoryIcon(name)
      expect(icon).not.toBeNull()
    }
  })
})
