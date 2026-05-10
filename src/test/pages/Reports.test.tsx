import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from '@/pages/Reports'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
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
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
})

describe('Reports Page', () => {
  it('renders the report filters', () => {
    renderWithRouter(<Reports />)

    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('From')).toBeInTheDocument()
    expect(screen.getByText('To')).toBeInTheDocument()
  })

  it('shows empty state when there are no transactions', async () => {
    renderWithRouter(<Reports />)

    await waitFor(() => {
      expect(screen.getByText('No data for this period')).toBeInTheDocument()
      expect(
        screen.getByText('Try adjusting the date range or add some transactions first.'),
      ).toBeInTheDocument()
    })
  })

  it('loads data on mount', async () => {
    const loadAccounts = vi.spyOn(useAccountsStore.getState(), 'load').mockResolvedValue()
    const loadTransactions = vi.spyOn(useTransactionsStore.getState(), 'load').mockResolvedValue()
    const loadCategories = vi.spyOn(useCategoriesStore.getState(), 'load').mockResolvedValue()

    renderWithRouter(<Reports />)

    await waitFor(() => {
      expect(loadAccounts).toHaveBeenCalled()
      expect(loadTransactions).toHaveBeenCalled()
      expect(loadCategories).toHaveBeenCalled()
    })

    loadAccounts.mockRestore()
    loadTransactions.mockRestore()
    loadCategories.mockRestore()
  })
})
