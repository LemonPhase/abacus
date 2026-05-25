import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type { Category, NewCategory, CategoryKind } from '@/types'
import type { Database } from '@/supabase/database.types'

type CategoryRow = Database['public']['Tables']['categories']['Row']

function mapRow(row: CategoryRow): Category {
  return {
    ...mapKeysToCamel<Category>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

const crud = createCrudSlice<Category>({
  table: 'categories',
  collectionKey: 'categories',
  order: { column: 'sort_order', ascending: true },
  mapRow: (row) => mapRow(row as CategoryRow),
})

interface CategoriesState {
  categories: Category[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewCategory) => Promise<Category>
  update: (id: string, data: Partial<NewCategory>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByType: (type: CategoryKind) => Category[]
  getById: (id: string) => Category | undefined
  getChildren: (parentId: string) => Category[]
  getRootCategories: (type: CategoryKind) => Category[]
  /** Swap the category's sort_order with its adjacent sibling. */
  reorder: (id: string, direction: 'up' | 'down') => Promise<void>
  unsubscribe: () => void
}

function getSiblings(state: CategoriesState, cat: Category): Category[] {
  const parentKey = cat.parentId ?? '__root__'
  return state.categories
    .filter((c) => c.type === cat.type && (c.parentId ?? '__root__') === parentKey)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export const useCategoriesStore = create<CategoriesState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    categories: [],
    ...base,
    add: (data) => {
      // Compute next sortOrder: the max among same-type, same-parent siblings + 1
      const existing = get().categories.filter(
        (c) => c.type === data.type && (c.parentId ?? '') === (data.parentId ?? ''),
      )
      const nextOrder = existing.length > 0 ? Math.max(...existing.map((c) => c.sortOrder)) + 1 : 0
      const insertData = {
        ...mapKeysToSnake(data),
        sort_order: nextOrder,
      } as Database['public']['Tables']['categories']['Insert']
      return _add(insertData)
    },
    update: (id, data) =>
      _update(id, mapKeysToSnake(data) as Database['public']['Tables']['categories']['Update']),
    getByType: (type) => get().categories.filter((c) => c.type === type),
    getChildren: (parentId) => get().categories.filter((c) => c.parentId === parentId),
    getRootCategories: (type) => get().categories.filter((c) => c.type === type && !c.parentId),
    reorder: async (id, direction) => {
      const state = get()
      const cat = state.categories.find((c) => c.id === id)
      if (!cat) return

      const siblings = getSiblings(state, cat)
      const idx = siblings.findIndex((c) => c.id === id)
      if (idx === -1) return

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) return

      const other = siblings[swapIdx]
      const catOrder = cat.sortOrder
      const otherOrder = other.sortOrder

      // Persist both updates
      await _update(cat.id, { sort_order: otherOrder } as Record<string, unknown>)
      await _update(other.id, { sort_order: catOrder } as Record<string, unknown>)

      // Optimistic local update (swap sortOrder in state)
      set((s: CategoriesState) => ({
        categories: s.categories.map((c) => {
          if (c.id === cat.id) return { ...c, sortOrder: otherOrder }
          if (c.id === other.id) return { ...c, sortOrder: catOrder }
          return c
        }),
      }))
    },
  }
})
