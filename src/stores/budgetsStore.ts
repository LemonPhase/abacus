import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { Budget, NewBudget } from "@/types"
import type { Database } from "@/supabase/database.types"

type BudgetRow = Database["public"]["Tables"]["budgets"]["Row"]

let _unsub: (() => void) | null = null

function mapRow(row: BudgetRow): Budget {
  return {
    ...mapKeysToCamel<Budget>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startDate: new Date(row.start_date),
  }
}

interface BudgetsState {
  budgets: Budget[]
  loading: boolean
  error: string | null
  clearError: () => void
  load: () => Promise<void>
  add: (data: NewBudget) => Promise<Budget>
  update: (id: string, data: Partial<NewBudget>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Budget | undefined
  unsubscribe: () => void
}

export const useBudgetsStore = create<BudgetsState>()((set, get) => ({
  budgets: [],
  loading: false,
  error: null,
  clearError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.from("budgets").select("*")
    if (error) { set({ error: error.message, loading: false }); throw error }
    const budgets: Budget[] = (data ?? []).map(mapRow)
    set({ budgets, loading: false })

    if (!_unsub) {
      _unsub = subscribeToTable("budgets", (payload) => {
        if (payload.eventType === "INSERT") {
          const budget = mapRow(payload.new as BudgetRow)
          set((state) => {
            if (state.budgets.some((b) => b.id === budget.id)) return state
            return { budgets: [...state.budgets, budget] }
          })
        } else if (payload.eventType === "UPDATE") {
          const budget = mapRow(payload.new as BudgetRow)
          set((state) => ({
            budgets: state.budgets.map((b) => (b.id === budget.id ? budget : b)),
          }))
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            budgets: state.budgets.filter((b) => b.id !== id),
          }))
        }
      })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from("budgets")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["budgets"]["Insert"])
      .select()
      .single()
    if (error) { set({ error: error.message, loading: false }); throw error }
    const budget = mapRow(inserted as BudgetRow)
    set((state) => {
      if (state.budgets.some((item) => item.id === budget.id)) return state
      return { budgets: [...state.budgets, budget] }
    })
    return budget
  },

  update: async (id, data) => {
    set({ error: null })
    const { error } = await supabase
      .from("budgets")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["budgets"]["Update"])
      .eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      budgets: state.budgets.map((item) => (item.id === id ? { ...item, ...data } : item)) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from("budgets").delete().eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      budgets: state.budgets.filter((item) => item.id !== id),
    }))
  },

  getById: (id) => {
    return get().budgets.find((b) => b.id === id)
  },

  unsubscribe: () => {
    if (_unsub) {
      _unsub()
      _unsub = null
    }
  },
}))
