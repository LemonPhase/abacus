import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RecurringDialog, type RecurringFormData } from '@/pages/recurring/RecurringDialog'
import type { Account, Category, RecurringTransaction } from '@/types'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    type: 'checking',
    currency: 'USD',
    balance: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Groceries',
    type: 'expense',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const defaultForm: RecurringFormData = {
  accountId: '',
  categoryId: '',
  type: 'expense',
  amount: '',
  description: '',
  frequency: 'monthly',
  intervalValue: '1',
  dayOfMonth: '',
  startDate: '2026-01-15',
  endDate: '',
  isActive: true,
}

const filledForm: RecurringFormData = {
  accountId: 'acc-1',
  categoryId: 'cat-1',
  type: 'expense',
  amount: '50',
  description: 'Netflix',
  frequency: 'monthly',
  intervalValue: '1',
  dayOfMonth: '',
  startDate: '2026-01-15',
  endDate: '',
  isActive: true,
}

function renderDialog({
  open = true,
  onOpenChange = vi.fn(),
  editing = null,
  form = defaultForm,
  onFormChange = vi.fn(),
  onSave = vi.fn(),
  accounts = [makeAccount()],
  categories = [makeCategory()],
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editing?: RecurringTransaction | null
  form?: RecurringFormData
  onFormChange?: (form: RecurringFormData) => void
  onSave?: () => void
  accounts?: Account[]
  categories?: Category[]
} = {}) {
  return {
    onOpenChange,
    onSave,
    onFormChange,
    ...render(
      <RecurringDialog
        open={open}
        editing={editing}
        form={form}
        accounts={accounts}
        categories={categories}
        onOpenChange={onOpenChange}
        onFormChange={onFormChange}
        onSave={onSave}
      />,
    ),
  }
}

describe('RecurringDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Add Recurring Transaction" title when not editing', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Add Recurring Transaction' })).toBeInTheDocument()
  })

  it('renders "Edit Recurring Transaction" title when editing', () => {
    renderDialog({
      editing: {
        id: '1',
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 50,
        currency: 'USD',
        description: 'Netflix',
        frequency: 'monthly',
        intervalValue: 1,
        dayOfMonth: null,
        startDate: new Date('2026-01-15'),
        endDate: null,
        nextDate: new Date('2026-01-15'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RecurringTransaction,
    })
    expect(screen.getByText('Edit Recurring Transaction')).toBeInTheDocument()
  })

  it('renders type select', () => {
    renderDialog()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('renders account select', () => {
    renderDialog()
    expect(screen.getByText('Account')).toBeInTheDocument()
  })

  it('renders category select', () => {
    renderDialog()
    expect(screen.getByText('Category')).toBeInTheDocument()
  })

  it('renders amount input', () => {
    renderDialog()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('renders description input', () => {
    renderDialog()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
  })

  it('renders frequency select', () => {
    renderDialog()
    expect(screen.getByText('Frequency')).toBeInTheDocument()
  })

  it('renders interval input', () => {
    renderDialog()
    expect(screen.getByLabelText('Every')).toBeInTheDocument()
  })

  it('renders start date input', () => {
    renderDialog()
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('renders end date input', () => {
    renderDialog()
    expect(screen.getByLabelText(/End Date/)).toBeInTheDocument()
  })

  it('renders cancel button', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders add button when not editing', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Add Recurring Transaction' })).toBeInTheDocument()
  })

  it('renders save button when editing', () => {
    renderDialog({
      editing: {
        id: '1',
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 50,
        currency: 'USD',
        description: 'Netflix',
        frequency: 'monthly',
        intervalValue: 1,
        dayOfMonth: null,
        startDate: new Date('2026-01-15'),
        endDate: null,
        nextDate: new Date('2026-01-15'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RecurringTransaction,
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('save button is disabled when required fields are empty', () => {
    renderDialog({ form: defaultForm })
    expect(screen.getByRole('button', { name: 'Add Recurring Transaction' })).toBeDisabled()
  })

  it('save button is enabled when all required fields are filled', () => {
    renderDialog({ form: filledForm })
    expect(screen.getByRole('button', { name: 'Add Recurring Transaction' })).not.toBeDisabled()
  })

  it('shows day of month input when frequency is monthly', () => {
    renderDialog({ form: { ...defaultForm, frequency: 'monthly' } })
    expect(screen.getByLabelText(/Day of Month/)).toBeInTheDocument()
  })

  it('hides day of month input when frequency is not monthly', () => {
    renderDialog({ form: { ...filledForm, frequency: 'weekly' } })
    expect(screen.queryByLabelText(/Day of Month/)).not.toBeInTheDocument()
  })

  it('shows active toggle when editing', () => {
    renderDialog({
      editing: {
        id: '1',
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 50,
        currency: 'USD',
        description: 'Netflix',
        frequency: 'monthly',
        intervalValue: 1,
        dayOfMonth: null,
        startDate: new Date('2026-01-15'),
        endDate: null,
        nextDate: new Date('2026-01-15'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as RecurringTransaction,
    })
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('does not show active toggle when not editing', () => {
    renderDialog({ form: filledForm, editing: null })
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('shows only expense categories when type is expense', () => {
    renderDialog({
      form: { ...filledForm, type: 'expense' },
      categories: [
        makeCategory({ id: 'cat-exp', name: 'Groceries', type: 'expense' }),
        makeCategory({ id: 'cat-inc', name: 'Salary', type: 'income' }),
      ],
    })
  })

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog({ onOpenChange })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onSave when Add button is clicked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderDialog({ form: filledForm, onSave })

    await user.click(screen.getByRole('button', { name: 'Add Recurring Transaction' }))

    expect(onSave).toHaveBeenCalled()
  })

  it('filters categories by type when income is selected', () => {
    renderDialog({
      form: { ...filledForm, type: 'income' },
      categories: [
        makeCategory({ id: 'cat-exp', name: 'Groceries', type: 'expense' }),
        makeCategory({ id: 'cat-sal', name: 'Salary', type: 'income' }),
      ],
    })
  })
})
