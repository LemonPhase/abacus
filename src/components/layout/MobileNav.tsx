import { NavLink } from 'react-router-dom'

import { NAV_LINKS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export default function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur md:hidden">
      <div className="flex h-16 items-center justify-around px-2">
        {NAV_LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/app/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 items-center justify-center py-1 font-medium transition-all duration-200',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <div
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-all duration-200',
                  isActive && 'bg-primary/10',
                )}
                title={label}
              >
                <Icon
                  className={cn(
                    'size-5 transition-transform duration-200',
                    isActive && 'scale-110',
                  )}
                />
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
