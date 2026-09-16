import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import { roundCurrency } from '@/lib/currency'
import { useSettingsStore } from '@/stores/settingsStore'
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
  reset: () => void
}

export const useInvestmentPlansStore = create<InvestmentPlansState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)

  // Amounts in the plan currency's minor units
  // (20260918000001_input_invariants rejects sub-cent amounts).
  const roundAmounts = (data: Partial<NewInvestmentPlan>, currency: string) => {
    const clean = { ...data }
    if (typeof clean.initialAmount === 'number') {
      clean.initialAmount = roundCurrency(clean.initialAmount, currency)
    }
    if (typeof clean.monthlyContribution === 'number') {
      clean.monthlyContribution = roundCurrency(clean.monthlyContribution, currency)
    }
    return clean
  }

  return {
    plans: [],
    ...base,
    add: (data) =>
      _add(
        mapKeysToSnake(
          roundAmounts(data, data.currency),
        ) as Database['public']['Tables']['investment_plans']['Insert'],
      ),
    update: (id, data) => {
      const currency =
        data.currency ?? get().getById(id)?.currency ?? useSettingsStore.getState().baseCurrency
      return _update(
        id,
        mapKeysToSnake(
          roundAmounts(data, currency),
        ) as Database['public']['Tables']['investment_plans']['Update'],
      )
    },
  }
})
