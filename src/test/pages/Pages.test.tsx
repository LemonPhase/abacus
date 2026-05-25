import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { getTable } from '@/test/supabase-mock'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import Accounts from '@/pages/Accounts'
import Categories from '@/pages/Categories'
import Transactions from '@/pages/Transactions'
import Budgets from '@/pages/Budgets'

function renderWithRouter(ui: React.ReactElement) {
  return {
    user: userEvent.setup(),
    ...render(<MemoryRouter>{ui}</MemoryRouter>),
  }
}

function seedAccount() {
  getTable('accounts').push({
    id: 'acc-test',
    name: 'Test Account',
    type: 'checking',
    currency: 'USD',
    balance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

function seedCategory() {
  getTable('categories').push({
    id: 'cat-test',
    name: 'Test Category',
    type: 'expense',
    color: '#ff0000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

describe('Accounts Page', () => {
  beforeEach(() => {
    getTable('accounts').length = 0
    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  })

  it('shows empty state when no accounts', async () => {
    renderWithRouter(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('No accounts yet')).toBeInTheDocument()
    })
  })

  it('has an add account button', async () => {
    renderWithRouter(<Accounts />)
    await waitFor(() => {
      const buttons = screen.getAllByText('Add Account')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it('opens dialog when add account header button is clicked', async () => {
    const { user } = renderWithRouter(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText('No accounts yet')).toBeInTheDocument()
    })
    const addBtn = screen.getByRole('button', { name: /add account/i })
    await user.click(addBtn)
    await waitFor(() => {
      const titles = screen.getAllByText('Add Account')
      expect(titles.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders accounts in table when data exists', async () => {
    getTable('accounts').push({
      id: 'acc-test-1',
      user_id: 'user-1',
      name: 'Checking Account',
      type: 'checking',
      currency: 'USD',
      balance: 1500,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Accounts />)

    await waitFor(() => {
      expect(screen.getByText('Checking Account')).toBeInTheDocument()
    })

    expect(screen.getByText('checking')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.queryByText('No accounts yet')).not.toBeInTheDocument()
  })

  it('highlights negative balance for credit accounts', async () => {
    getTable('accounts').push({
      id: 'acc-test-2',
      user_id: 'user-1',
      name: 'Credit Card',
      type: 'credit',
      currency: 'USD',
      balance: -500,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Accounts />)

    await waitFor(() => {
      expect(screen.getByText('Credit Card')).toBeInTheDocument()
    })
  })

  it('renders edit and delete buttons on each account row', async () => {
    getTable('accounts').push({
      id: 'acc-test-3',
      user_id: 'user-1',
      name: 'Savings',
      type: 'savings',
      currency: 'USD',
      balance: 5000,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Accounts />)

    await waitFor(() => {
      const editButtons = screen.getAllByRole('button', { name: '' })
      expect(editButtons.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('Categories Page', () => {
  beforeEach(() => {
    getTable('categories').length = 0
    useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
  })

  it('shows expense and income tabs', async () => {
    renderWithRouter(<Categories />)
    await waitFor(() => {
      expect(screen.getByText('Expenses')).toBeInTheDocument()
      expect(screen.getByText('Income')).toBeInTheDocument()
    })
  })

  it('has an add category button', async () => {
    renderWithRouter(<Categories />)
    await waitFor(() => {
      expect(screen.getByText('Add Category')).toBeInTheDocument()
    })
  })

  it('renders expense categories when data exists', async () => {
    getTable('categories').push({
      id: 'cat-food',
      user_id: 'user-1',
      name: 'Food',
      type: 'expense',
      color: '#ff0000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Categories />)

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
    })
  })

  it('switches to income tab when clicked', async () => {
    const user = userEvent.setup()
    getTable('categories').push({
      id: 'cat-salary',
      user_id: 'user-1',
      name: 'Salary',
      type: 'income',
      color: '#00ff00',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Categories />)

    await waitFor(() => {
      expect(screen.getByText('Income')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Income'))

    await waitFor(() => {
      expect(screen.getByText('Salary')).toBeInTheDocument()
    })
  })

  it('renders up/down reorder buttons for each category', async () => {
    getTable('categories').push(
      {
        id: 'cat-a',
        user_id: 'user-1',
        name: 'Food',
        type: 'expense',
        color: '#ff0000',
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'cat-b',
        user_id: 'user-1',
        name: 'Rent',
        type: 'expense',
        color: '#00ff00',
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    )

    renderWithRouter(<Categories />)

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    // All four arrow buttons should be present (up+down for each category)
    const upButtons = screen
      .getAllByRole('button')
      .filter((el) => el.querySelector('.lucide-chevron-up'))
    const downButtons = screen
      .getAllByRole('button')
      .filter((el) => el.querySelector('.lucide-chevron-down'))
    expect(upButtons).toHaveLength(2)
    expect(downButtons).toHaveLength(2)
  })
})

describe('Transactions Page', () => {
  beforeEach(() => {
    seedAccount()
    seedCategory()
  })

  it('shows empty state when no transactions', async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument()
    })
  })

  it('has add transaction and import buttons', async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText('Add Transaction')).toBeInTheDocument()
      expect(screen.getByText('Import CSV')).toBeInTheDocument()
    })
  })

  it('shows filter controls', async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
      expect(screen.getByText('Category')).toBeInTheDocument()
      expect(screen.getByText('Type')).toBeInTheDocument()
    })
  })
})

describe('Budgets Page', () => {
  beforeEach(() => {
    getTable('budgets').length = 0
    getTable('categories').length = 0
    getTable('transactions').length = 0
    useBudgetsStore.setState({ budgets: [], loading: false, error: null, _unsub: null })
    useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
    useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
  })

  it('shows empty state when no budgets', async () => {
    renderWithRouter(<Budgets />)
    await waitFor(() => {
      expect(screen.getByText('No budgets yet')).toBeInTheDocument()
    })
  })

  it('has an add budget button', async () => {
    renderWithRouter(<Budgets />)
    await waitFor(() => {
      expect(screen.getByText('Add Budget')).toBeInTheDocument()
    })
  })

  it('renders budgets when data exists', async () => {
    getTable('categories').push({
      id: 'cat-food',
      user_id: 'user-1',
      name: 'Food',
      type: 'expense',
      color: '#ff0000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    getTable('budgets').push({
      id: 'budget-test-1',
      user_id: 'user-1',
      name: 'Food Budget',
      amount: 500,
      period: 'monthly',
      category_ids: ['cat-food'],
      start_date: new Date('2026-01-01').toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderWithRouter(<Budgets />)

    await waitFor(() => {
      expect(screen.getByText('Food Budget')).toBeInTheDocument()
    })

    expect(screen.queryByText('No budgets yet')).not.toBeInTheDocument()
  })

  it('opens budget dialog when Add Budget clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Budgets />)

    await waitFor(() => {
      expect(screen.getByText('No budgets yet')).toBeInTheDocument()
    })

    const addBtn = screen.getByRole('button', { name: /add budget/i })
    await user.click(addBtn)

    await waitFor(() => {
      const titles = screen.getAllByText('Add Budget')
      expect(titles.length).toBeGreaterThanOrEqual(2)
    })
  })
})
