import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { LogIn } from "lucide-react"
import { useAuth } from "@/supabase/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

export default function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)

    try {
      if (mode === "signin") {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardTitle className="flex items-center gap-2 px-4 pt-4">
          <LogIn className="size-5" />
          Abacus
        </CardTitle>
        <CardDescription className="px-4">
          {mode === "signin" ? "Sign in to your account" : "Create a new account"}
        </CardDescription>

        <CardContent>
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

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign In"
                  : "Sign Up"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Don't have an account?" : "Already have an account?"}
          </p>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError("") }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
