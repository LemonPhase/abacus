import { LogIn, ArrowLeft, Eye, EyeOff, CircleAlert, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import type { AuthMode } from './useAuthForm'

interface AuthFormProps {
  mode: AuthMode
  email: string
  password: string
  confirmPassword: string
  showPassword: boolean
  error: string
  fieldErrors: { email?: string; password?: string; confirmPassword?: string }
  submitting: boolean
  resetSent: boolean
  onEmailChange: (email: string) => void
  onPasswordChange: (password: string) => void
  onConfirmPasswordChange: (confirmPassword: string) => void
  onToggleShowPassword: () => void
  onSubmit: (e: React.FormEvent) => void
  onSwitchMode: (mode: AuthMode) => void
}

interface PasswordInputProps {
  id: string
  value: string
  show: boolean
  onChange: (value: string) => void
  onToggleShow: () => void
  placeholder: string
  autoFocus?: boolean
  required?: boolean
  minLength?: number
}

function PasswordInput({
  id,
  value,
  show,
  onChange,
  onToggleShow,
  placeholder,
  autoFocus,
  required = true,
  minLength = 6,
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="absolute right-0 top-0 h-full px-2"
        onClick={onToggleShow}
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  )
}

export function AuthForm({
  mode,
  email,
  password,
  confirmPassword,
  showPassword,
  error,
  fieldErrors,
  submitting,
  resetSent,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onToggleShowPassword,
  onSubmit,
  onSwitchMode,
}: AuthFormProps) {
  const submitLabel =
    mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Send reset link'

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardTitle className="flex items-center gap-2 px-4 pt-4">
          <LogIn className="size-5" />
          Abacus
        </CardTitle>
        <CardDescription className="px-4">
          {mode === 'signin' && 'Sign in to your account'}
          {mode === 'signup' && 'Create a new account'}
          {mode === 'forgot_password' && !resetSent && 'Reset your password'}
          {mode === 'forgot_password' && resetSent && 'Check your email'}
        </CardDescription>

        <CardContent>
          {mode === 'forgot_password' && resetSent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{email}</span>, you will receive a
                password reset link shortly.
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onSwitchMode('signin')}
              >
                <ArrowLeft className="mr-1 size-3" />
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => onEmailChange(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              {mode !== 'forgot_password' && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <PasswordInput
                    id="password"
                    value={password}
                    show={showPassword}
                    onChange={onPasswordChange}
                    onToggleShow={onToggleShowPassword}
                    placeholder="••••••••"
                  />
                  {fieldErrors.password && (
                    <p className="text-xs text-destructive">{fieldErrors.password}</p>
                  )}
                </div>
              )}

              {mode === 'signup' && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <PasswordInput
                    id="confirm-password"
                    value={confirmPassword}
                    show={showPassword}
                    onChange={onConfirmPasswordChange}
                    onToggleShow={onToggleShowPassword}
                    placeholder="••••••••"
                  />
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-1">
          {mode !== 'forgot_password' && (
            <>
              <p className="text-sm text-muted-foreground">
                {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
              </p>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => onSwitchMode(mode === 'signin' ? 'signup' : 'signin')}
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </Button>
            </>
          )}
          {mode === 'signin' && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => onSwitchMode('forgot_password')}
            >
              Forgot password?
            </Button>
          )}
          {mode === 'forgot_password' && !resetSent && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => onSwitchMode('signin')}
            >
              <ArrowLeft className="mr-1 size-3" />
              Back to sign in
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
