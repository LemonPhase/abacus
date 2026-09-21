import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

describe('Sidebar', () => {
  it('renders brand name and all nav links', () => {
    renderWithRouter(<Sidebar />)
    expect(screen.getByText('Abacus')).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Recurring')).toBeInTheDocument()
    expect(screen.getByText('Budgets')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

describe('MobileNav', () => {
  it('renders the five consolidated tabs with visible labels', () => {
    renderWithRouter(<MobileNav />, { route: '/app/dashboard' })
    const labels = ['Home', 'Transactions', 'Budgets', 'Accounts', 'Settings']
    for (const label of labels) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('highlights the host tab on absorbed routes (recurring → Transactions)', () => {
    renderWithRouter(<MobileNav />, { route: '/app/recurring' })
    expect(screen.getByRole('link', { name: 'Transactions' }).className).toContain('text-primary')
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toContain('text-primary')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('highlights Settings on the absorbed categories route', () => {
    renderWithRouter(<MobileNav />, { route: '/app/categories' })
    expect(screen.getByRole('link', { name: 'Settings' }).className).toContain('text-primary')
  })
})
