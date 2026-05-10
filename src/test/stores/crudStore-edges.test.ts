import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAccountsStore } from '@/stores/accountsStore'
import { supabase } from '@/supabase/client'

describe('CrudStore Edge Cases', () => {
  beforeEach(() => {
    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  })

  it('load with limit option passes limit to builder', async () => {
    const limitFn = vi.fn().mockReturnValue({ data: [], error: null })
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: limitFn,
      }),
    })

    const store = useAccountsStore.getState()
    await store.load({ limit: 5 })

    expect(limitFn).toHaveBeenCalledWith(5)
  })

  it('load with limit and offset calls range', async () => {
    const rangeFn = vi.fn().mockReturnValue({ data: [], error: null })
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn(),
        range: rangeFn,
      }),
    })

    const store = useAccountsStore.getState()
    await store.load({ limit: 10, offset: 20 })

    expect(rangeFn).toHaveBeenCalledWith(20, 29)
  })

  it('load without options does not call limit or range', async () => {
    const limitFn = vi.fn()
    const rangeFn = vi.fn()
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: limitFn,
        range: rangeFn,
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }),
    })

    const store = useAccountsStore.getState()
    await store.load()

    expect(limitFn).not.toHaveBeenCalled()
    expect(rangeFn).not.toHaveBeenCalled()
  })

  it('sets error on update failure', async () => {
    supabase.from = vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Update denied' } }),
      }),
    })

    // Seed an account first so there's data
    useAccountsStore.setState({
      accounts: [
        {
          id: 'acc-1',
          name: 'Test',
          type: 'checking',
          currency: 'USD',
          balance: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })

    const store = useAccountsStore.getState()
    await expect(store.update('acc-1', { name: 'New', balance: 100 })).rejects.toThrow()

    expect(useAccountsStore.getState().error).toBe('Update denied')
  })

  it('sets error on remove failure', async () => {
    supabase.from = vi.fn().mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'Remove denied' } }),
      }),
    })

    const store = useAccountsStore.getState()
    await expect(store.remove('acc-1')).rejects.toThrow()

    expect(useAccountsStore.getState().error).toBe('Remove denied')
  })

  it('unsubscribe calls stored unsub handler and clears it', () => {
    const unsubFn = vi.fn()
    useAccountsStore.setState({ _unsub: unsubFn })

    useAccountsStore.getState().unsubscribe()

    expect(unsubFn).toHaveBeenCalled()
    expect(useAccountsStore.getState()._unsub).toBeNull()
  })

  it('clearError clears error state', () => {
    useAccountsStore.setState({ error: 'Some error' })
    useAccountsStore.getState().clearError()
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it('load subscribes to realtime when no existing subscription', async () => {
    const subscribeFn = vi.fn(() => ({ unsubscribe: vi.fn() }))
    const onFn = vi.fn().mockReturnValue({ subscribe: subscribeFn })

    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      }),
    })
    supabase.channel = vi.fn().mockReturnValue({
      on: onFn,
      subscribe: subscribeFn,
    })

    const store = useAccountsStore.getState()
    await store.load()

    expect(supabase.channel).toHaveBeenCalled()
    expect(useAccountsStore.getState()._unsub).toBeDefined()
  })
})
