import { create } from "zustand"
import { db } from "@/db"
import { nanoid } from "@/db/nanoid"
import type { Budget, NewBudget } from "@/types"

interface BudgetsState {
  budgets: Budget[]
  loading: boolean
  load: () => Promise<void>
  add: (data: NewBudget) => Promise<Budget>
  update: (id: string, data: Partial<NewBudget>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Budget | undefined
}

export const useBudgetsStore = create<BudgetsState>()((set, get) => ({
  budgets: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const budgets = await db.budgets.toArray()
    set({ budgets, loading: false })
  },

  add: async (data) => {
    const budget: Budget = { ...data, id: nanoid() }
    await db.budgets.add(budget)
    await get().load()
    return budget
  },

  update: async (id, data) => {
    await db.budgets.update(id, data)
    await get().load()
  },

  remove: async (id) => {
    await db.budgets.delete(id)
    await get().load()
  },

  getById: (id) => {
    return get().budgets.find((b) => b.id === id)
  },
}))
