import { Bell, HelpCircle, LogOut, Search } from 'lucide-react'

import { useAuth } from '@/auth/auth'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { cn } from '@/lib/utils'

export default function TopHeader({ className }: { className?: string }) {
  const { user, signOut } = useAuth()
  const initial = user?.email?.charAt(0).toUpperCase() ?? '?'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-16 shrink-0 items-center justify-end gap-3 border-b border-border/30 bg-background/80 px-6 backdrop-blur-md',
        className,
      )}
    >
      {/* Search */}
      <div className="relative">
        <Input
          placeholder="Search transactions..."
          className="w-48 rounded border-border/40 bg-muted/40 pl-8 text-sm focus-visible:ring-1 focus-visible:ring-primary lg:w-64"
        />
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {/* Quick actions */}
      <button
        className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Notifications"
      >
        <Bell className="size-5" />
      </button>
      <button
        className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Help"
      >
        <HelpCircle className="size-5" />
      </button>

      {/* User avatar */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          {initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <p className="px-1.5 py-1 text-xs text-muted-foreground">{user?.email ?? 'Signed in'}</p>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              signOut()
            }}
          >
            <LogOut className="size-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
