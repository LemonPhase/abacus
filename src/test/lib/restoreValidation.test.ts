import { describe, it, expect } from 'vitest'
import {
  parseAndValidateRestorePayload,
  MAX_RESTORE_ROWS,
  type RestorePayload,
} from '@/lib/restoreValidation'

const UID = 'user-a'

function validPayload(overrides: Partial<RestorePayload> = {}): RestorePayload {
  return {
    version: 3,
    exportedAt: '2026-01-01T00:00:00.000Z',
    accounts: [
      {
        id: 'acc-1',
        user_id: 'user-a',
        name: 'Checking',
        type: 'checking',
        currency: 'USD',
        opening_balance: 700,
        balance: 720,
      },
    ],
    categories: [{ id: 'cat-1', user_id: 'user-a', name: 'Food', type: 'expense', color: '#fff' }],
    transactions: [
      {
        id: 'tx-1',
        user_id: 'user-a',
        account_id: 'acc-1',
        category_id: 'cat-1',
        type: 'expense',
        amount: 20,
        currency: 'USD',
        base_amount: 20,
        base_currency: 'USD',
        date: '2026-01-02',
      },
    ],
    budgets: [
      {
        id: 'bud-1',
        user_id: 'user-a',
        name: 'Food',
        amount: 100,
        period: 'monthly',
        category_ids: ['cat-1'],
      },
    ],
    exchange_rates: [
      {
        id: 'er-1',
        user_id: 'user-a',
        from_currency: 'USD',
        to_currency: 'EUR',
        rate: 0.9,
        date: '2026-01-01',
      },
    ],
    investment_plans: [
      { id: 'inv-1', user_id: 'user-a', name: 'Index', type: 'index_fund', currency: 'USD' },
    ],
    recurring_transactions: [
      {
        id: 'rec-1',
        user_id: 'user-a',
        account_id: 'acc-1',
        category_id: 'cat-1',
        type: 'expense',
        amount: 30,
        frequency: 'monthly',
        next_date: '2026-02-01',
      },
    ],
    ...overrides,
  }
}

function expectError(payload: unknown, message: RegExp) {
  expect(() => parseAndValidateRestorePayload(JSON.stringify(payload), UID)).toThrowError(message)
}

describe('parseAndValidateRestorePayload', () => {
  it('accepts a well-formed version 3 payload and fills absent tables with empty arrays', () => {
    const payload = validPayload()
    delete (payload as Partial<RestorePayload>).recurring_transactions
    delete (payload as Partial<RestorePayload>).budgets

    const result = parseAndValidateRestorePayload(JSON.stringify(payload), UID)
    expect(result.version).toBe(3)
    expect(result.accounts).toHaveLength(1)
    expect(result.recurring_transactions).toEqual([])
    expect(result.budgets).toEqual([])
    expect(result.exportedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('accepts a legacy version 2 payload', () => {
    const payload = validPayload({ version: 2 })
    expect(() => parseAndValidateRestorePayload(JSON.stringify(payload), UID)).not.toThrow()
  })

  it('rejects invalid JSON and non-object payloads', () => {
    expect(() => parseAndValidateRestorePayload('not json', UID)).toThrowError(/not valid JSON/i)
    expectError([1, 2], /expected a JSON object/i)
  })

  it('rejects missing or unsupported versions', () => {
    expectError({ accounts: [], transactions: [] }, /unsupported export version/i)
    expectError({ version: 1, accounts: [], transactions: [] }, /unsupported export version/i)
    expectError({ version: 4, accounts: [], transactions: [] }, /unsupported export version/i)
    expectError({ version: '2', accounts: [], transactions: [] }, /unsupported export version/i)
  })

  it('rejects missing required tables', () => {
    expectError({ version: 3, transactions: [] }, /missing required table \(accounts\)/i)
    expectError({ version: 3, accounts: [] }, /missing required table \(transactions\)/i)
  })

  it('rejects non-array tables', () => {
    expectError({ version: 3, accounts: {}, transactions: [] }, /"accounts" must be an array/i)
    expectError(
      { version: 3, accounts: [], transactions: [], budgets: 5 },
      /"budgets" must be an array/i,
    )
  })

  it('rejects rows that are not objects or lack a string id', () => {
    expectError({ version: 3, accounts: ['nope'], transactions: [] }, /accounts\[0\]/i)
    expectError(
      { version: 3, accounts: [{ name: 'x' }], transactions: [] },
      /object with a string id/i,
    )
  })

  it('rejects rows belonging to another user', () => {
    const payload = validPayload()
    payload.accounts[0].user_id = 'user-b'
    expectError(payload, /accounts\[0\] belongs to another user/i)

    const payload2 = validPayload()
    payload2.transactions[0].user_id = 'user-b'
    expectError(payload2, /transactions\[0\] belongs to another user/i)

    // absent and null user_id are allowed (DB fills auth.uid())
    const payload3 = validPayload()
    delete payload3.accounts[0].user_id
    payload3.transactions[0].user_id = null
    expect(() => parseAndValidateRestorePayload(JSON.stringify(payload3), UID)).not.toThrow()
  })

  it('rejects transactions and recurring records referencing unknown accounts', () => {
    const payload = validPayload()
    payload.transactions[0].account_id = 'acc-404'
    expectError(payload, /transactions\[0\]\.account_id not found in accounts/i)

    const payload2 = validPayload()
    payload2.transactions[0].account_id = undefined
    expectError(payload2, /transactions\[0\]\.account_id not found in accounts/i)

    const payload3 = validPayload()
    payload3.recurring_transactions[0].account_id = 'acc-404'
    expectError(payload3, /recurring_transactions\[0\]\.account_id not found in accounts/i)
  })

  it('rejects references to unknown categories', () => {
    const payload = validPayload()
    payload.transactions[0].category_id = 'cat-404'
    expectError(payload, /transactions\[0\]\.category_id not found in categories/i)

    const payload2 = validPayload()
    payload2.recurring_transactions[0].category_id = 'cat-404'
    expectError(payload2, /recurring_transactions\[0\]\.category_id not found in categories/i)

    const payload3 = validPayload()
    payload3.budgets[0].category_ids = ['cat-404']
    expectError(payload3, /budgets\[0\] references a category not in categories/i)
  })

  it('allows null/absent category references', () => {
    const payload = validPayload()
    payload.transactions[0].category_id = null
    delete payload.recurring_transactions[0].category_id
    delete payload.budgets[0].category_ids
    expect(() => parseAndValidateRestorePayload(JSON.stringify(payload), UID)).not.toThrow()
  })

  it('rejects non-array budget category_ids', () => {
    const payload = validPayload()
    payload.budgets[0].category_ids = 'cat-1'
    expectError(payload, /budgets\[0\]\.category_ids must be an array/i)
  })

  it('rejects payloads over the row cap', () => {
    const rows = Array.from({ length: MAX_RESTORE_ROWS + 1 }, (_, i) => ({ id: `x-${i}` }))
    const payload = { version: 3, accounts: rows, transactions: [] }
    expectError(payload, /maximum is/i)
  })
})
