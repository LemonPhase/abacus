import { create } from "zustand"
import { db } from "@/db"
import { nanoid } from "@/db/nanoid"
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
    const categories = await db.categories.toArray()
    set({ categories, loading: false })
  },

  add: async (data) => {
    const category: Category = { ...data, id: nanoid() }
    await db.categories.add(category)
    await get().load()
    return category
  },

  update: async (id, data) => {
    await db.categories.update(id, data)
    await get().load()
  },

  remove: async (id) => {
    await db.categories.delete(id)
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
