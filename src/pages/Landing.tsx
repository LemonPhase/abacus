import { Link } from "react-router-dom"
import { useAuth } from "@/supabase/auth"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardDescription, CardFooter, CardTitle } from "@/components/ui/card"
import { ArrowRight } from "lucide-react"

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardTitle className="flex items-center gap-2 px-4 pt-4">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            A
          </span>
          Abacus
        </CardTitle>
        <CardDescription className="px-4">
          Personal finance, precisely calculated.
        </CardDescription>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Track accounts, transactions, and budgets in one place.</p>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {user ? (
            <Link
              to="/dashboard"
              className={cn(buttonVariants(), "w-full")}
            >
              Go to Dashboard
              <ArrowRight className="ml-2 size-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className={cn(buttonVariants(), "w-full")}
              >
                Sign In
              </Link>
              <p className="text-xs text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link to="/auth" className="underline underline-offset-4 hover:text-foreground">
                  Sign up
                </Link>
              </p>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
