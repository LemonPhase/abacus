import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAccountsStore } from '@/stores/accountsStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { supabase } from '@/supabase/client'

const accountRow = {
  id: 'account-a',
  user_id: 'user-a',
  name: 'Account A',
  type: 'checking',
  currency: 'USD',
  balance: 100,
  notes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('CRUD session isolation', () => {
  const originalFrom = supabase.from
  const originalGetSession = supabase.auth.getSession
  const originalChannel = supabase.channel

  beforeEach(() => {
    supabase.from = originalFrom
    supabase.auth.getSession = originalGetSession
    supabase.channel = originalChannel
    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  })

  it('does not apply a delayed load after the store is reset', async () => {
    let resolveLoad: ((value: { data: (typeof accountRow)[]; error: null }) => void) | undefined
    const delayedLoad = new Promise<{ data: (typeof accountRow)[]; error: null }>((resolve) => {
      resolveLoad = resolve
    })
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(delayedLoad),
    })

    const load = useAccountsStore.getState().load()
    expect(useAccountsStore.getState().loading).toBe(true)
    useAccountsStore.getState().reset()

    resolveLoad!({ data: [accountRow], error: null })
    await load

    expect(useAccountsStore.getState().accounts).toEqual([])
    expect(useAccountsStore.getState().loading).toBe(false)
    expect(useAccountsStore.getState()._unsub).toBeNull()
  })

  it('does not publish a delayed mutation or failure after the store is reset', async () => {
    let resolveInsert: ((value: { data: typeof accountRow; error: null }) => void) | undefined
    const delayedInsert = new Promise<{ data: typeof accountRow; error: null }>((resolve) => {
      resolveInsert = resolve
    })
    supabase.auth.getSession = vi.fn().mockResolvedValue({
      data: { session: { user: { id: 'user-a' } } },
      error: null,
    })
    supabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockReturnValue(delayedInsert) }),
      }),
    })

    const add = useAccountsStore.getState().add({
      name: 'Account A',
      type: 'checking',
      currency: 'USD',
      balance: 100,
    })
    useAccountsStore.getState().reset()

    resolveInsert!({ data: accountRow, error: null })
    await expect(add).rejects.toThrow()

    expect(useAccountsStore.getState().accounts).toEqual([])
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it('ignores a realtime callback that arrives after reset', async () => {
    let realtimeHandler:
      | ((payload: {
          eventType: 'INSERT'
          new: typeof accountRow
          old: Record<string, unknown>
        }) => void)
      | undefined
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, handler: typeof realtimeHandler) => {
        realtimeHandler = handler
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    })
    supabase.channel = vi.fn().mockReturnValue(channel)

    await useAccountsStore.getState().load()
    useAccountsStore.getState().reset()
    realtimeHandler!({ eventType: 'INSERT', new: accountRow, old: {} })

    expect(useAccountsStore.getState().accounts).toEqual([])
  })

  it('discards a failed load that completes after reset without publishing the error', async () => {
    let resolveLoad: ((value: { data: null; error: { message: string } }) => void) | undefined
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(
        new Promise<{ data: null; error: { message: string } }>((resolve) => {
          resolveLoad = resolve
        }),
      ),
    })

    const load = useAccountsStore.getState().load()
    useAccountsStore.getState().reset()
    resolveLoad!({ data: null, error: { message: 'JWT expired' } })

    await expect(load).resolves.toBeUndefined()
    expect(useAccountsStore.getState().error).toBeNull()
    expect(useAccountsStore.getState().loading).toBe(false)
    expect(useAccountsStore.getState().accounts).toEqual([])
  })

  it('discards a delayed update after reset and keeps the collection empty', async () => {
    let resolveUpdate: ((value: { data: null; error: null }) => void) | undefined
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(
          new Promise<{ data: null; error: null }>((resolve) => {
            resolveUpdate = resolve
          }),
        ),
      }),
    })

    const update = useAccountsStore.getState().update('account-a', { name: 'Renamed' })
    useAccountsStore.getState().reset()
    resolveUpdate!({ data: null, error: null })

    await expect(update).rejects.toThrow()
    expect(useAccountsStore.getState().accounts).toEqual([])
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it('stays usable after reset: a fresh load repopulates for the next user', async () => {
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(
        Promise.resolve({
          data: [{ ...accountRow, id: 'account-b', user_id: 'user-b' }],
          error: null,
        }),
      ),
    })

    useAccountsStore.getState().reset()
    await useAccountsStore.getState().load()

    expect(useAccountsStore.getState().accounts).toHaveLength(1)
    expect(useAccountsStore.getState().accounts[0].id).toBe('account-b')
    expect(useAccountsStore.getState().loading).toBe(false)
  })

  it('a newer load wins: an older load completing later does not overwrite the newer snapshot', async () => {
    let resolveOld: ((value: { data: (typeof accountRow)[]; error: null }) => void) | undefined
    let resolveNew: ((value: { data: (typeof accountRow)[]; error: null }) => void) | undefined
    const pending = [
      new Promise<{ data: (typeof accountRow)[]; error: null }>((resolve) => {
        resolveOld = resolve
      }),
      new Promise<{ data: (typeof accountRow)[]; error: null }>((resolve) => {
        resolveNew = resolve
      }),
    ]
    let call = 0
    supabase.from = vi.fn().mockImplementation(() => ({
      select: vi.fn(() => pending[call++]),
    }))

    const older = useAccountsStore.getState().load()
    const newer = useAccountsStore.getState().load()

    resolveNew!({ data: [{ ...accountRow, id: 'account-new', user_id: 'user-a' }], error: null })
    await newer
    resolveOld!({ data: [accountRow], error: null })
    await older

    expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['account-new'])
    expect(useAccountsStore.getState().loading).toBe(false)
  })

  it('discards a delayed recurring-transactions load after reset', async () => {
    const recurringRow = {
      id: 'recurring-a',
      user_id: 'user-a',
      name: 'Rent',
      amount: 1200,
      type: 'expense',
      frequency: 'monthly',
      is_active: true,
      account_id: 'account-a',
      category_id: null,
      day_of_month: 1,
      start_date: '2026-01-01T00:00:00.000Z',
      end_date: null,
      next_date: '2026-02-01T00:00:00.000Z',
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    let resolveLoad: ((value: { data: (typeof recurringRow)[]; error: null }) => void) | undefined
    const delayed = new Promise<{ data: (typeof recurringRow)[]; error: null }>((resolve) => {
      resolveLoad = resolve
    })
    const chainable = {
      order: vi.fn(() => chainable),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onFulfilled: (v: any) => any) => delayed.then(onFulfilled),
    }
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(chainable),
    })

    const load = useRecurringTransactionsStore.getState().load()
    useRecurringTransactionsStore.getState().reset()
    resolveLoad!({ data: [recurringRow], error: null })
    await load

    expect(useRecurringTransactionsStore.getState().items).toEqual([])
    expect(useRecurringTransactionsStore.getState()._unsub).toBeNull()
  })
})
