import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { Category, NewCategory, CategoryKind } from "@/types"
import type { Database } from "@/supabase/database.types"

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"]

let _unsub: (() => void) | null = null

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
  clearError: () => void
  load: () => Promise<void>
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
  clearError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.from("categories").select("*")
    if (error) { set({ error: error.message, loading: false }); throw error }
    const categories: Category[] = (data ?? []).map(mapRow)
    set({ categories, loading: false })

    if (!_unsub) {
      _unsub = subscribeToTable("categories", (payload) => {
        if (payload.eventType === "INSERT") {
          const category = mapRow(payload.new as CategoryRow)
          set((state) => {
            if (state.categories.some((c) => c.id === category.id)) return state
            return { categories: [...state.categories, category] }
          })
        } else if (payload.eventType === "UPDATE") {
          const category = mapRow(payload.new as CategoryRow)
          set((state) => ({
            categories: state.categories.map((c) => (c.id === category.id ? category : c)),
          }))
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            categories: state.categories.filter((c) => c.id !== id),
          }))
        }
      })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from("categories")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["categories"]["Insert"])
      .select()
      .single()
    if (error) { set({ error: error.message, loading: false }); throw error }
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
      .from("categories")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["categories"]["Update"])
      .eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      categories: state.categories.map((item) => (item.id === id ? { ...item, ...data } : item)) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from("categories").delete().eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

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
    if (_unsub) {
      _unsub()
      _unsub = null
    }
  },
}))
