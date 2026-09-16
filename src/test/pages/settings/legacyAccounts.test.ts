import { describe, it, expect } from 'vitest'
import { normalizeLegacyAccounts } from '@/pages/settings/legacyAccounts'

describe('normalizeLegacyAccounts', () => {
  const account = { id: 'acc-1', name: 'Checking', balance: 1234 }

  it('derives opening_balance = exported balance - signed transaction effects', () => {
    const transactions = [
      { account_id: 'acc-1', type: 'income', amount: 50 },
      { account_id: 'acc-1', type: 'expense', amount: 30 },
      { account_id: 'acc-1', type: 'transfer', amount: 10 },
    ]
    const [row] = normalizeLegacyAccounts([account], transactions)
    // effects = 50 - 30 + 10 = 30; opening = 1234 - 30 = 1204
    expect(row.opening_balance).toBe(1204)
    // balance stays the exported value (opening + effects restores it)
    expect(row.balance).toBe(1234)
  })

  it('ignores transactions belonging to other accounts', () => {
    const transactions = [
      { account_id: 'acc-1', type: 'income', amount: 50 },
      { account_id: 'acc-2', type: 'expense', amount: 999 },
    ]
    const [row] = normalizeLegacyAccounts([account], transactions)
    expect(row.opening_balance).toBe(1234 - 50)
  })

  it('leaves rows that already carry opening_balance untouched (current exports)', () => {
    const row = { ...account, opening_balance: 500 }
    const transactions = [{ account_id: 'acc-1', type: 'income', amount: 5 }]
    expect(normalizeLegacyAccounts([row], transactions)).toEqual([row])
  })

  it('derives opening = balance for accounts with no exported transactions', () => {
    const [row] = normalizeLegacyAccounts([account], [])
    expect(row.opening_balance).toBe(1234)
  })
})
