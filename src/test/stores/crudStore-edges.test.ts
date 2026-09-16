import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAccountsStore } from '@/stores/accountsStore'
import { supabase } from '@/supabase/client'
import { unsubscribeAll } from '@/supabase/realtime'
import { chainableSelect } from '@/test/supabase-mock'

describe('CrudStore Edge Cases', () => {
  beforeEach(() => {
    unsubscribeAll()
    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  })

  function stubFrom(result: unknown) {
    const rangeFn = vi.fn(() => result)
    const selectFn = vi.fn(() => ({ order: vi.fn(() => ({ range: rangeFn })) }))
    supabase.from = vi.fn().mockReturnValue({ select: selectFn })
    return { rangeFn, selectFn }
  }

  it('paged load ranges the first page and requests the exact count', async () => {
    const { rangeFn, selectFn } = stubFrom({ data: [], error: null, count: 0 })

    await useAccountsStore.getState().load({ limit: 5 })

    expect(selectFn).toHaveBeenCalledWith('*', { count: 'exact' })
    expect(rangeFn).toHaveBeenCalledWith(0, 4)
    expect(useAccountsStore.getState().hasMore).toBe(false)
    expect(useAccountsStore.getState().total).toBe(0)
  })

  it('load with limit and offset ranges the requested window', async () => {
    const { rangeFn } = stubFrom({ data: [], error: null, count: 0 })

    await useAccountsStore.getState().load({ limit: 10, offset: 20 })

    expect(rangeFn).toHaveBeenCalledWith(20, 29)
  })

  it('load without options auto-pages through the full dataset', async () => {
    // First page is exactly one full page (max_rows cap), second is short.
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `a${i}`,
      name: `A${i}`,
      user_id: 'u',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }))
    const pages = [
      { data: fullPage, error: null, count: null },
      { data: [], error: null, count: null },
    ]
    let call = 0
    const rangeFn = vi.fn(() => pages[call++])
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn(() => ({
        order: vi.fn(() => ({ range: rangeFn })),
      })),
    })

    await useAccountsStore.getState().load()

    expect(rangeFn).toHaveBeenCalledTimes(2)
    expect(useAccountsStore.getState().accounts).toHaveLength(1000)
    expect(useAccountsStore.getState().hasMore).toBe(false)
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
          openingBalance: 0,
          balance: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    })

    const store = useAccountsStore.getState()
    await expect(store.update('acc-1', { name: 'New' })).rejects.toThrow()

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
      select: vi.fn().mockReturnValue(chainableSelect(Promise.resolve({ data: [], error: null }))),
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
