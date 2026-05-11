import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth, AuthGuard } from '@/auth/auth'
import { mockSupabase, simulateAuthEvent } from '@/test/supabase-mock'

beforeEach(() => {
  vi.clearAllMocks()
})

function TestConsumer() {
  const { user, loading } = useAuth()
  if (loading) return <div>Loading...</div>
  if (user) return <div>Logged in as {user.email}</div>
  return <div>Not logged in</div>
}

function renderWithAuth(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider', () => {
  it('shows loading state initially', async () => {
    let resolveSession: ((v: { data: { session: null }; error: null }) => void) | undefined
    mockSupabase.auth.getSession.mockReturnValue(
      new Promise<{ data: { session: null }; error: null }>((resolve) => {
        resolveSession = resolve
      }),
    )

    renderWithAuth(<TestConsumer />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    resolveSession!({ data: { session: null }, error: null })
  })

  it('shows not logged in when no session', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderWithAuth(<TestConsumer />)
    await waitFor(() => {
      expect(screen.getByText('Not logged in')).toBeInTheDocument()
    })
  })

  it('shows user email when session exists', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    renderWithAuth(<TestConsumer />)
    await waitFor(() => {
      expect(screen.getByText('Logged in as test@example.com')).toBeInTheDocument()
    })
  })

  it('registers auth state change listener', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderWithAuth(<TestConsumer />)
    await waitFor(() => {
      expect(screen.getByText('Not logged in')).toBeInTheDocument()
    })

    expect(mockSupabase.auth.onAuthStateChange).toHaveBeenCalled()
  })

  it('calls supabase.auth.resetPasswordForEmail with redirectTo', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })

    let capturedResetPassword: ((email: string) => Promise<void>) | undefined

    function CaptureReset() {
      const { resetPasswordForEmail } = useAuth()
      // eslint-disable-next-line react-hooks/globals -- test helper capturing hook value
      capturedResetPassword = resetPasswordForEmail
      return null
    }

    renderWithAuth(<CaptureReset />)
    await waitFor(() => {
      expect(capturedResetPassword).toBeDefined()
    })

    await capturedResetPassword!('test@example.com')

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
  })

  it('throws error from resetPasswordForEmail', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: 'Too many requests' },
    })

    let capturedResetPassword: ((email: string) => Promise<void>) | undefined

    function CaptureReset() {
      const { resetPasswordForEmail } = useAuth()
      // eslint-disable-next-line react-hooks/globals -- test helper capturing hook value
      capturedResetPassword = resetPasswordForEmail
      return null
    }

    renderWithAuth(<CaptureReset />)
    await waitFor(() => {
      expect(capturedResetPassword).toBeDefined()
    })

    await expect(capturedResetPassword!('test@example.com')).rejects.toThrow('Too many requests')
  })

  it('calls supabase.auth.updateUser with new password', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com' } },
      error: null,
    })

    let capturedUpdatePassword: ((password: string) => Promise<void>) | undefined

    function CaptureUpdate() {
      const { updatePassword } = useAuth()
      // eslint-disable-next-line react-hooks/globals -- test helper capturing hook value
      capturedUpdatePassword = updatePassword
      return null
    }

    renderWithAuth(<CaptureUpdate />)
    await waitFor(() => {
      expect(capturedUpdatePassword).toBeDefined()
    })

    await capturedUpdatePassword!('newpass123')

    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' })
  })

  it('throws error from updatePassword', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'Password too short' },
    })

    let capturedUpdatePassword: ((password: string) => Promise<void>) | undefined

    function CaptureUpdate() {
      const { updatePassword } = useAuth()
      // eslint-disable-next-line react-hooks/globals -- test helper capturing hook value
      capturedUpdatePassword = updatePassword
      return null
    }

    renderWithAuth(<CaptureUpdate />)
    await waitFor(() => {
      expect(capturedUpdatePassword).toBeDefined()
    })

    await expect(capturedUpdatePassword!('short')).rejects.toThrow('Password too short')
  })

  it('navigates to /auth/reset-password on PASSWORD_RECOVERY event when not already there', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    function PathDisplay() {
      const location = useLocation()
      return <div data-testid="pathname">{location.pathname}</div>
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <PathDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    })

    await act(async () => {
      simulateAuthEvent('PASSWORD_RECOVERY', {
        user: { id: 'u1', email: 'test@example.com' },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/auth/reset-password')
    })
  })

  it('does not navigate on PASSWORD_RECOVERY when already on reset-password page', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    function PathDisplay() {
      const location = useLocation()
      return <div data-testid="pathname">{location.pathname}</div>
    }

    render(
      <MemoryRouter initialEntries={['/auth/reset-password']}>
        <AuthProvider>
          <PathDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/auth/reset-password')
    })

    await act(async () => {
      simulateAuthEvent('PASSWORD_RECOVERY', {
        user: { id: 'u1', email: 'test@example.com' },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('pathname')).toHaveTextContent('/auth/reset-password')
    })
  })
})

describe('AuthGuard', () => {
  it('shows loading spinner while checking session', () => {
    let resolveSession: ((v: { data: { session: null }; error: null }) => void) | undefined
    mockSupabase.auth.getSession.mockReturnValue(
      new Promise<{ data: { session: null }; error: null }>((resolve) => {
        resolveSession = resolve
      }),
    )

    renderWithAuth(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    expect(document.querySelector('.animate-spin')).toBeTruthy()

    resolveSession!({ data: { session: null }, error: null })
  })

  it('renders children when authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    renderWithAuth(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
    )

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  it('redirects to /auth when not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderWithAuth(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>,
      { route: '/app/dashboard' },
    )

    await waitFor(() => {
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })
})
