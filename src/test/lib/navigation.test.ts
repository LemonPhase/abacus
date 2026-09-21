import { describe, it, expect } from 'vitest'

import { NAV_LINKS, MOBILE_NAV_LINKS } from '@/lib/navigation'

describe('navigation config', () => {
  it('desktop sidebar keeps the nine flat destinations', () => {
    expect(NAV_LINKS.map((l) => l.to)).toEqual([
      '/app/dashboard',
      '/app/accounts',
      '/app/transactions',
      '/app/recurring',
      '/app/budgets',
      '/app/reports',
      '/app/categories',
      '/app/investments',
      '/app/settings',
    ])
  })

  it('mobile shows exactly the five approved tabs in order', () => {
    expect(MOBILE_NAV_LINKS.map((l) => l.label)).toEqual([
      'Home',
      'Transactions',
      'Budgets',
      'Accounts',
      'Settings',
    ])
    expect(MOBILE_NAV_LINKS.map((l) => l.to)).toEqual([
      '/app/dashboard',
      '/app/transactions',
      '/app/budgets',
      '/app/accounts',
      '/app/settings',
    ])
  })

  it('maps absorbed routes to their host tab for active state', () => {
    const byTo = new Map(MOBILE_NAV_LINKS.map((l) => [l.to, l]))
    expect(byTo.get('/app/dashboard')?.activeOn).toContain('/app/reports')
    expect(byTo.get('/app/transactions')?.activeOn).toContain('/app/recurring')
    expect(byTo.get('/app/accounts')?.activeOn).toContain('/app/investments')
    expect(byTo.get('/app/settings')?.activeOn).toContain('/app/categories')
  })
})
