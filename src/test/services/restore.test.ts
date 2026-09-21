import { describe, it, expect, vi, beforeEach } from 'vitest'
import { restoreUserData, currentUserId } from '@/services/restore'
import { mockSupabase } from '@/test/supabase-mock'

let currentUser: string | null

beforeEach(() => {
  currentUser = 'user-a'
  mockSupabase.auth.getSession.mockImplementation(async () => ({
    data: { session: currentUser ? { user: { id: currentUser } } : null },
    error: null,
  }))
})

function makeFile(data: unknown): File {
  return new File([JSON.stringify(data)], 'export.json', { type: 'application/json' })
}

describe('currentUserId', () => {
  it('returns the signed-in user id or null', async () => {
    expect(await currentUserId()).toBe('user-a')
    currentUser = null
    expect(await currentUserId()).toBeNull()
  })
})

describe('restoreUserData', () => {
  it('validates, normalizes legacy accounts, and invokes the RPC with the payload', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accounts: 1,
        transactions: 2,
        categories: 0,
        budgets: 0,
        exchange_rates: 0,
        investment_plans: 0,
        recurring_transactions: 0,
      },
      error: null,
    })
    mockSupabase.rpc.mockImplementation(rpc)

    const result = await restoreUserData(
      makeFile({
        version: 2,
        accounts: [
          {
            id: 'acc-1',
            user_id: 'user-a',
            name: 'Checking',
            type: 'checking',
            currency: 'USD',
            balance: 1234,
          },
        ],
        transactions: [
          {
            id: 'tx-1',
            user_id: 'user-a',
            account_id: 'acc-1',
            type: 'income',
            amount: 50,
            currency: 'USD',
            date: '2026-01-02',
          },
          {
            id: 'tx-2',
            user_id: 'user-a',
            account_id: 'acc-1',
            type: 'expense',
            amount: 30,
            currency: 'USD',
            date: '2026-01-03',
          },
        ],
      }),
    )

    expect(result.accounts).toBe(1)
    expect(result.transactions).toBe(2)
    expect(result.restoredFor).toBe('user-a')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('restore_user_data', {
      p_payload: expect.objectContaining({ version: 2 }),
    })
    const payload = rpc.mock.calls[0][1].p_payload as Record<string, unknown[]>
    // legacy normalization: opening = balance - effects = 1234 - (50 - 30)
    expect(payload.accounts[0]).toMatchObject({ opening_balance: 1214, balance: 1234 })
    expect(payload.transactions).toHaveLength(2)
  })

  it('surfaces RPC errors', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'boom from db' } })
    await expect(
      restoreUserData(makeFile({ version: 3, accounts: [], transactions: [] })),
    ).rejects.toThrowError('boom from db')
  })

  it('throws when the RPC returns no summary', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })
    await expect(
      restoreUserData(makeFile({ version: 3, accounts: [], transactions: [] })),
    ).rejects.toThrowError(/no summary/i)
  })

  it('rejects malformed payloads before touching the database', async () => {
    const rpc = vi.fn()
    mockSupabase.rpc.mockImplementation(rpc)

    await expect(restoreUserData(makeFile({ version: 1 }))).rejects.toThrowError(
      /unsupported export version/i,
    )
    await expect(
      restoreUserData(
        makeFile({
          version: 3,
          accounts: [{ id: 'a' }],
          transactions: [{ id: 't', account_id: 'missing' }],
        }),
      ),
    ).rejects.toThrowError(/account_id not found/i)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('aborts without calling the RPC when the signed-in user changes mid-read', async () => {
    const rpc = vi.fn()
    mockSupabase.rpc.mockImplementation(rpc)

    let resolveText: ((value: string) => void) | undefined
    const file = {
      text: () =>
        new Promise<string>((resolve) => {
          resolveText = resolve
        }),
    } as unknown as File

    const pending = restoreUserData(file)
    // Let the service capture the identity and reach file.text() first.
    await new Promise((resolve) => setTimeout(resolve, 0))
    currentUser = 'user-b'
    resolveText!(JSON.stringify({ version: 3, accounts: [], transactions: [] }))

    await expect(pending).rejects.toThrowError(/import aborted/i)
    expect(rpc).not.toHaveBeenCalled()
  })
})
