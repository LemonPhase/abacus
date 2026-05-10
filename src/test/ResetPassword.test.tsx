import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@/supabase/auth'
import { mockSupabase } from '@/test/supabase-mock'
import ResetPassword from '@/pages/ResetPassword'

beforeEach(() => {
  vi.clearAllMocks()
})

function renderResetPasswordPage() {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <AuthProvider>
          <ResetPassword />
        </AuthProvider>
      </MemoryRouter>,
    ),
  }
}

describe('ResetPassword Page', () => {
  it('shows loading spinner initially', () => {
    let resolveSession: ((v: { data: { session: null }; error: null }) => void) | undefined
    mockSupabase.auth.getSession.mockReturnValue(
      new Promise<{ data: { session: null }; error: null }>((resolve) => {
        resolveSession = resolve
      }),
    )

    renderResetPasswordPage()
    expect(document.querySelector('.animate-spin')).toBeTruthy()

    resolveSession!({ data: { session: null }, error: null })
  })

  it('shows invalid/expired link message when no session', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByText('This reset link is invalid or has expired.')).toBeInTheDocument()
    })
  })

  it('shows back to sign in button when no session', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back to sign in' })).toBeInTheDocument()
    })
  })

  it('shows new password form when session exists', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByText('Enter a new password for your account.')).toBeInTheDocument()
      expect(screen.getByLabelText('New password')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Set new password' })).toBeInTheDocument()
    })
  })

  it('calls updateUser on submit', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    const { user } = renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set new password' })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('New password'), 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    await waitFor(() => {
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass456' })
    })
  })

  it('shows success message after password update', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    })

    const { user } = renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set new password' })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('New password'), 'newpass456')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    await waitFor(() => {
      expect(screen.getByText('Password updated')).toBeInTheDocument()
      expect(screen.getByText('Your password has been reset successfully.')).toBeInTheDocument()
    })
  })

  it('shows error on failed password update', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'New password must be different' },
    })

    const { user } = renderResetPasswordPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set new password' })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('New password'), 'samepass')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    await waitFor(() => {
      expect(screen.getByText('New password must be different')).toBeInTheDocument()
    })
  })
})
