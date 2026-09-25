import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MORE_LINKS } from '@/lib/navigation'
import { NAV_ICONS } from '@/components/layout/navigationIcons'

export default function More() {
  return (
    <div className="space-y-6 pb-16 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">More</h1>
      </div>
      <nav
        aria-label="More destinations"
        className="divide-y divide-border/30 rounded-xl border border-border/30 bg-card text-card-foreground"
      >
        {MORE_LINKS.map(({ to, label, icon }) => {
          const Icon = NAV_ICONS[icon]
          return (
            <Link
              key={to}
              to={to}
              className="group flex min-h-14 items-center gap-4 px-5 py-4 transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
