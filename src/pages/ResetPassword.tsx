import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '@/auth/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

function parseHashParams(): Record<string, string> {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return {}
  const params = new URLSearchParams(hash)
  const result: Record<string, string> = {}
  for (const [key, value] of params) {
    result[key] = value
  }
  return result
}

export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const hashError = useMemo(() => {
    const params = parseHashParams()
    if (params.error) {
      return params.error_description?.replace(/\+/g, ' ') ?? params.error_code ?? params.error
    }
    return null
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardTitle className="flex items-center gap-2 px-4 pt-4">
            <KeyRound className="size-5" />
            Reset Password
          </CardTitle>
          <CardDescription className="px-4">
            {hashError ?? 'This reset link is invalid or has expired.'}
          </CardDescription>
          <CardFooter className="pt-2">
            <Button className="w-full" onClick={() => navigate('/auth')}>
              Back to sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await updatePassword(password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardTitle className="flex items-center gap-2 px-4 pt-4">
            <KeyRound className="size-5" />
            Password updated
          </CardTitle>
          <CardDescription className="px-4">
            Your password has been reset successfully.
          </CardDescription>
          <CardFooter className="pt-2">
            <Button className="w-full" onClick={() => navigate('/dashboard')}>
              Go to dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardTitle className="flex items-center gap-2 px-4 pt-4">
          <KeyRound className="size-5" />
          Set new password
        </CardTitle>
        <CardDescription className="px-4">Enter a new password for your account.</CardDescription>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Updating...' : 'Set new password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
