import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RecurringTransactions from '@/pages/RecurringTransactions'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { getTable, resetAllTables, mockSupabase } from '@/test/supabase-mock'

function renderPage() {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter>
        <RecurringTransactions />
      </MemoryRouter>,
    ),
  }
}

function seedAccount() {
  getTable('accounts').push({
    id: 'acc-1',
    user_id: 'mock-user-id',
    name: 'Checking',
    type: 'checking',
    currency: 'USD',
    opening_balance: 1000,

    balance: 1000,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}

function seedCategory() {
  getTable('categories').push({
    id: 'cat-1',
    user_id: 'mock-user-id',
    name: 'Subscriptions',
    type: 'expense',
    parent_id: null,
    color: '#006b4d',
    icon: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}

describe('RecurringTransactions page', () => {
  beforeEach(() => {
    resetAllTables()
    useRecurringTransactionsStore.setState({
      items: [],
      loading: false,
      error: null,
      _unsub: null,
    })
    useAccountsStore.setState({
      accounts: [],
      loading: false,
      error: null,
      _unsub: null,
    })
    useCategoriesStore.setState({
      categories: [],
      loading: false,
      error: null,
      _unsub: null,
    })
  })

  it('renders empty state when no items', async () => {
    seedAccount()
    seedCategory()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No recurring transactions')).toBeInTheDocument()
    })
  })

  it('renders the Add Recurring button', async () => {
    seedAccount()
    seedCategory()
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Add Recurring')).toBeInTheDocument()
    })
  })

  it('opens add dialog on button click', async () => {
    seedAccount()
    seedCategory()
    const { user } = renderPage()
    await waitFor(() => {
      expect(screen.getByText('Add Recurring')).toBeInTheDocument()
    })
    await user.click(screen.getByText('Add Recurring'))
    expect(screen.getAllByText('Add Recurring Transaction').length).toBeGreaterThan(0)
  })

  it('renders table rows with description and frequency', async () => {
    seedAccount()
    seedCategory()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 15,
      currency: 'USD',
      description: 'Netflix',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 5,
      start_date: '2026-01-15',
      end_date: null,
      next_date: '2099-02-15',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })
    expect(screen.getByText(/Monthly/)).toBeInTheDocument()
  })

  it('shows paused label for inactive items', async () => {
    seedAccount()
    getTable('recurring_transactions').push({
      id: 'rt-2',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: null,
      type: 'income',
      amount: 5000,
      currency: 'USD',
      description: 'Salary',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 1,
      start_date: '2026-01-01',
      end_date: null,
      next_date: '2099-01-01',
      is_active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Paused')).toBeInTheDocument()
    })
  })

  it('shows Due now label for past-due items', async () => {
    seedAccount()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: null,
      type: 'expense',
      amount: 50,
      currency: 'USD',
      description: 'Rent',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 1,
      start_date: '2024-01-01',
      end_date: null,
      next_date: '2020-01-01',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Due now')).toBeInTheDocument()
    })
  })

  it('shows (day N) for monthly items with dayOfMonth', async () => {
    seedAccount()
    seedCategory()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 15,
      currency: 'USD',
      description: 'Netflix',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 5,
      start_date: '2026-01-15',
      end_date: null,
      next_date: '2099-02-15',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/day 5/)).toBeInTheDocument()
    })
  })

  it('preserves next_date when editing an unrelated field (issue #15)', async () => {
    seedAccount()
    seedCategory()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 15,
      currency: 'USD',
      description: 'Netflix',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 5,
      start_date: '2026-01-15',
      end_date: null,
      next_date: '2099-02-15',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const { user } = renderPage()
    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    const row = screen.getByText('Netflix').closest('tr') as HTMLElement
    await user.click(within(row).getByTitle('Edit'))
    const descInput = screen.getByDisplayValue('Netflix') as HTMLInputElement
    await user.clear(descInput)
    await user.type(descInput, 'Netflix Premium')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.getByText('Netflix Premium')).toBeInTheDocument()
    })

    const updated = getTable('recurring_transactions').find((r) => r.id === 'rt-1')
    expect(updated?.description).toBe('Netflix Premium')
    expect(updated?.next_date).toBe('2099-02-15')
  })

  it('re-anchors next_date when the start date moves', async () => {
    seedAccount()
    seedCategory()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 15,
      currency: 'USD',
      description: 'Netflix',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 5,
      start_date: '2026-01-15',
      end_date: null,
      next_date: '2099-02-15',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const { user } = renderPage()
    await waitFor(() => {
      expect(screen.getByText('Netflix')).toBeInTheDocument()
    })

    const row = screen.getByText('Netflix').closest('tr') as HTMLElement
    await user.click(within(row).getByTitle('Edit'))
    fireEvent.change(document.getElementById('rc-start') as HTMLInputElement, {
      target: { value: '2026-03-01' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.getByText(/Mar 1, 2026/)).toBeInTheDocument()
    })

    const updated = getTable('recurring_transactions').find((r) => r.id === 'rt-1')
    expect(updated?.next_date).toBe(new Date('2026-03-01').toISOString())
  })

  it('apply now goes through the DB engine RPC (issue #15)', async () => {
    seedAccount()
    seedCategory()
    getTable('recurring_transactions').push({
      id: 'rt-1',
      user_id: 'mock-user-id',
      account_id: 'acc-1',
      category_id: 'cat-1',
      type: 'expense',
      amount: 50,
      currency: 'USD',
      description: 'Rent',
      frequency: 'monthly',
      interval_value: 1,
      day_of_month: 1,
      start_date: '2024-01-01',
      end_date: null,
      next_date: '2020-01-01',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    mockSupabase.rpc.mockResolvedValue({ data: 1, error: null })

    const { user } = renderPage()
    await waitFor(() => {
      expect(screen.getByText('Rent')).toBeInTheDocument()
    })

    await user.click(screen.getByTitle('Apply now'))
    await user.click(screen.getByRole('button', { name: 'Apply Now' }))
    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'apply_recurring_occurrence',
        expect.objectContaining({
          p_recurring_id: 'rt-1',
          p_base_amount: 50,
          p_base_currency: 'USD',
          p_base_stale: false,
        }),
      )
    })
  })
})
