import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
  useBudgetsStore.setState({ budgets: [], loading: false, error: null, _unsub: null })
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
})

describe('Dashboard Page', () => {
  it('renders the main sections', async () => {
    renderWithRouter(<Dashboard />)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Net Worth')).toBeInTheDocument()
      expect(screen.getByText('Income')).toBeInTheDocument()
      expect(screen.getByText('Expenses')).toBeInTheDocument()
      expect(screen.getByText('Budget Left')).toBeInTheDocument()
    })
  })

  it('shows empty states when no data is available', async () => {
    renderWithRouter(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('No transaction data yet')).toBeInTheDocument()
      expect(screen.getByText('No spending data this month')).toBeInTheDocument()
      expect(screen.getByText('No transactions yet')).toBeInTheDocument()
      expect(screen.getByText('No budgets yet')).toBeInTheDocument()
    })

    expect(screen.getAllByText('Add Transaction').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Create Budget' })).toBeInTheDocument()
  })

  it('kicks off data loading on mount', async () => {
    const loadAccounts = vi.spyOn(useAccountsStore.getState(), 'load').mockResolvedValue()
    const loadTransactions = vi.spyOn(useTransactionsStore.getState(), 'load').mockResolvedValue()
    const loadBudgets = vi.spyOn(useBudgetsStore.getState(), 'load').mockResolvedValue()
    const loadCategories = vi.spyOn(useCategoriesStore.getState(), 'load').mockResolvedValue()

    renderWithRouter(<Dashboard />)

    await waitFor(() => {
      expect(loadAccounts).toHaveBeenCalled()
      expect(loadTransactions).toHaveBeenCalled()
      expect(loadBudgets).toHaveBeenCalled()
      expect(loadCategories).toHaveBeenCalled()
    })

    loadAccounts.mockRestore()
    loadTransactions.mockRestore()
    loadBudgets.mockRestore()
    loadCategories.mockRestore()
  })
})
