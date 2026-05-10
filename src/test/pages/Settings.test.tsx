import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/settingsStore'

const mockSignOut = vi.fn()

vi.mock('@/supabase/auth', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@/supabase/auth')
  return {
    ...actual,
    useAuth: () => ({ user: { email: 'test@example.com' }, signOut: mockSignOut }),
  }
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  mockSignOut.mockClear()
})

describe('Settings Page', () => {
  it('renders the main settings sections', () => {
    renderWithRouter(<Settings />)

    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Base Currency')).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Data Management')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
  })

  it('shows the import dialog empty state', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByText('Import Data'))
    expect(screen.getByText('Click to select a JSON export file')).toBeInTheDocument()
  })

  it('invokes sign out from the account section', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(mockSignOut).toHaveBeenCalled()
  })
})
