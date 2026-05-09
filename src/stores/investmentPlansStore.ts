import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { InvestmentPlan, NewInvestmentPlan } from "@/types"
import type { Database } from "@/supabase/database.types"

type InvestmentPlanRow = Database["public"]["Tables"]["investment_plans"]["Row"]

function mapRow(row: InvestmentPlanRow): InvestmentPlan {
  return {
    ...mapKeysToCamel<InvestmentPlan>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

interface InvestmentPlansState {
  plans: InvestmentPlan[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewInvestmentPlan) => Promise<InvestmentPlan>
  update: (id: string, data: Partial<NewInvestmentPlan>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => InvestmentPlan | undefined
  unsubscribe: () => void
}

export const useInvestmentPlansStore = create<InvestmentPlansState>()((set, get) => ({
  plans: [],
  loading: false,
  error: null,
  _unsub: null,
  clearError: () => set({ error: null }),

  load: async (options) => {
    set({ loading: true, error: null })
    const { limit, offset } = options ?? {}
    let query = supabase.from("investment_plans").select("*")
    if (offset !== undefined && limit !== undefined) {
      query = query.range(offset, offset + limit - 1)
    } else if (limit !== undefined) {
      query = query.limit(limit)
    }
    const { data, error } = await query
    if (error) { set({ error: error.message, loading: false }); throw error }
    const plans: InvestmentPlan[] = (data ?? []).map(mapRow)
    set({ plans, loading: false })

    if (!get()._unsub) {
      const unsub = subscribeToTable("investment_plans", (payload) => {
        if (payload.eventType === "INSERT") {
          const plan = mapRow(payload.new as InvestmentPlanRow)
          set((state) => {
            if (state.plans.some((p) => p.id === plan.id)) return state
            return { plans: [...state.plans, plan] }
          })
        } else if (payload.eventType === "UPDATE") {
          const plan = mapRow(payload.new as InvestmentPlanRow)
          set((state) => ({
            plans: state.plans.map((p) => (p.id === plan.id ? plan : p)),
          }))
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            plans: state.plans.filter((p) => p.id !== id),
          }))
        }
      })
      set({ _unsub: unsub })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from("investment_plans")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["investment_plans"]["Insert"])
      .select()
      .single()
    if (error) { set({ error: error.message, loading: false }); throw error }
    const plan = mapRow(inserted as InvestmentPlanRow)
    set((state) => {
      if (state.plans.some((item) => item.id === plan.id)) return state
      return { plans: [...state.plans, plan] }
    })
    return plan
  },

  update: async (id, data) => {
    set({ error: null })
    const { error } = await supabase
      .from("investment_plans")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["investment_plans"]["Update"])
      .eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      plans: state.plans.map((item) => (item.id === id ? { ...item, ...data } : item)) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from("investment_plans").delete().eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      plans: state.plans.filter((item) => item.id !== id),
    }))
  },

  getById: (id) => {
    return get().plans.find((p) => p.id === id)
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },
}))
