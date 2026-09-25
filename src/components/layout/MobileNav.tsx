import { Link, useLocation } from 'react-router-dom'

import { NAV_ICONS } from './navigationIcons'
import { MOBILE_NAV_LINKS, isMobileNavActive } from '@/lib/navigation'
import { cn } from '@/lib/utils'

export default function MobileNav() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur md:hidden"
    >
      <div className="flex h-16 items-stretch justify-around">
        {MOBILE_NAV_LINKS.map(({ to, label, icon }) => {
          const Icon = NAV_ICONS[icon]
          const isActive = isMobileNavActive(to, pathname)
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                icon === 'transactions' ? 'flex-[1.2]' : 'flex-1',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full px-3 py-0.5 transition-all duration-200',
                  isActive && 'bg-primary/10',
                )}
              >
                <Icon
                  className={cn(
                    'size-5 transition-transform duration-200',
                    isActive && 'scale-110',
                  )}
                />
              </span>
              <span
                className={cn(
                  'text-[0.6875rem] leading-none',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
