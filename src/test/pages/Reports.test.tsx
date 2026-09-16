import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from '@/pages/Reports'
import { useSettingsStore } from '@/stores/settingsStore'
import { fetchCategoryBreakdown, fetchMonthlySeries, fetchReportSummary } from '@/services/reports'

vi.mock('@/services/reports', () => ({
  fetchReportSummary: vi
    .fn()
    .mockResolvedValue({ income: 0, expense: 0, unconverted: 0, total: 0 }),
  fetchMonthlySeries: vi.fn().mockResolvedValue([]),
  fetchCategoryBreakdown: vi.fn().mockResolvedValue([]),
}))

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  vi.mocked(fetchReportSummary).mockResolvedValue({
    income: 0,
    expense: 0,
    unconverted: 0,
    total: 0,
  })
  vi.mocked(fetchMonthlySeries).mockResolvedValue([])
  vi.mocked(fetchCategoryBreakdown).mockResolvedValue([])
})

describe('Reports Page', () => {
  it('renders the report filters', async () => {
    renderWithRouter(<Reports />)

    expect(screen.getByText('Reports')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('From')).toBeInTheDocument()
      expect(screen.getByText('To')).toBeInTheDocument()
    })
  })

  it('shows empty state when the period has no rows', async () => {
    renderWithRouter(<Reports />)

    await waitFor(() => {
      expect(screen.getByText('No data for this period')).toBeInTheDocument()
      expect(
        screen.getByText('Try adjusting the date range or add some transactions first.'),
      ).toBeInTheDocument()
    })
  })

  it('fetches aggregates on mount with the date range and reporting currency', async () => {
    renderWithRouter(<Reports />)

    await waitFor(() => {
      expect(fetchReportSummary).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'USD')
      expect(fetchMonthlySeries).toHaveBeenCalledTimes(1)
      expect(fetchCategoryBreakdown).toHaveBeenCalledTimes(1)
    })
  })

  it('refetches when the date range changes', async () => {
    renderWithRouter(<Reports />)

    await waitFor(() => expect(fetchReportSummary).toHaveBeenCalledTimes(1))

    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[1], { target: { value: '2026-06-30' } })

    await waitFor(() => expect(fetchReportSummary).toHaveBeenCalledTimes(2))
    expect(fetchReportSummary).toHaveBeenLastCalledWith(expect.any(String), '2026-06-30', 'USD')
  })

  it('renders summary cards, charts and category breakdown from RPC data', async () => {
    vi.mocked(fetchReportSummary).mockResolvedValue({
      income: 10000,
      expense: 2050,
      unconverted: 3,
      total: 42,
    })
    vi.mocked(fetchMonthlySeries).mockResolvedValue([
      { month: '2026-01-01', income: 10000, expense: 2050, unconverted: 3 },
    ])
    vi.mocked(fetchCategoryBreakdown).mockResolvedValue([
      { categoryId: 'c1', name: 'Salary', color: '#10b981', icon: null, income: 10000, expense: 0 },
      {
        categoryId: 'c2',
        name: 'Groceries',
        color: '#ef4444',
        icon: null,
        income: 0,
        expense: 2050,
      },
    ])

    renderWithRouter(<Reports />)

    await waitFor(() => {
      // $10,000 appears in the Income card and the Salary table row.
      expect(screen.getAllByText('$10,000').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('$2,050').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('$7,950')).toBeInTheDocument() // net
    })
    expect(screen.getByRole('cell', { name: 'Salary' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Groceries' })).toBeInTheDocument()
    // Unconverted notice from the summary RPC.
    expect(screen.getByText(/3 transactions not yet converted/)).toBeInTheDocument()
  })
})
