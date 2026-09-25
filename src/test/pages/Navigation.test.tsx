import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'

vi.mock('@/auth/auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  AuthGuard: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: { email: 'navigation@example.com' }, signOut: vi.fn() }),
}))

beforeEach(() => {
  localStorage.clear()
})

describe('standalone navigation routes', () => {
  it.each([
    ['/app/dashboard', 'Home'],
    ['/app/accounts', 'Accounts'],
    ['/app/transactions', 'Transactions'],
    ['/app/recurring', 'Recurring'],
    ['/app/investments', 'Investments'],
    ['/app/investments/', 'Investments'],
    ['/app/categories', 'Categories'],
    ['/app/reports', 'Reports'],
    ['/app/settings', 'Settings'],
    ['/app/more', 'More'],
  ])('opens %s with its own title', async (path, title) => {
    window.history.replaceState({}, '', path)
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    if (title === 'Settings') {
      expect(screen.queryByRole('heading', { name: 'Categories' })).not.toBeInTheDocument()
    }
  })

  it('navigates from More to a secondary page and back, then opens the transaction action', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/app/more')
    render(<App />)
    const more = screen.getByRole('navigation', { name: 'More destinations' })
    expect(
      within(more)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Reports', 'Recurring', 'Investments', 'Categories', 'Settings'])
    await user.click(within(more).getByRole('link', { name: 'Investments' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Investments' }),
    ).toBeInTheDocument()
    const mobile = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(within(mobile).getByRole('link', { name: 'More' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'More' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'More' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/app/transactions')
  })
})
