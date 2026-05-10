import { Link } from 'react-router-dom'
import { useAuth } from '@/supabase/auth'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { ArrowRight, LayoutDashboard, Landmark, BarChart3 } from 'lucide-react'

const features = [
  {
    icon: LayoutDashboard,
    title: 'Accounts',
    desc: 'Track all your accounts in one place with automatic balance updates.',
  },
  {
    icon: Landmark,
    title: 'Transactions',
    desc: 'Log income, expenses, and transfers. Import from CSV when needed.',
  },
  {
    icon: BarChart3,
    title: 'Insights',
    desc: 'Monthly breakdowns, category spending, and budget tracking.',
  },
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-20">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-sm">
          A
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Abacus</h1>
        <p className="mt-2 max-w-md text-center text-base text-muted-foreground">
          Personal finance, precisely calculated. Track accounts, transactions, and budgets without
          the clutter.
        </p>

        <div className="mt-8 flex gap-3">
          {user ? (
            <Link to="/dashboard" className={cn(buttonVariants(), 'gap-2')}>
              Dashboard
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Link to="/auth" className={cn(buttonVariants(), 'gap-2')}>
              Get Started
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="border-t px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-sm font-medium tracking-wide uppercase text-muted-foreground">
            What you can do
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="text-center">
                <CardContent className="pt-6">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted">
                    <f.icon className="size-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="mt-4 text-base">{f.title}</CardTitle>
                  <CardDescription className="mt-1">{f.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Abacus &middot; {new Date().getFullYear()}
      </footer>
    </div>
  )
}
