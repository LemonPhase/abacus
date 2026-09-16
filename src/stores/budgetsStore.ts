import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice, MAX_PAGE_ROWS, type LoadOptions } from '@/stores/crudStore'
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
  load: (options?: LoadOptions) => Promise<void>
  loadMore: () => Promise<void>
  loadingMore: boolean
  hasMore: boolean
  total: number | null
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

  // Replace one budget's association rows atomically: a single RPC call is a
  // single transaction, so a failure can no longer wipe the prior associations
  // (P2 from the PR #27 review — the old delete-then-insert spanned two
  // requests).
  const writeAssociations = async (budgetId: string, categoryIds: string[]) => {
    const { error } = await supabase.rpc('replace_budget_categories', {
      p_budget_id: budgetId,
      p_category_ids: categoryIds,
    })
    if (error) throw new Error(error.message)
  }

  const loadAssociations = async () => {
    // Page through budget_categories: a single unbounded select is capped by
    // the API's max_rows and would silently drop associations.
    const assoc: { budget_id: string; category_id: string }[] = []
    for (let from = 0; ; from += MAX_PAGE_ROWS) {
      const { data, error } = await supabase
        .from('budget_categories')
        .select('budget_id, category_id')
        .order('budget_id')
        .order('category_id')
        .range(from, from + MAX_PAGE_ROWS - 1)
      if (error) throw new Error(error.message)
      const rows = data ?? []
      assoc.push(...rows)
      if (rows.length < MAX_PAGE_ROWS) break
    }
    const byBudget = new Map<string, string[]>()
    for (const row of assoc) {
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
