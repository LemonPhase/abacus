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
  unsubscribe: () => void
}

export const useCategoriesStore = create<CategoriesState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    categories: [],
    ...base,
    add: (data) =>
      _add(mapKeysToSnake(data) as Database['public']['Tables']['categories']['Insert']),
    update: (id, data) =>
      _update(id, mapKeysToSnake(data) as Database['public']['Tables']['categories']['Update']),
    getByType: (type) => get().categories.filter((c) => c.type === type),
    getChildren: (parentId) => get().categories.filter((c) => c.parentId === parentId),
    getRootCategories: (type) => get().categories.filter((c) => c.type === type && !c.parentId),
  }
})
