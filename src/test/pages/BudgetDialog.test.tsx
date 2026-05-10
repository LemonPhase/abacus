import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BudgetDialog, type BudgetFormData } from '@/pages/budgets/BudgetDialog'
import type { Budget, Category } from '@/types'

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    categoryIds: ['cat-food'],
    name: 'Food Budget',
    amount: 500,
    period: 'monthly',
    startDate: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
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

const defaultForm: BudgetFormData = {
  name: '',
  categoryIds: [],
  amount: '',
  period: 'monthly',
  startDate: '',
}

function renderDialog({
  open = true,
  onOpenChange = vi.fn(),
  editing = null as Budget | null,
  form = defaultForm,
  onFormChange = vi.fn(),
  onToggleCategory = vi.fn(),
  onSave = vi.fn(),
  expenseCategories = [makeCategory()],
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  editing?: Budget | null
  form?: BudgetFormData
  onFormChange?: (form: BudgetFormData) => void
  onToggleCategory?: (id: string) => void
  onSave?: () => void
  expenseCategories?: Category[]
} = {}) {
  return {
    onOpenChange,
    onSave,
    onFormChange,
    onToggleCategory,
    ...render(
      <BudgetDialog
        open={open}
        onOpenChange={onOpenChange}
        editing={editing}
        form={form}
        onFormChange={onFormChange}
        onToggleCategory={onToggleCategory}
        onSave={onSave}
        expenseCategories={expenseCategories}
      />,
    ),
  }
}

describe('BudgetDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog with "Add Budget" title when editing is null', () => {
    renderDialog({ editing: null })
    // The title is an h2 heading; avoid matching the button also named "Add Budget"
    expect(screen.getByRole('heading', { name: 'Add Budget' })).toBeInTheDocument()
  })

  it('renders dialog with "Edit Budget" title when editing is provided', () => {
    renderDialog({ editing: makeBudget() })
    expect(screen.getByText('Edit Budget')).toBeInTheDocument()
  })

  it('renders name input', () => {
    renderDialog()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('renders period select', () => {
    renderDialog()
    // The SelectTrigger renders a button with role="combobox" containing the current value
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders amount input', () => {
    renderDialog()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
  })

  it('renders start date input', () => {
    renderDialog()
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
  })

  it('renders cancel button', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders "Add Budget" button when editing is null', () => {
    renderDialog({ editing: null })
    expect(screen.getByRole('button', { name: 'Add Budget' })).toBeInTheDocument()
  })

  it('renders "Save" button when editing is provided', () => {
    renderDialog({ editing: makeBudget() })
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    renderDialog({
      form: { ...defaultForm, name: '', amount: '100', categoryIds: ['cat-1'] },
    })
    expect(screen.getByRole('button', { name: 'Add Budget' })).toBeDisabled()
  })

  it('save button is disabled when amount is empty', () => {
    renderDialog({
      form: { ...defaultForm, name: 'test', amount: '', categoryIds: ['cat-1'] },
    })
    expect(screen.getByRole('button', { name: 'Add Budget' })).toBeDisabled()
  })

  it('save button is disabled when no categories are selected', () => {
    renderDialog({
      form: { ...defaultForm, name: 'test', amount: '100', categoryIds: [] },
    })
    expect(screen.getByRole('button', { name: 'Add Budget' })).toBeDisabled()
  })

  it('save button is enabled when all fields are filled', () => {
    renderDialog({
      form: { ...defaultForm, name: 'test', amount: '100', categoryIds: ['cat-1'] },
    })
    expect(screen.getByRole('button', { name: 'Add Budget' })).not.toBeDisabled()
  })

  it('renders category list for expense categories', () => {
    renderDialog({
      expenseCategories: [
        makeCategory({ id: 'cat-1', name: 'Groceries' }),
        makeCategory({ id: 'cat-2', name: 'Dining' }),
      ],
    })
    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Dining')).toBeInTheDocument()
  })

  it('shows checkbox for each category', () => {
    renderDialog({
      expenseCategories: [makeCategory({ id: 'cat-1', name: 'Groceries' })],
    })
    const checkboxes = document.querySelectorAll('[data-slot="checkbox"]')
    expect(checkboxes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows "No expense categories available" when expenseCategories is empty', () => {
    renderDialog({ expenseCategories: [] })
    expect(screen.getByText('No expense categories available.')).toBeInTheDocument()
  })

  it('shows category icon when category has icon property', () => {
    renderDialog({
      expenseCategories: [makeCategory({ icon: 'wallet' })],
    })
    // The Wallet icon renders as an SVG inside the category label
    const label = screen.getByText('Groceries').closest('label')!
    expect(label.querySelector('svg')).toBeInTheDocument()
  })

  it('shows color circle when category has no icon', () => {
    renderDialog({
      expenseCategories: [makeCategory({ icon: undefined })],
    })
    // Without an icon, the component renders a colored circle span
    const label = screen.getByText('Groceries').closest('label')!
    const circle = label.querySelector('span.rounded-full')
    expect(circle).toBeInTheDocument()
  })

  it('shows "Select at least one category" message when form has name and amount but no categories selected', () => {
    renderDialog({
      form: { ...defaultForm, name: 'test', amount: '100', categoryIds: [] },
    })
    expect(screen.getByText('Select at least one category.')).toBeInTheDocument()
  })

  it('does NOT show select-category message when name is empty', () => {
    renderDialog({
      form: { ...defaultForm, name: '', amount: '', categoryIds: [] },
    })
    expect(screen.queryByText('Select at least one category.')).not.toBeInTheDocument()
  })

  it('clicking Cancel calls onOpenChange(false)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog({ onOpenChange })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('clicking Save calls onSave', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    renderDialog({
      onSave,
      form: { ...defaultForm, name: 'test', amount: '100', categoryIds: ['cat-1'] },
    })

    await user.click(screen.getByRole('button', { name: 'Add Budget' }))

    expect(onSave).toHaveBeenCalled()
  })
})
