import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Landmark,
  ArrowLeftRight,
  Target,
  BarChart3,
  Settings,
  Tags,
  TrendingUp,
} from "lucide-react"

import { cn } from "@/lib/utils"

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Landmark },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/budgets", label: "Budgets", icon: Target },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/investments", label: "Investments", icon: TrendingUp },
  { to: "/settings", label: "Settings", icon: Settings },
]

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
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )
            }
          >
            <Icon
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                "group-hover:scale-110"
              )}
            />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
