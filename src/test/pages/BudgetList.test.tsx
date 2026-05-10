import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BudgetList } from '@/pages/budgets/BudgetList'
import { formatCurrency } from '@/lib/currency'
import type { Budget, BudgetPeriod } from '@/types'

interface BudgetProgress {
  spent: number
  percentage: number
  status: 'good' | 'warning' | 'danger' | 'over'
}

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

function makeProgress(overrides: Partial<BudgetProgress> = {}): BudgetProgress {
  return { spent: 250, percentage: 50, status: 'good', ...overrides }
}

const mockGetPeriodLabel = (_date: Date, period: BudgetPeriod) => `Period: ${period}`
const mockGetCategoryName = (id: string) => `Category ${id}`
const mockComputeProgress = vi.fn().mockReturnValue(makeProgress())

function renderList({
  budgets = [makeBudget()],
  baseCurrency = 'USD',
  getPeriodLabel = mockGetPeriodLabel,
  getCategoryName = mockGetCategoryName,
  computeProgress = mockComputeProgress,
  onEdit = vi.fn(),
  onDelete = vi.fn(),
} = {}) {
  return {
    onEdit,
    onDelete,
    ...render(
      <BudgetList
        budgets={budgets}
        baseCurrency={baseCurrency}
        getPeriodLabel={getPeriodLabel}
        getCategoryName={getCategoryName}
        computeProgress={computeProgress as (budget: Budget) => BudgetProgress}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    ),
  }
}

describe('BudgetList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders budget name in the card', () => {
    renderList({ budgets: [makeBudget({ name: 'Groceries' })] })
    expect(screen.getByText('Groceries')).toBeInTheDocument()
  })

  it('renders category names (via getCategoryName)', () => {
    renderList({
      budgets: [makeBudget({ categoryIds: ['cat-food', 'cat-dining'] })],
    })
    // The category text is inside a <p> with more content, so use a substring match
    expect(screen.getByText(/Category cat-food, Category cat-dining/)).toBeInTheDocument()
  })

  it('renders period label (via getPeriodLabel)', () => {
    renderList()
    // The period text is inside a <p> with more content, so use a substring match
    expect(screen.getByText(/Period: monthly/)).toBeInTheDocument()
  })

  it('renders spent amount formatted as currency', () => {
    renderList({ baseCurrency: 'USD' })
    const spent = formatCurrency(250, 'USD')
    expect(screen.getByText(spent)).toBeInTheDocument()
  })

  it('renders "of" budget amount', () => {
    renderList({ budgets: [makeBudget({ amount: 500 })], baseCurrency: 'USD' })
    const ofAmount = `of ${formatCurrency(500, 'USD')}`
    expect(screen.getByText(ofAmount)).toBeInTheDocument()
  })

  it('shows percentage used', () => {
    renderList({
      computeProgress: vi.fn().mockReturnValue(makeProgress({ percentage: 42 })),
    })
    expect(screen.getByText('42% used')).toBeInTheDocument()
  })

  it('shows "Over budget!" when percentage >= 100', () => {
    renderList({
      computeProgress: vi.fn().mockReturnValue(makeProgress({ percentage: 100, spent: 500 })),
    })
    expect(screen.getByText('Over budget!')).toBeInTheDocument()
  })

  it('shows "X left" when percentage < 100', () => {
    const budget = makeBudget({ amount: 500 })
    renderList({
      budgets: [budget],
      computeProgress: vi.fn().mockReturnValue(makeProgress({ spent: 150, percentage: 30 })),
      baseCurrency: 'USD',
    })
    const left = formatCurrency(500 - 150, 'USD')
    expect(screen.getByText(`${left} left`)).toBeInTheDocument()
  })

  it('renders edit and delete buttons', () => {
    renderList()
    // The buttons render with lucide icons (Pencil, Trash2) inside the card
    const card = document.querySelector('.rounded-xl')!
    const buttons = card.querySelectorAll('button')
    expect(buttons.length).toBe(2)
  })

  it('clicking edit calls onEdit with the budget', async () => {
    const user = userEvent.setup()
    const budget = makeBudget()
    const onEdit = vi.fn()
    renderList({ budgets: [budget], onEdit })

    const card = document.querySelector('.rounded-xl')!
    const editBtn = card.querySelectorAll('button')[0]
    await user.click(editBtn)

    expect(onEdit).toHaveBeenCalledWith(budget)
  })

  it('clicking delete calls onDelete with the budget', async () => {
    const user = userEvent.setup()
    const budget = makeBudget()
    const onDelete = vi.fn()
    renderList({ budgets: [budget], onDelete })

    const card = document.querySelector('.rounded-xl')!
    const deleteBtn = card.querySelectorAll('button')[1]
    await user.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledWith(budget)
  })

  it('renders multiple budgets (grid layout)', () => {
    renderList({
      budgets: [makeBudget({ id: 'b1', name: 'First' }), makeBudget({ id: 'b2', name: 'Second' })],
    })
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    const grid = document.querySelector('.grid')
    expect(grid).toBeInTheDocument()
  })

  it('uses correct status color for "good" status', () => {
    renderList({
      computeProgress: vi.fn().mockReturnValue(makeProgress({ status: 'good' })),
    })
    const spentText = screen.getByText(formatCurrency(250, 'USD'))
    expect(spentText).toHaveClass('text-jade')
  })

  it('uses correct status color for "warning" status', () => {
    renderList({
      computeProgress: vi
        .fn()
        .mockReturnValue(makeProgress({ status: 'warning', spent: 375, percentage: 75 })),
    })
    const spentText = screen.getByText(formatCurrency(375, 'USD'))
    expect(spentText).toHaveClass('text-amber-600')
  })

  it('uses correct status color for "danger" status', () => {
    renderList({
      computeProgress: vi
        .fn()
        .mockReturnValue(makeProgress({ status: 'danger', spent: 450, percentage: 90 })),
    })
    const spentText = screen.getByText(formatCurrency(450, 'USD'))
    expect(spentText).toHaveClass('text-orange-600')
  })

  it('uses correct status color for "over" status', () => {
    renderList({
      computeProgress: vi
        .fn()
        .mockReturnValue(makeProgress({ status: 'over', spent: 500, percentage: 100 })),
    })
    const spentText = screen.getByText(formatCurrency(500, 'USD'))
    expect(spentText).toHaveClass('text-cinnabar')
  })

  it('progress bar width matches percentage', () => {
    renderList({
      computeProgress: vi.fn().mockReturnValue(makeProgress({ percentage: 50 })),
    })
    const progressBar = document.querySelector<HTMLElement>('[style*="width:"]')
    expect(progressBar).toHaveStyle({ width: '50%' })
  })

  it('progress bar width is capped at 100%', () => {
    renderList({
      computeProgress: vi.fn().mockReturnValue(makeProgress({ percentage: 150 })),
    })
    const progressBar = document.querySelector<HTMLElement>('[style*="width:"]')
    expect(progressBar).toHaveStyle({ width: '100%' })
  })
})
