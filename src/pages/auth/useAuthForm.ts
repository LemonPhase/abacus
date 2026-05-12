import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/auth'

export type AuthMode = 'signin' | 'signup' | 'forgot_password'

interface FieldErrors {
  email?: string
  password?: string
  confirmPassword?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useAuthForm() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const { signIn, signUp, resetPasswordForEmail } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/app/dashboard'

  function validate(): boolean {
    const errors: FieldErrors = {}

    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      errors.email = 'Please enter a valid email address'
    }

    if (mode !== 'forgot_password' && !password) {
      errors.password = 'Please enter your password'
    }

    if (mode === 'signup') {
      if (!confirmPassword) {
        errors.confirmPassword = 'Please confirm your password'
      } else if (confirmPassword !== password) {
        errors.confirmPassword = 'Passwords do not match'
      }
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value)
    setFieldErrors((prev) => ({ ...prev, email: undefined }))
  }, [])

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value)
    setFieldErrors((prev) => ({ ...prev, password: undefined }))
  }, [])

  const handleConfirmPasswordChange = useCallback((value: string) => {
    setConfirmPassword(value)
    setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }))
  }, [])

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!validate()) return

    setSubmitting(true)

    try {
      if (mode === 'forgot_password') {
        await resetPasswordForEmail(email)
        setResetSent(true)
      } else if (mode === 'signin') {
        await signIn(email, password)
        navigate(from, { replace: true })
      } else {
        await signUp(email, password)
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  function switchMode(newMode: AuthMode) {
    setMode(newMode)
    setError('')
    setResetSent(false)
    setConfirmPassword('')
    setFieldErrors({})
  }

  return {
    mode,
    email,
    password,
    confirmPassword,
    showPassword,
    error,
    fieldErrors,
    submitting,
    resetSent,
    handleEmailChange,
    handlePasswordChange,
    handleConfirmPasswordChange,
    toggleShowPassword,
    handleSubmit,
    switchMode,
  }
}
