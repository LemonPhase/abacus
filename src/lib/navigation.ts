import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
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
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/investments', label: 'Investments', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: Settings },
]
