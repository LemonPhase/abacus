import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import type { InvestmentPlan, NewInvestmentPlan } from "@/types"

interface InvestmentPlansState {
  plans: InvestmentPlan[]
  loading: boolean
  load: () => Promise<void>
  add: (data: NewInvestmentPlan) => Promise<InvestmentPlan>
  update: (id: string, data: Partial<NewInvestmentPlan>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => InvestmentPlan | undefined
}

export const useInvestmentPlansStore = create<InvestmentPlansState>()((set, get) => ({
  plans: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from("investment_plans").select("*")
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plans: InvestmentPlan[] = (data ?? []).map((row: any) => ({
      ...mapKeysToCamel<InvestmentPlan>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }))
    set({ plans, loading: false })
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from("investment_plans")
      .insert(mapKeysToSnake(data) as Record<string, unknown>)
      .select()
      .single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = inserted as any
    const plan: InvestmentPlan = {
      ...mapKeysToCamel<InvestmentPlan>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
    await get().load()
    return plan
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("investment_plans")
      .update(mapKeysToSnake(data) as Record<string, unknown>)
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
}))
