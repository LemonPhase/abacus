import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import MobileNav from '@/components/layout/MobileNav'
import MobileMoreLink from '@/components/layout/MobileMoreLink'

function renderWithRouter(ui: React.ReactElement, route = '/app/dashboard') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

describe('Sidebar', () => {
  it('exposes every page with its own active link', () => {
    renderWithRouter(<Sidebar />, '/app/investments')
    expect(screen.getByText('Abacus')).toBeInTheDocument()
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Home',
      'Transactions',
      'Budgets',
      'Accounts',
      'Reports',
      'Recurring',
      'Investments',
      'Categories',
      'Settings',
    ])
    expect(screen.getByRole('link', { name: 'Investments' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Accounts' })).not.toHaveAttribute('aria-current')
  })
})

describe('Mobile navigation', () => {
  it('renders five labeled tabs', () => {
    renderWithRouter(<MobileNav />)
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Home',
      'Transactions',
      'Budgets',
      'Accounts',
      'More',
    ])
  })

  it.each(['reports', 'recurring', 'investments', 'categories', 'settings', 'more'])(
    'selects More at /app/%s',
    (route) => {
      renderWithRouter(<MobileNav />, `/app/${route}`)
      expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    },
  )

  it('provides an explicit return link on a secondary page', () => {
    renderWithRouter(<MobileMoreLink />, '/app/categories/')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/app/more')
  })

  it('does not show the return link on primary pages', () => {
    renderWithRouter(<MobileMoreLink />, '/app/accounts')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
