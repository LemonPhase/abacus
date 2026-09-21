import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  CalendarClock,
  Target,
  BarChart3,
  Settings,
  Tags,
  TrendingUp,
} from 'lucide-react'

export type NavLinkConfig = {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_LINKS: NavLinkConfig[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/accounts', label: 'Accounts', icon: Landmark },
  { to: '/app/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/app/recurring', label: 'Recurring', icon: CalendarClock },
  { to: '/app/budgets', label: 'Budgets', icon: Target },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/categories', label: 'Categories', icon: Tags },
  { to: '/app/investments', label: 'Investments', icon: TrendingUp },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

export type MobileNavLinkConfig = NavLinkConfig & {
  /** Extra path prefixes that should mark this tab active (absorbed subpages). */
  activeOn?: string[]
}

/**
 * Consolidated five-tab mobile bar (industry 3–5 ceiling). Absorbed pages
 * deep-link into their host route, which pre-selects the matching segment:
 * recurring → Transactions, categories → Settings, investments → Accounts,
 * reports → Dashboard.
 */
export const MOBILE_NAV_LINKS: MobileNavLinkConfig[] = [
  { to: '/app/dashboard', label: 'Home', icon: LayoutDashboard, activeOn: ['/app/reports'] },
  {
    to: '/app/transactions',
    label: 'Transactions',
    icon: ArrowLeftRight,
    activeOn: ['/app/recurring'],
  },
  { to: '/app/budgets', label: 'Budgets', icon: Target },
  { to: '/app/accounts', label: 'Accounts', icon: Landmark, activeOn: ['/app/investments'] },
  { to: '/app/settings', label: 'Settings', icon: Settings, activeOn: ['/app/categories'] },
]
