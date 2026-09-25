import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Budgets from '@/pages/Budgets'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Budget, Transaction } from '@/types'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

const budgetFixture: Budget = {
  id: 'b1',
  name: 'Groceries',
  categoryIds: ['cat-1'],
  amount: 200,
  period: 'monthly',
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  createdAt: new Date(),
  updatedAt: new Date(),
}

function txnFixture(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    accountId: 'a1',
    categoryId: 'cat-1',
    type: 'expense',
    amount: 50,
    currency: 'USD',
    baseAmount: 50,
    baseCurrency: 'USD',
    fxRate: null,
    fxDate: null,
    baseAmountStale: false,
    date: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    _unsub: null,
    load: vi.fn().mockResolvedValue(undefined),
  })
  useBudgetsStore.setState({
    budgets: [],
    loading: false,
    error: null,
    _unsub: null,
    load: vi.fn().mockResolvedValue(undefined),
  })
  useCategoriesStore.setState({
    categories: [],
    loading: false,
    error: null,
    _unsub: null,
    load: vi.fn().mockResolvedValue(undefined),
  })
})

describe('Budgets page — unconverted currency notice', () => {
  it('shows no notice when all spend is convertible', () => {
    useBudgetsStore.setState({ budgets: [budgetFixture] })
    useCategoriesStore.setState({ categories: [] })
    useTransactionsStore.setState({
      transactions: [txnFixture({ currency: 'USD', baseCurrency: 'USD' })],
    })

    renderWithRouter(<Budgets />)
    return waitFor(() => {
      expect(screen.getByText('Budgets')).toBeInTheDocument()
      expect(screen.queryByText(/not yet converted to USD/)).not.toBeInTheDocument()
    })
  })

  it('counts unconverted transactions touching the budget and shows the notice', () => {
    useBudgetsStore.setState({ budgets: [budgetFixture] })
    useCategoriesStore.setState({ categories: [] })
    useTransactionsStore.setState({
      transactions: [
        // Inside the budget's period/categories but flagged stale → counted.
        txnFixture({
          id: 't1',
          currency: 'EUR',
          baseAmount: 50,
          baseCurrency: 'EUR',
          baseAmountStale: true,
        }),
        // Converted for the reporting currency → not counted.
        txnFixture({ id: 't2', currency: 'EUR', baseAmount: 30, baseCurrency: 'USD' }),
        // Matches no budget category → not counted even though stale.
        txnFixture({
          id: 't3',
          categoryId: 'cat-other',
          currency: 'EUR',
          baseAmount: 10,
          baseCurrency: 'EUR',
          baseAmountStale: true,
        }),
      ],
    })

    renderWithRouter(<Budgets />)
    return waitFor(() => {
      expect(screen.getByText(/1 transaction not yet converted to USD/)).toBeInTheDocument()
    })
  })
})

describe('Budgets page — total budget usage copy', () => {
  it('shows neutral copy when spend exactly equals the budget', async () => {
    useBudgetsStore.setState({ budgets: [budgetFixture] })
    useTransactionsStore.setState({
      transactions: [
        txnFixture({ id: 't1', amount: 120, baseAmount: 120 }),
        txnFixture({ id: 't2', amount: 80, baseAmount: 80 }),
      ],
    })

    renderWithRouter(<Budgets />)

    expect(await screen.findByText('$0 remaining across all budgets')).toBeInTheDocument()
    expect(screen.queryByText(/Over budget by/)).not.toBeInTheDocument()
  })

  it('keeps the over-budget copy when spend exceeds the budget', async () => {
    useBudgetsStore.setState({ budgets: [budgetFixture] })
    useTransactionsStore.setState({
      transactions: [txnFixture({ id: 't1', amount: 250, baseAmount: 250 })],
    })

    renderWithRouter(<Budgets />)

    expect(await screen.findByText('Over budget by $50')).toBeInTheDocument()
  })
})
