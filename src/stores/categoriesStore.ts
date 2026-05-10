import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { subscribeToTable } from '@/lib/realtime'
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

export const useCategoriesStore = create<CategoriesState>()((set, get) => ({
  categories: [],
  loading: false,
  error: null,
  _unsub: null,
  clearError: () => set({ error: null }),

  load: async (options) => {
    set({ loading: true, error: null })
    const { limit, offset } = options ?? {}
    let query = supabase.from('categories').select('*')
    if (offset !== undefined && limit !== undefined) {
      query = query.range(offset, offset + limit - 1)
    } else if (limit !== undefined) {
      query = query.limit(limit)
    }
    const { data, error } = await query
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }
    const categories: Category[] = (data ?? []).map(mapRow)
    set({ categories, loading: false })

    if (!get()._unsub) {
      const unsub = subscribeToTable('categories', (payload) => {
        if (payload.eventType === 'INSERT') {
          const category = mapRow(payload.new as CategoryRow)
          set((state) => {
            if (state.categories.some((c) => c.id === category.id)) return state
            return { categories: [...state.categories, category] }
          })
        } else if (payload.eventType === 'UPDATE') {
          const category = mapRow(payload.new as CategoryRow)
          set((state) => ({
            categories: state.categories.map((c) => (c.id === category.id ? category : c)),
          }))
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            categories: state.categories.filter((c) => c.id !== id),
          }))
        }
      })
      set({ _unsub: unsub })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from('categories')
      .insert(mapKeysToSnake(data) as Database['public']['Tables']['categories']['Insert'])
      .select()
      .single()
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }
    const category = mapRow(inserted as CategoryRow)
    set((state) => {
      if (state.categories.some((item) => item.id === category.id)) return state
      return { categories: [...state.categories, category] }
    })
    return category
  },

  update: async (id, data) => {
    set({ error: null })
    const { error } = await supabase
      .from('categories')
      .update(mapKeysToSnake(data) as Database['public']['Tables']['categories']['Update'])
      .eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      categories: state.categories.map((item) =>
        item.id === id ? { ...item, ...data } : item,
      ) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      categories: state.categories.filter((item) => item.id !== id),
    }))
  },

  getByType: (type) => {
    return get().categories.filter((c) => c.type === type)
  },

  getById: (id) => {
    return get().categories.find((c) => c.id === id)
  },

  getChildren: (parentId) => {
    return get().categories.filter((c) => c.parentId === parentId)
  },

  getRootCategories: (type) => {
    return get().categories.filter((c) => c.type === type && !c.parentId)
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },
}))
