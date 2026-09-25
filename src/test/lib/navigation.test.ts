import { describe, it, expect } from 'vitest'
import { NAV_LINKS, MOBILE_NAV_LINKS, MORE_LINKS, isMobileNavActive } from '@/lib/navigation'

describe('navigation destinations', () => {
  it('orders desktop destinations with Settings in the footer', () => {
    expect(NAV_LINKS.map((link) => link.label)).toEqual([
      'Home',
      'Transactions',
      'Budgets',
      'Accounts',
      'Reports',
      'Recurring',
      'Investments',
      'Categories',
      'Settings',
    ])
    expect(NAV_LINKS.filter((link) => link.desktop === 'footer').map((link) => link.to)).toEqual([
      '/app/settings',
    ])
  })

  it('shows four primary mobile destinations and More', () => {
    expect(MOBILE_NAV_LINKS.map((link) => link.label)).toEqual([
      'Home',
      'Transactions',
      'Budgets',
      'Accounts',
      'More',
    ])
    expect(MORE_LINKS.map((link) => link.label)).toEqual([
      'Reports',
      'Recurring',
      'Investments',
      'Categories',
      'Settings',
    ])
  })

  it.each([
    '/app/reports',
    '/app/recurring',
    '/app/investments',
    '/app/investments/',
    '/app/categories',
    '/app/settings',
    '/app/more',
  ])('selects only More for %s', (path) => {
    expect(
      MOBILE_NAV_LINKS.filter((link) => isMobileNavActive(link.to, path)).map((link) => link.label),
    ).toEqual(['More'])
  })

  it('does not claim unknown routes by prefix', () => {
    expect(isMobileNavActive('/app/more', '/app/reports-unknown')).toBe(false)
  })
})
