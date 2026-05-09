import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import type { Category, NewCategory, CategoryKind } from "@/types"

interface CategoriesState {
  categories: Category[]
  loading: boolean
  load: () => Promise<void>
  add: (data: NewCategory) => Promise<Category>
  update: (id: string, data: Partial<NewCategory>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByType: (type: CategoryKind) => Category[]
  getById: (id: string) => Category | undefined
  getChildren: (parentId: string) => Category[]
  getRootCategories: (type: CategoryKind) => Category[]
}

export const useCategoriesStore = create<CategoriesState>()((set, get) => ({
  categories: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from("categories").select("*")
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories: Category[] = (data ?? []).map((row: any) => ({
      ...mapKeysToCamel<Category>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }))
    set({ categories, loading: false })
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from("categories")
      .insert(mapKeysToSnake(data) as Record<string, unknown>)
      .select()
      .single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = inserted as any
    const category: Category = {
      ...mapKeysToCamel<Category>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
    await get().load()
    return category
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("categories")
      .update(mapKeysToSnake(data) as Record<string, unknown>)
      .eq("id", id)
    if (error) throw error
    await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from("categories").delete().eq("id", id)
    if (error) throw error
    await get().load()
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
}))
