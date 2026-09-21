import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAccountsStore } from '@/stores/accountsStore'
import { supabase } from '@/supabase/client'
import { chainableSelect } from '@/test/supabase-mock'

describe('Store Error Handling', () => {
  const originalFrom = supabase.from

  beforeEach(() => {
    supabase.from = originalFrom
    useAccountsStore.setState({ error: null })
  })

  it('sets error on load failure', async () => {
    // Override from to return an error
    supabase.from = vi.fn().mockReturnValue({
      select: vi
        .fn()
        .mockReturnValue(
          chainableSelect(Promise.resolve({ data: null, error: { message: 'Test load error' } })),
        ),
    })

    const store = useAccountsStore.getState()
    await expect(store.load()).rejects.toThrow()

    expect(useAccountsStore.getState().error).toBe('Test load error')
  })

  it('clears error with clearError()', () => {
    useAccountsStore.setState({ error: 'Some error' })
    expect(useAccountsStore.getState().error).toBe('Some error')

    useAccountsStore.getState().clearError()
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it('clears error before adding', async () => {
    useAccountsStore.setState({ error: 'Previous error' })

    // Override from to return an error
    supabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Add failed' } }),
        }),
      }),
    })

    const store = useAccountsStore.getState()
    await expect(
      store.add({ name: 'A', type: 'checking', currency: 'USD', openingBalance: 0 }),
    ).rejects.toThrow()

    expect(useAccountsStore.getState().error).toBe('Add failed')
  })

  it('maps the pinned-currency FK violation to a friendly message', async () => {
    // 20260918000001_input_invariants.sql pins an account's currency while
    // transactions reference it (transactions/recurring
    // *_account_currency_fkey). The raw PostgREST constraint text must never
    // reach the user.
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'update or delete on table "accounts" violates foreign key constraint "transactions_account_currency_fkey" on table "transactions"',
          },
        }),
      }),
    })

    await expect(useAccountsStore.getState().update('acc-1', { currency: 'EUR' })).rejects.toThrow(
      'Cannot change currency while transactions reference this account',
    )

    expect(useAccountsStore.getState().error).toBe(
      'Cannot change currency while transactions reference this account',
    )
    expect(useAccountsStore.getState().error).not.toContain('fkey')
  })

  it('maps the recurring-pinning FK violation to the same friendly message', async () => {
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: {
            message:
              'update or delete on table "accounts" violates foreign key constraint "recurring_transactions_account_currency_fkey" on table "recurring_transactions"',
          },
        }),
      }),
    })

    await expect(useAccountsStore.getState().update('acc-1', { currency: 'EUR' })).rejects.toThrow(
      'Cannot change currency while transactions reference this account',
    )
    expect(useAccountsStore.getState().error).not.toContain('constraint')
  })

  it('leaves unrelated update errors untouched', async () => {
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'network hiccup' } }),
      }),
    })

    await expect(useAccountsStore.getState().update('acc-1', { name: 'Renamed' })).rejects.toThrow(
      'network hiccup',
    )
    expect(useAccountsStore.getState().error).toBe('network hiccup')
  })
})
