import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type { Budget, NewBudget } from '@/types'
import type { Database } from '@/supabase/database.types'

type BudgetRow = Database['public']['Tables']['budgets']['Row']

function mapRow(row: BudgetRow): Budget {
  return {
    ...mapKeysToCamel<Budget>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startDate: new Date(row.start_date),
  }
}

const crud = createCrudSlice<Budget>({
  table: 'budgets',
  collectionKey: 'budgets',
  mapRow: (row) => mapRow(row as BudgetRow),
})

interface BudgetsState {
  budgets: Budget[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewBudget) => Promise<Budget>
  update: (id: string, data: Partial<NewBudget>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Budget | undefined
  unsubscribe: () => void
}

export const useBudgetsStore = create<BudgetsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    budgets: [],
    ...base,
    add: (data) => _add(mapKeysToSnake(data) as Database['public']['Tables']['budgets']['Insert']),
    update: (id, data) =>
      _update(id, mapKeysToSnake(data) as Database['public']['Tables']['budgets']['Update']),
  }
})
