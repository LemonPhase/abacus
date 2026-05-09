import { create } from "zustand"
import { db } from "@/db"
import { nanoid } from "@/db/nanoid"
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
    const plans = await db.investmentPlans.toArray()
    set({ plans, loading: false })
  },

  add: async (data) => {
    const now = new Date()
    const plan: InvestmentPlan = {
      ...data,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    }
    await db.investmentPlans.add(plan)
    await get().load()
    return plan
  },

  update: async (id, data) => {
    await db.investmentPlans.update(id, { ...data, updatedAt: new Date() })
    await get().load()
  },

  remove: async (id) => {
    await db.investmentPlans.delete(id)
    await get().load()
  },

  getById: (id) => {
    return get().plans.find((p) => p.id === id)
  },
}))
