import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  Landmark,
  BarChart3,
  CalendarClock,
  TrendingUp,
  Tags,
  Settings,
  Ellipsis,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NAV_LINKS } from '@/lib/navigation'

export const NAV_ICONS = {
  home: LayoutDashboard,
  transactions: ArrowLeftRight,
  budgets: Target,
  accounts: Landmark,
  reports: BarChart3,
  recurring: CalendarClock,
  investments: TrendingUp,
  categories: Tags,
  settings: Settings,
  more: Ellipsis,
} satisfies Record<(typeof NAV_LINKS)[number]['icon'] | 'more', LucideIcon>
