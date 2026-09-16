import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/settingsStore'
import { mockSupabase, getTable } from '@/test/supabase-mock'

const mockSignOut = vi.fn<(email?: string) => Promise<void>>().mockResolvedValue(undefined)

vi.mock('@/auth/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/auth/auth')
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

describe('Settings identity-safe export/import', () => {
  // getSession re-reads this variable, so tests can flip the signed-in identity
  // while an export/import is in flight.
  let currentUser: string

  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
    mockSignOut.mockClear()
    currentUser = 'user-a'
    mockSupabase.auth.getSession.mockImplementation(async () => ({
      data: { session: { user: { id: currentUser } } },
      error: null,
    }))
  })

  it('aborts export and downloads nothing when the signed-in user changes mid-operation', async () => {
    let resolveSelect:
      | ((value: { data: Record<string, unknown>[]; error: null }) => void)
      | undefined
    const pending = new Promise<{ data: Record<string, unknown>[]; error: null }>((resolve) => {
      resolveSelect = resolve
    })
    mockSupabase.from.mockImplementation(() => ({ select: vi.fn(() => pending) }))

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderWithRouter(<Settings />)

    await user.click(screen.getByRole('button', { name: 'Export Data' }))
    // Identity flips while the table fetches are still in flight.
    await act(async () => {
      currentUser = 'user-b'
      resolveSelect!({ data: [], error: null })
    })

    await waitFor(() => expect(screen.getByText(/export aborted/i)).toBeInTheDocument())
    expect(click).not.toHaveBeenCalled()
    click.mockRestore()
    mockSupabase.from.mockClear()
  })

  it('aborts import before any destructive delete when the signed-in user changes mid-operation', async () => {
    // B's existing data must survive the aborted import untouched.
    getTable('accounts').push({
      id: 'b-acct',
      user_id: 'user-b',
      name: 'B Account',
      type: 'checking',
      currency: 'USD',
      balance: 5,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    let resolveText: ((value: string) => void) | undefined
    const pendingText = new Promise<string>((resolve) => {
      resolveText = resolve
    })
    const file = { text: () => pendingText } as unknown as File

    const user = userEvent.setup()
    renderWithRouter(<Settings />)
    await user.click(screen.getByText('Import Data'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    // Identity flips while the file is still being read, before the delete phase.
    await act(async () => {
      currentUser = 'user-b'
      resolveText!(JSON.stringify({ accounts: [{ id: 'evil' }], transactions: [] }))
    })

    await waitFor(() => expect(screen.getByText(/import aborted/i)).toBeInTheDocument())
    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(getTable('accounts')).toHaveLength(1)
    expect(getTable('accounts')[0].id).toBe('b-acct')
  })
})
