import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'
import { getTable, resetAllTables } from '@/test/supabase-mock'

const mockSignOut = vi.fn()

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

describe('Settings import — legacy export restore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
    mockSignOut.mockClear()
    resetAllTables()
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

  it('restores a legacy (version 2) export without zeroing balances', async () => {
    await importFile({
      version: 2,
      exportedAt: '2026-01-01T00:00:00.000Z',
      accounts: [
        {
          id: 'acc-1',
          user_id: 'mock-user',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          balance: 1234,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          user_id: 'mock-user',
          account_id: 'acc-1',
          type: 'income',
          amount: 50,
          currency: 'USD',
          date: '2026-01-02',
        },
        {
          id: 'tx-2',
          user_id: 'mock-user',
          account_id: 'acc-1',
          type: 'expense',
          amount: 30,
          currency: 'USD',
          date: '2026-01-03',
        },
      ],
    })

    const account = getTable('accounts')[0]
    // effects = +50 - 30 = 20 → opening = 1234 - 20 = 1214
    expect(account.opening_balance).toBe(1214)
    // balance fully restored, not zeroed by the INSERT trigger
    expect(account.balance).toBe(1234)
    // the post-import reload reflects the restored balance in the store
    expect(useAccountsStore.getState().accounts[0]?.balance).toBe(1234)
  })

  it('preserves opening_balance for exports that already carry it', async () => {
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
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          user_id: 'mock-user',
          account_id: 'acc-1',
          type: 'income',
          amount: 20,
          currency: 'USD',
          date: '2026-01-02',
        },
      ],
    })

    const account = getTable('accounts')[0]
    expect(account.opening_balance).toBe(700)
    expect(account.balance).toBe(720)
  })
})
