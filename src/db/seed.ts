import type { Category } from "@/types"
import { nanoid } from "./nanoid"

function c(name: string, type: Category["type"], color: string, icon?: string): Category {
  return { id: nanoid(), name, type, color, icon }
}

export const seedCategories: Category[] = [
  // Income
  c("Salary", "income", "#16a34a", "briefcase"),
  c("Freelance", "income", "#22c55e", "pen-tool"),
  c("Investments", "income", "#10b981", "trending-up"),
  c("Gifts", "income", "#34d399", "gift"),
  c("Other Income", "income", "#6ee7b7", "plus"),

  // Expense
  c("Housing", "expense", "#dc2626", "home"),
  c("Utilities", "expense", "#ef4444", "zap"),
  c("Groceries", "expense", "#f97316", "shopping-cart"),
  c("Transport", "expense", "#eab308", "car"),
  c("Dining Out", "expense", "#f59e0b", "utensils"),
  c("Healthcare", "expense", "#f43f5e", "heart-pulse"),
  c("Entertainment", "expense", "#8b5cf6", "tv"),
  c("Shopping", "expense", "#ec4899", "shopping-bag"),
  c("Education", "expense", "#3b82f6", "graduation-cap"),
  c("Travel", "expense", "#06b6d4", "plane"),
  c("Insurance", "expense", "#64748b", "shield"),
  c("Subscriptions", "expense", "#a855f7", "repeat"),
  c("Personal Care", "expense", "#d946ef", "smile"),
  c("Other Expense", "expense", "#78716c", "ellipsis"),
]
