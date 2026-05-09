import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { InvestmentPlan, NewInvestmentPlan } from "@/types"
import type { Database } from "@/supabase/database.types"

type InvestmentPlanRow = Database["public"]["Tables"]["investment_plans"]["Row"]

let _unsub: (() => void) | null = null

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
  load: () => Promise<void>
  add: (data: NewInvestmentPlan) => Promise<InvestmentPlan>
  update: (id: string, data: Partial<NewInvestmentPlan>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => InvestmentPlan | undefined
  unsubscribe: () => void
}

export const useInvestmentPlansStore = create<InvestmentPlansState>()((set, get) => ({
  plans: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from("investment_plans").select("*")
    if (error) throw error
    const plans: InvestmentPlan[] = (data ?? []).map(mapRow)
    set({ plans, loading: false })

    if (!_unsub) {
      _unsub = subscribeToTable("investment_plans", (payload) => {
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
    }
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from("investment_plans")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["investment_plans"]["Insert"])
      .select()
      .single()
    if (error) throw error
    const plan = mapRow(inserted as InvestmentPlanRow)
    await get().load()
    return plan
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("investment_plans")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["investment_plans"]["Update"])
      .eq("id", id)
    if (error) throw error
    await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from("investment_plans").delete().eq("id", id)
    if (error) throw error
    await get().load()
  },

  getById: (id) => {
    return get().plans.find((p) => p.id === id)
  },

  unsubscribe: () => {
    if (_unsub) {
      _unsub()
      _unsub = null
    }
  },
}))
