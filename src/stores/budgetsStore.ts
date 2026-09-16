import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import { supabase } from '@/supabase/client'
import type { Budget, NewBudget } from '@/types'
import type { Database } from '@/supabase/database.types'

type BudgetRow = Database['public']['Tables']['budgets']['Row']

function mapRow(row: BudgetRow): Budget {
  return {
    ...mapKeysToCamel<Budget>(row),
    // Merged from the budget_categories table by mergeAssociations(); realtime
    // payloads (dormant — no tables in the realtime publication) carry none.
    categoryIds: [],
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
  reset: () => void
}

// Audit 08 (issue #12): budget -> category links live in the constrained
// budget_categories association table (same-user composite FKs), not a uuid[]
// array. The public store shape still exposes categoryIds: string[].
export const useBudgetsStore = create<BudgetsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)

  const mergeAssociations = (budgetId: string, categoryIds: string[]) => {
    set({
      budgets: get().budgets.map((b) => (b.id === budgetId ? { ...b, categoryIds } : b)),
    })
  }

  // Replace one budget's association rows (delete + insert; small row counts).
  const writeAssociations = async (budgetId: string, categoryIds: string[]) => {
    const { error: delErr } = await supabase
      .from('budget_categories')
      .delete()
      .eq('budget_id', budgetId)
    if (delErr) throw new Error(delErr.message)
    if (categoryIds.length === 0) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const userId = session?.user?.id
    const { error } = await supabase.from('budget_categories').insert(
      // user_id is stamped by the set_user_id trigger when omitted (same
      // convention as createCrudSlice); the Insert cast is the sanctioned
      // store-wrapper one.
      categoryIds.map((category_id) => ({
        budget_id: budgetId,
        category_id,
        ...(userId ? { user_id: userId } : {}),
      })) as Database['public']['Tables']['budget_categories']['Insert'][],
    )
    if (error) throw new Error(error.message)
  }

  const loadAssociations = async () => {
    const { data, error } = await supabase
      .from('budget_categories')
      .select('budget_id, category_id')
    if (error) throw new Error(error.message)
    const byBudget = new Map<string, string[]>()
    for (const row of data ?? []) {
      const list = byBudget.get(row.budget_id) ?? []
      list.push(row.category_id)
      byBudget.set(row.budget_id, list)
    }
    set({
      budgets: get().budgets.map((b) => ({ ...b, categoryIds: byBudget.get(b.id) ?? [] })),
    })
  }

  return {
    budgets: [],
    ...base,
    load: async (options) => {
      await base.load(options)
      await loadAssociations()
    },
    add: async (data) => {
      const { categoryIds, ...rest } = data
      const budget = await _add(
        mapKeysToSnake(rest) as Database['public']['Tables']['budgets']['Insert'],
      )
      await writeAssociations(budget.id, categoryIds)
      mergeAssociations(budget.id, categoryIds)
      return { ...budget, categoryIds }
    },
    update: async (id, data) => {
      const { categoryIds, ...rest } = data
      await _update(id, mapKeysToSnake(rest) as Database['public']['Tables']['budgets']['Update'])
      if (categoryIds) {
        await writeAssociations(id, categoryIds)
        mergeAssociations(id, categoryIds)
      }
    },
  }
})
