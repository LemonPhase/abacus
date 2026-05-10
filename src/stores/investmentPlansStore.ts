import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type { InvestmentPlan, NewInvestmentPlan } from '@/types'
import type { Database } from '@/supabase/database.types'

type InvestmentPlanRow = Database['public']['Tables']['investment_plans']['Row']

function mapRow(row: InvestmentPlanRow): InvestmentPlan {
  return {
    ...mapKeysToCamel<InvestmentPlan>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

const crud = createCrudSlice<InvestmentPlan>({
  table: 'investment_plans',
  collectionKey: 'plans',
  mapRow: (row) => mapRow(row as InvestmentPlanRow),
})

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

export const useInvestmentPlansStore = create<InvestmentPlansState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    plans: [],
    ...base,
    add: (data) =>
      _add(mapKeysToSnake(data) as Database['public']['Tables']['investment_plans']['Insert']),
    update: (id, data) =>
      _update(
        id,
        mapKeysToSnake(data) as Database['public']['Tables']['investment_plans']['Update'],
      ),
  }
})
