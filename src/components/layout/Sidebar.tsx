import { NavLink } from 'react-router-dom'

import { NAV_LINKS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export default function Sidebar() {
  return (
    <aside className="hidden border-r border-sidebar-border bg-sidebar md:flex md:w-56 md:flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <span className="text-xs font-bold">A</span>
        </div>
        <span className="text-base font-semibold tracking-tight">Abacus</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-3">
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            <Icon
              className={cn(
                'size-4 shrink-0 transition-transform duration-200',
                'group-hover:scale-110',
              )}
            />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
