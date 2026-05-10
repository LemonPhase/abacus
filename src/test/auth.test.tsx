import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth, AuthGuard } from '@/supabase/auth'
import { mockSupabase } from '@/test/supabase-mock'

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
        } as any,
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
      capturedResetPassword = resetPasswordForEmail
      return null
    }

    renderWithAuth(<CaptureReset />)
    await waitFor(() => {
      expect(capturedResetPassword).toBeDefined()
    })

    await capturedResetPassword!('test@example.com')

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: `${window.location.origin}/reset-password`,
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
      capturedUpdatePassword = updatePassword
      return null
    }

    renderWithAuth(<CaptureUpdate />)
    await waitFor(() => {
      expect(capturedUpdatePassword).toBeDefined()
    })

    await expect(capturedUpdatePassword!('short')).rejects.toThrow('Password too short')
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
        } as any,
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
      { route: '/dashboard' },
    )

    await waitFor(() => {
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })
  })
})
