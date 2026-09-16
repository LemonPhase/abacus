import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '@/pages/Dashboard'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchBudgetSpending, fetchCategoryBreakdown, fetchMonthlySeries } from '@/services/reports'

vi.mock('@/services/reports', () => ({
  fetchMonthlySeries: vi.fn().mockResolvedValue([]),
  fetchCategoryBreakdown: vi.fn().mockResolvedValue([]),
  fetchBudgetSpending: vi.fn().mockResolvedValue([]),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
  vi.mocked(fetchMonthlySeries).mockResolvedValue([])
  vi.mocked(fetchCategoryBreakdown).mockResolvedValue([])
  vi.mocked(fetchBudgetSpending).mockResolvedValue([])
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

  it('kicks off data loading on mount: stores paged, aggregates via RPCs', async () => {
    const loadAccounts = vi.spyOn(useAccountsStore.getState(), 'load').mockResolvedValue()
    const loadTransactions = vi.spyOn(useTransactionsStore.getState(), 'load').mockResolvedValue()

    renderWithRouter(<Dashboard />)

    await waitFor(() => {
      expect(loadAccounts).toHaveBeenCalled()
      // Only page 1 is needed locally (recent transactions); charts aggregate in DB.
      expect(loadTransactions).toHaveBeenCalledWith({ limit: 50 })
      expect(fetchMonthlySeries).toHaveBeenCalled()
      expect(fetchCategoryBreakdown).toHaveBeenCalled()
      expect(fetchBudgetSpending).toHaveBeenCalled()
    })

    loadAccounts.mockRestore()
    loadTransactions.mockRestore()
  })

  it('renders aggregate values from the report RPCs', async () => {
    // Last six calendar months ending in the CURRENT month (dashboard skeleton).
    const now = new Date()
    const months: { month: string; income: number; expense: number; unconverted: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      months.push({
        month: key,
        income: i === 0 ? 5000 : 0,
        expense: i === 0 ? 1850 : 0,
        unconverted: i === 0 ? 2 : 0,
      })
    }
    vi.mocked(fetchMonthlySeries).mockResolvedValue(months)
    vi.mocked(fetchCategoryBreakdown).mockResolvedValue([
      { categoryId: 'c1', name: 'Rent', color: '#fff', icon: null, income: 0, expense: 1500 },
      { categoryId: 'c2', name: 'Groceries', color: '#fff', icon: null, income: 0, expense: 350 },
    ])
    vi.mocked(fetchBudgetSpending).mockResolvedValue([
      { id: 'b1', name: 'Monthly Essentials', amount: 2000, period: 'monthly', spent: 1850 },
    ])

    renderWithRouter(<Dashboard />)

    // Current-month income/expense stat cards come from the monthly RPC row.
    await waitFor(() => {
      expect(screen.getByText('$5,000')).toBeInTheDocument()
      expect(screen.getByText('$1,850')).toBeInTheDocument()
    })
    // Category pie legend.
    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    // Budget card shows the budget name and the remaining total (2000 - 1850 = 150).
    expect(screen.getByText('Monthly Essentials')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
    // Unconverted notice from the RPC counts.
    expect(screen.getByText(/2 transactions not yet converted/)).toBeInTheDocument()
  })

  it('shows the error when an aggregate RPC fails', async () => {
    vi.mocked(fetchMonthlySeries).mockRejectedValue(new Error('RPC exploded'))

    renderWithRouter(<Dashboard />)

    await waitFor(() => {
      expect(screen.getByText('RPC exploded')).toBeInTheDocument()
    })
  })
})
