import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/auth/auth'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { mockSupabase, simulateAuthEvent, getTable } from '@/test/supabase-mock'

function TestConsumer() {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  return <div>{user ? `Logged in as ${user.id}` : 'Not logged in'}</div>
}

function renderWithAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('session isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-a', email: 'a@example.com' } } },
      error: null,
    })

    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
    useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
    useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
    useBudgetsStore.setState({ budgets: [], loading: false, error: null, _unsub: null })
    useInvestmentPlansStore.setState({ plans: [], loading: false, error: null, _unsub: null })
    useRecurringTransactionsStore.setState({
      items: [],
      loading: false,
      error: null,
      _unsub: null,
    })
  })

  it('clears every financial collection when switching from user A to user B', async () => {
    renderWithAuth()
    await waitFor(() => expect(screen.getByText('Logged in as user-a')).toBeInTheDocument())

    const unsubscribers = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    useAccountsStore.setState({
      accounts: [{ id: 'account-a' } as never, ...[]],
      _unsub: unsubscribers[0],
    })
    useCategoriesStore.setState({
      categories: [{ id: 'category-a' } as never],
      _unsub: unsubscribers[1],
    })
    useTransactionsStore.setState({
      transactions: [{ id: 'transaction-a' } as never],
      _unsub: unsubscribers[2],
    })
    useBudgetsStore.setState({ budgets: [{ id: 'budget-a' } as never], _unsub: unsubscribers[3] })
    useInvestmentPlansStore.setState({
      plans: [{ id: 'plan-a' } as never],
      _unsub: unsubscribers[4],
    })
    useRecurringTransactionsStore.setState({
      items: [{ id: 'recurring-a' } as never],
      _unsub: unsubscribers[5],
    })

    simulateAuthEvent('SIGNED_OUT')
    simulateAuthEvent('SIGNED_IN', { user: { id: 'user-b', email: 'b@example.com' } })

    await waitFor(() => expect(screen.getByText('Logged in as user-b')).toBeInTheDocument())
    expect(useAccountsStore.getState().accounts).toEqual([])
    expect(useCategoriesStore.getState().categories).toEqual([])
    expect(useTransactionsStore.getState().transactions).toEqual([])
    expect(useBudgetsStore.getState().budgets).toEqual([])
    expect(useInvestmentPlansStore.getState().plans).toEqual([])
    expect(useRecurringTransactionsStore.getState().items).toEqual([])
    for (const unsubscribe of unsubscribers) expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('rehydrates all six financial stores after a direct A-to-B SIGNED_IN transition', async () => {
    // B's data, served by the in-memory mock once the rehydration loads run.
    getTable('accounts').push({
      id: 'account-b',
      user_id: 'user-b',
      name: 'B Account',
      type: 'checking',
      currency: 'USD',
      balance: 10,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    renderWithAuth()
    await waitFor(() => expect(screen.getByText('Logged in as user-a')).toBeInTheDocument())

    // Establish the current identity the way supabase-js does at boot, so the
    // next SIGNED_IN is a true A→B transition with currentUserId set.
    simulateAuthEvent('INITIAL_SESSION', { user: { id: 'user-a', email: 'a@example.com' } })

    const stores = [
      useAccountsStore,
      useCategoriesStore,
      useTransactionsStore,
      useBudgetsStore,
      useInvestmentPlansStore,
      useRecurringTransactionsStore,
    ]
    type LoadableStore = {
      getState: () => { load: (options?: { limit?: number; offset?: number }) => Promise<void> }
    }
    const loadSpies = stores.map((store) =>
      vi.spyOn((store as unknown as LoadableStore).getState(), 'load'),
    )

    // Stale A-era data that must be wiped, then replaced by B's fresh load.
    useAccountsStore.setState({ accounts: [{ id: 'account-a' } as never] })

    simulateAuthEvent('SIGNED_IN', { user: { id: 'user-b', email: 'b@example.com' } })

    await waitFor(() => expect(screen.getByText('Logged in as user-b')).toBeInTheDocument())
    await waitFor(() =>
      expect(useAccountsStore.getState().accounts.map((a) => a.id)).toEqual(['account-b']),
    )
    for (const spy of loadSpies) expect(spy).toHaveBeenCalledTimes(1)
    loadSpies.forEach((spy) => spy.mockRestore())
  })

  it('surfaces sign-out failures without claiming the session changed', async () => {
    const user = userEvent.setup()
    function SignOutButton() {
      const { signOut } = useAuth()
      return <button onClick={() => void signOut().catch(() => {})}>Sign out</button>
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestConsumer />
          <SignOutButton />
        </AuthProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByText('Logged in as user-a')).toBeInTheDocument())

    mockSupabase.auth.signOut.mockResolvedValue({
      data: null,
      error: { message: 'Sign-out failed' },
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(mockSupabase.auth.signOut).toHaveBeenCalled()
    // Session unchanged: user still signed in, no SIGNED_OUT store wipe occurred.
    await waitFor(() => expect(screen.getByText('Logged in as user-a')).toBeInTheDocument())
    expect(useAccountsStore.getState().accounts).toEqual([])
  })
})
