import { NavLink } from 'react-router-dom'

import { NAV_LINKS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export default function Sidebar() {
  return (
    <aside className="hidden border-r border-sidebar-border bg-sidebar md:flex md:w-56 md:flex-col">
      {/* Brand header */}
      <div className="flex flex-col px-5 py-4">
        <div className="flex items-center gap-3">
          <img
            src="/logo.svg"
            alt="Abacus"
            className="mt-0.5 size-8 shrink-0 text-sidebar-primary-foreground"
          />
          <span className="text-base font-semibold tracking-tight">Abacus</span>
        </div>
        <p className="mt-1 pl-11 text-xs text-muted-foreground">Wealth Management</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            <Icon className="size-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
