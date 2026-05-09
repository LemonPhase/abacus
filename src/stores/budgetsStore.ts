import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
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
    const { data, error } = await supabase.from("budgets").select("*")
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const budgets: Budget[] = (data ?? []).map((row: any) => ({
      ...mapKeysToCamel<Budget>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startDate: new Date(row.start_date),
    }))
    set({ budgets, loading: false })
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from("budgets")
      .insert(mapKeysToSnake(data) as Record<string, unknown>)
      .select()
      .single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = inserted as any
    const budget: Budget = {
      ...mapKeysToCamel<Budget>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startDate: new Date(row.start_date),
    }
    await get().load()
    return budget
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("budgets")
      .update(mapKeysToSnake(data) as Record<string, unknown>)
      .eq("id", id)
    if (error) throw error
    await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from("budgets").delete().eq("id", id)
    if (error) throw error
    await get().load()
  },

  getById: (id) => {
    return get().budgets.find((b) => b.id === id)
  },
}))
