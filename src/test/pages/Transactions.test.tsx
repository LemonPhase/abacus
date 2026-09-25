import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Transactions from '@/pages/Transactions'
import { TransactionFilters } from '@/pages/transactions/TransactionFilters'
import { TransactionDialog } from '@/pages/transactions/TransactionDialog'
import { CsvImportDialog } from '@/pages/transactions/CsvImportDialog'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Account, Category, Transaction } from '@/types'

function RoutePath() {
  return <output data-testid="pathname">{useLocation().pathname}</output>
}

function renderWithRouter(ui: React.ReactElement, route = '/app/transactions') {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={[route]}>
        {ui}
        <RoutePath />
      </MemoryRouter>,
    ),
  }
}

const accountFixture: Account = {
  id: 'acc-1',
  name: 'Checking',
  type: 'checking',
  currency: 'USD',

  openingBalance: 0,
  balance: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const categoryFixture: Category = {
  id: 'cat-1',
  name: 'Groceries',
  type: 'expense',
  color: '#ff0000',
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function txFixture(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    categoryId: 'cat-1',
    type: 'expense',
    amount: 10,
    currency: 'USD',
    baseAmount: 10,
    baseCurrency: 'USD',
    fxRate: null,
    fxDate: null,
    baseAmountStale: false,
    date: new Date('2026-05-01'),
    description: 'Test row',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    total: null,
    grandTotal: null,
    _unsub: null,
  })
  useRecurringTransactionsStore.setState({ items: [], loading: false, error: null, _unsub: null })
})

describe('Transactions Page', () => {
  it('mounts and opens the add transaction dialog', async () => {
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))

    expect(await screen.findByLabelText(/Amount/)).toBeInTheDocument()
  })

  it('opens the CSV import dialog', async () => {
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    await user.click(screen.getByRole('button', { name: 'Import CSV' }))

    expect(await screen.findByText('Click to upload a CSV file')).toBeInTheDocument()
  })

  it('renders the recurring view when the Recurring segment is selected', async () => {
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    await user.click(screen.getByRole('tab', { name: 'Recurring' }))

    expect(await screen.findByText('No recurring transactions')).toBeInTheDocument()
    expect(screen.getByTestId('pathname')).toHaveTextContent('/app/recurring')
    expect(screen.getByRole('button', { name: 'Add Recurring' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'All' }))
    expect(screen.getByTestId('pathname')).toHaveTextContent('/app/transactions')
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the recurring view for the /app/recurring deep link', async () => {
    renderWithRouter(<Transactions />, '/app/recurring')

    expect(await screen.findByText('No recurring transactions')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Recurring' })).toHaveAttribute('aria-selected', 'true')
  })

  it('count line shows displayed rows of the unfiltered grand total', async () => {
    useTransactionsStore.setState({
      // Two rows on screen while the table holds three — e.g. one filtered out.
      transactions: [txFixture({ id: 'tx-1' }), txFixture({ id: 'tx-2', description: 'Other' })],
      total: 2,
      grandTotal: 3,
      load: vi.fn().mockResolvedValue(undefined),
      loadMore: vi.fn().mockResolvedValue(undefined),
    })

    renderWithRouter(<Transactions />)

    expect(await screen.findByText('Showing 2 of 3 transactions')).toBeInTheDocument()
  })
})

describe('TransactionFilters', () => {
  it('shows clear filters when active and calls onClear', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionFilters
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        value={{ account: 'all', category: 'all', type: 'all', dateFrom: '2026-05-01', dateTo: '' }}
        onChange={vi.fn()}
        onClear={onClear}
      />,
    )

    const clearButton = screen.getByRole('button', { name: 'Clear filters' })
    await user.click(clearButton)

    expect(onClear).toHaveBeenCalled()
  })

  it('notifies onChange when dates change', () => {
    const onChange = vi.fn()
    render(
      <TransactionFilters
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        value={{ account: 'all', category: 'all', type: 'all', dateFrom: '2026-05-01', dateTo: '' }}
        onChange={onChange}
        onClear={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('2026-05-01'), { target: { value: '2026-05-02' } })

    expect(onChange).toHaveBeenCalledWith({
      account: 'all',
      category: 'all',
      type: 'all',
      dateFrom: '2026-05-02',
      dateTo: '',
    })
  })
})

describe('TransactionDialog', () => {
  /** Label text content (including the required marker) for the label matching `name`. */
  function labelText(name: RegExp) {
    return screen.getByText(name, { selector: 'label' }).textContent ?? ''
  }

  it('disables save when required fields are missing', () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: '',
          categoryId: '',
          type: 'expense',
          amount: '',
          date: '2026-05-01',
          description: '',
          toAccountId: '',
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeDisabled()
  })

  it('enables save without a category (category is optional)', () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: 'acc-1',
          categoryId: '',
          type: 'expense',
          amount: '12.34',
          date: '2026-05-01',
          description: '',
          toAccountId: '',
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeEnabled()
  })

  it('marks required fields with * and leaves optional fields unmarked', () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: 'acc-1',
          categoryId: '',
          type: 'expense',
          amount: '12.34',
          date: '2026-05-01',
          description: '',
          toAccountId: '',
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(labelText(/^Account/)).toContain('*')
    expect(labelText(/^Amount/)).toContain('*')
    expect(labelText(/^Type/)).not.toContain('*')
    expect(labelText(/^Category/)).not.toContain('*')
    expect(labelText(/^Date/)).not.toContain('*')
    expect(labelText(/^Description/)).not.toContain('*')
    // Decorative markers; requiredness is announced via aria-required.
    for (const mark of screen.getAllByText('*', { selector: 'span' })) {
      expect(mark).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.getByLabelText(/Amount/)).toHaveAttribute('aria-required', 'true')
  })

  it('marks the transfer destination as required only for transfers', () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: 'acc-1',
          categoryId: '',
          type: 'transfer',
          amount: '12.34',
          date: '2026-05-01',
          description: '',
          toAccountId: '',
        }}
        accounts={[accountFixture, { ...accountFixture, id: 'acc-2', name: 'Savings' }]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(labelText(/^Account \(To\)/)).toContain('*')
  })

  it('disables save for transfers when toAccountId is missing', () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: 'acc-1',
          categoryId: 'cat-1',
          type: 'transfer',
          amount: '100',
          date: '2026-05-01',
          description: '',
          toAccountId: '',
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeDisabled()
  })

  it('calls onSave when clicking Add Transaction', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: accountFixture.id,
          categoryId: categoryFixture.id,
          type: 'expense',
          amount: '12.34',
          date: '2026-05-01',
          description: 'Test',
          toAccountId: '',
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))

    expect(onSave).toHaveBeenCalled()
  })

  it('calls onSave with transfer data when clicking Add Transaction for transfer type', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: accountFixture.id,
          categoryId: categoryFixture.id,
          type: 'transfer',
          amount: '12.34',
          date: '2026-05-01',
          description: 'Transfer',
          toAccountId: 'acc-2',
        }}
        accounts={[accountFixture, { ...accountFixture, id: 'acc-2', name: 'Savings' }]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={onSave}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))

    expect(onSave).toHaveBeenCalled()
  })
})

describe('CsvImportDialog', () => {
  it('renders the upload step', () => {
    render(
      <CsvImportDialog
        open
        step="upload"
        headers={[]}
        rawRows={[]}
        mapping={{ date: '', description: '', amount: '', type: '' }}
        mappedRows={[]}
        accountId=""
        categoryId=""
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFileSelected={vi.fn()}
        onStepChange={vi.fn()}
        onMappingChange={vi.fn()}
        onMappedRowsChange={vi.fn()}
        onAccountChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onImport={vi.fn()}
      />,
    )

    expect(screen.getByText('Click to upload a CSV file')).toBeInTheDocument()
  })

  it('maps rows and advances to preview', async () => {
    const onMappedRowsChange = vi.fn()
    const onStepChange = vi.fn()
    const user = userEvent.setup()

    render(
      <CsvImportDialog
        open
        step="map"
        headers={['Date', 'Description', 'Amount', 'Type']}
        rawRows={[{ Date: '2026-05-01', Description: 'Coffee', Amount: '4.50', Type: 'expense' }]}
        mapping={{ date: 'Date', description: 'Description', amount: 'Amount', type: 'Type' }}
        mappedRows={[]}
        accountId=""
        categoryId=""
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFileSelected={vi.fn()}
        onStepChange={onStepChange}
        onMappingChange={vi.fn()}
        onMappedRowsChange={onMappedRowsChange}
        onAccountChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onImport={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Preview' }))

    expect(onMappedRowsChange).toHaveBeenCalledWith([
      {
        date: '2026-05-01',
        description: 'Coffee',
        amount: '4.50',
        type: 'expense',
      },
    ])
    expect(onStepChange).toHaveBeenCalledWith('preview')
  })
})
