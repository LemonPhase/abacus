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
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/accounts', label: 'Accounts', icon: Landmark },
  { to: '/app/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/app/budgets', label: 'Budgets', icon: Target },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/categories', label: 'Categories', icon: Tags },
  { to: '/app/investments', label: 'Investments', icon: TrendingUp },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]
