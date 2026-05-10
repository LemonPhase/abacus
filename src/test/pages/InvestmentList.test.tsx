import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { InvestmentList } from '@/pages/investments/InvestmentList'
import { INVESTMENT_TYPE_LABELS } from '@/pages/investments/constants'
import { calculateProjection, formatInvestmentValue } from '@/lib/investments'
import type { InvestmentPlan } from '@/types'

function makePlan(overrides: Partial<InvestmentPlan> = {}): InvestmentPlan {
  return {
    id: 'p1',
    name: 'Index Fund',
    type: 'index_fund',
    initialAmount: 10000,
    monthlyContribution: 500,
    annualReturnRate: 7,
    currency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function renderList({
  plans = [makePlan()],
  horizonYears = 10,
  baseCurrency = 'USD',
  onEdit = vi.fn(),
  onDelete = vi.fn(),
}: {
  plans?: InvestmentPlan[]
  horizonYears?: number
  baseCurrency?: string
  onEdit?: (plan: InvestmentPlan) => void
  onDelete?: (plan: InvestmentPlan) => void
} = {}) {
  return {
    onEdit,
    onDelete,
    ...render(
      <InvestmentList
        plans={plans}
        horizonYears={horizonYears}
        baseCurrency={baseCurrency}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    ),
  }
}

describe('InvestmentList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders plan name in table', () => {
    renderList({ plans: [makePlan({ name: 'S&P 500' })] })
    expect(screen.getByText('S&P 500')).toBeInTheDocument()
  })

  it('renders investment type as a Badge with correct label', () => {
    renderList({ plans: [makePlan({ name: 'My Plan', type: 'fixed_income' })] })
    // The label "Fixed Income" only appears in the Badge (not in the plan name)
    expect(screen.getByText(INVESTMENT_TYPE_LABELS.fixed_income)).toBeInTheDocument()
  })

  it('renders initial amount formatted as currency', () => {
    renderList({ plans: [makePlan({ initialAmount: 10000 })] })
    const expected = formatInvestmentValue(10000, 'USD')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('renders monthly contribution formatted', () => {
    renderList({ plans: [makePlan({ monthlyContribution: 500 })] })
    const expected = formatInvestmentValue(500, 'USD')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('renders annual return rate with % sign', () => {
    renderList({ plans: [makePlan({ annualReturnRate: 7 })] })
    expect(screen.getByText('7%')).toBeInTheDocument()
  })

  it('renders projected value after horizon years', () => {
    const plan = makePlan()
    const horizonYears = 10
    renderList({ plans: [plan], horizonYears })

    const proj = calculateProjection(plan, horizonYears)
    const final = proj[proj.length - 1]
    const expected = formatInvestmentValue(final.totalValue, 'USD')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('shows column header "After Xy" where X is horizonYears', () => {
    renderList({ horizonYears: 10 })
    expect(screen.getByText('After 10y')).toBeInTheDocument()
  })

  it('renders edit button', () => {
    renderList()
    const table = document.querySelector('table')!
    // The edit button renders with a Pencil icon (first button in the row)
    const buttons = table.querySelectorAll('button')
    expect(buttons.length).toBe(2) // edit + delete
  })

  it('renders delete button', () => {
    renderList()
    const table = document.querySelector('table')!
    const buttons = table.querySelectorAll('button')
    expect(buttons.length).toBe(2)
  })

  it('clicking edit calls onEdit with the plan', async () => {
    const user = userEvent.setup()
    const plan = makePlan()
    const onEdit = vi.fn()
    renderList({ plans: [plan], onEdit })

    const row = document.querySelector('table tbody tr')!
    const editBtn = row.querySelectorAll('button')[0]
    await user.click(editBtn)

    expect(onEdit).toHaveBeenCalledWith(plan)
  })

  it('clicking delete calls onDelete with the plan', async () => {
    const user = userEvent.setup()
    const plan = makePlan()
    const onDelete = vi.fn()
    renderList({ plans: [plan], onDelete })

    const row = document.querySelector('table tbody tr')!
    const deleteBtn = row.querySelectorAll('button')[1]
    await user.click(deleteBtn)

    expect(onDelete).toHaveBeenCalledWith(plan)
  })

  it('renders table headers: Name, Type, Initial, Monthly, Return/yr, After Xy', () => {
    renderList({ horizonYears: 15 })
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Initial')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
    expect(screen.getByText('Return/yr')).toBeInTheDocument()
    expect(screen.getByText('After 15y')).toBeInTheDocument()
  })

  it('renders multiple plans in separate rows', () => {
    renderList({
      plans: [makePlan({ id: 'p1', name: 'Plan A' }), makePlan({ id: 'p2', name: 'Plan B' })],
    })
    expect(screen.getByText('Plan A')).toBeInTheDocument()
    expect(screen.getByText('Plan B')).toBeInTheDocument()
    const rows = document.querySelectorAll('table tbody tr')
    expect(rows.length).toBe(2)
  })

  it('plans with zero initial and contribution show $0 values', () => {
    renderList({
      plans: [makePlan({ initialAmount: 0, monthlyContribution: 0 })],
    })
    const zeroVal = formatInvestmentValue(0, 'USD')
    // The zero values should appear for initial and monthly
    const zeroCells = screen.getAllByText(zeroVal)
    expect(zeroCells.length).toBeGreaterThanOrEqual(2)
  })
})
