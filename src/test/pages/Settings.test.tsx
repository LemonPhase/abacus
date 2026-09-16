import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/settingsStore'
import { mockSupabase, getTable, resetAllTables } from '@/test/supabase-mock'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'

const mockSignOut = vi.fn<(email?: string) => Promise<void>>().mockResolvedValue(undefined)

vi.mock('@/auth/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/auth/auth')
  return {
    ...actual,
    useAuth: () => ({ user: { email: 'test@example.com' }, signOut: mockSignOut }),
  }
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  mockSignOut.mockClear()
})

describe('Settings Page', () => {
  it('renders the main settings sections', () => {
    renderWithRouter(<Settings />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Base Currency')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Data Management')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows the import dialog empty state', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByText('Import Data'))
    expect(screen.getByText('Click to select a JSON export file')).toBeInTheDocument()
  })

  it('invokes sign out from the account section', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(mockSignOut).toHaveBeenCalled()
  })
})

describe('Settings identity-safe export/import', () => {
  // getSession re-reads this variable, so tests can flip the signed-in identity
  // while an export/import is in flight.
  let currentUser: string

  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
    mockSignOut.mockClear()
    currentUser = 'user-a'
    mockSupabase.auth.getSession.mockImplementation(async () => ({
      data: { session: { user: { id: currentUser } } },
      error: null,
    }))
  })

  it('aborts export and downloads nothing when the signed-in user changes mid-operation', async () => {
    let resolveSelect:
      | ((value: { data: Record<string, unknown>[]; error: null }) => void)
      | undefined
    const pending = new Promise<{ data: Record<string, unknown>[]; error: null }>((resolve) => {
      resolveSelect = resolve
    })
    const originalFrom = mockSupabase.from.getMockImplementation()
    mockSupabase.from.mockImplementation(() => ({ select: vi.fn(() => pending) }))

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByRole('button', { name: 'Export Data' }))
    // Identity flips while the table fetches are still in flight.
    await act(async () => {
      currentUser = 'user-b'
      resolveSelect!({ data: [], error: null })
    })

    await waitFor(() => expect(screen.getByText(/export aborted/i)).toBeInTheDocument())
    expect(click).not.toHaveBeenCalled()
    click.mockRestore()
    // Restore the real in-memory from() — mockClear only clears call history,
    // and a lingering stub would break every later test in this file.
    mockSupabase.from.mockImplementation(originalFrom!)
  })

  it('aborts import before the RPC when the signed-in user changes mid-operation', async () => {
    // B's existing data must survive the aborted import untouched.
    getTable('accounts').push({
      id: 'b-acct',
      user_id: 'user-b',
      name: 'B Account',
      type: 'checking',
      currency: 'USD',
      balance: 5,
      opening_balance: 5,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    let resolveText: ((value: string) => void) | undefined
    const pendingText = new Promise<string>((resolve) => {
      resolveText = resolve
    })
    const file = { text: () => pendingText } as unknown as File

    const user = userEvent.setup()
    renderWithRouter(<Settings />)
    await user.click(screen.getByText('Import Data'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    // Identity flips while the file is still being read, before the RPC.
    await act(async () => {
      currentUser = 'user-b'
      resolveText!(JSON.stringify({ version: 3, accounts: [{ id: 'evil' }], transactions: [] }))
    })

    await waitFor(() => expect(screen.getByText(/import aborted/i)).toBeInTheDocument())
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
    expect(getTable('accounts')).toHaveLength(1)
    expect(getTable('accounts')[0].id).toBe('b-acct')
  })
})

describe('Settings import — atomic restore via RPC', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
    mockSignOut.mockClear()
    resetAllTables()
    mockSupabase.auth.getSession.mockImplementation(async () => ({
      data: { session: { user: { id: 'mock-user' } } },
      error: null,
    }))
    useAccountsStore.setState({ accounts: [], loading: false, _unsub: null })
    useTransactionsStore.setState({ transactions: [], loading: false, _unsub: null })
    useBudgetsStore.setState({ budgets: [], loading: false, _unsub: null })
    useCategoriesStore.setState({ categories: [], loading: false, _unsub: null })
    useInvestmentPlansStore.setState({ plans: [], loading: false, _unsub: null })
  })

  async function importFile(data: unknown) {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)
    await user.click(screen.getByText('Import Data'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([JSON.stringify(data)], 'export.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText(/Import successful/)
  }

  it('calls the restore RPC with the payload and reloads all stores on success', async () => {
    // Simulate the RPC having restored data: the reload must pick it up.
    getTable('accounts').push({
      id: 'acc-1',
      user_id: 'mock-user',
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      opening_balance: 700,
      balance: 720,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accounts: 1,
        transactions: 0,
        categories: 0,
        budgets: 0,
        exchange_rates: 0,
        investment_plans: 0,
        recurring_transactions: 0,
      },
      error: null,
    })
    mockSupabase.rpc.mockImplementation(rpc)

    await importFile({
      version: 3,
      accounts: [
        {
          id: 'acc-1',
          user_id: 'mock-user',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          opening_balance: 700,
          balance: 720,
        },
      ],
      transactions: [],
    })

    expect(rpc).toHaveBeenCalledWith('restore_user_data', {
      p_payload: expect.objectContaining({ version: 3 }),
    })
    expect(screen.getByText(/Imported 1 accounts/)).toBeInTheDocument()
    expect(useAccountsStore.getState().accounts[0]?.balance).toBe(720)
  })

  it('shows the database error when the RPC fails', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'restore_user_data: payload must be a JSON object' },
    })

    const user = userEvent.setup()
    renderWithRouter(<Settings />)
    await user.click(screen.getByText('Import Data'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(
      [JSON.stringify({ version: 3, accounts: [], transactions: [] })],
      'export.json',
      {
        type: 'application/json',
      },
    )
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByText(/Import failed/)
    expect(screen.getByText(/payload must be a JSON object/)).toBeInTheDocument()
    // Nothing was reloaded into the stores.
    expect(useAccountsStore.getState().accounts).toHaveLength(0)
  })

  it('shows validation errors for malformed files without calling the RPC', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)
    await user.click(screen.getByText('Import Data'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(
      [
        JSON.stringify({
          version: 3,
          accounts: [],
          transactions: [{ id: 't', account_id: 'missing' }],
        }),
      ],
      'export.json',
      { type: 'application/json' },
    )
    fireEvent.change(input, { target: { files: [file] } })

    await screen.findByText(/Import failed/)
    expect(screen.getByText(/account_id not found in accounts/)).toBeInTheDocument()
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })
})
