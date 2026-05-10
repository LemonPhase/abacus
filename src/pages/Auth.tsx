import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LogIn, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/supabase/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

type AuthMode = 'signin' | 'signup' | 'forgot_password'

export default function Auth() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const { signIn, signUp, resetPasswordForEmail } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/app'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
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
  }

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
                onClick={() => switchMode('signin')}
              >
                <ArrowLeft className="mr-1 size-3" />
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              {mode !== 'forgot_password' && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting
                  ? 'Please wait...'
                  : mode === 'signin'
                    ? 'Sign In'
                    : mode === 'signup'
                      ? 'Sign Up'
                      : 'Send reset link'}
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
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
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
              onClick={() => switchMode('forgot_password')}
            >
              Forgot password?
            </Button>
          )}
          {mode === 'forgot_password' && !resetSent && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => switchMode('signin')}
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
