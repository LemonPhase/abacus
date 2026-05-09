import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import type { Transaction, NewTransaction, TransactionKind } from "@/types"

interface TransactionsState {
  transactions: Transaction[]
  loading: boolean
  load: () => Promise<void>
  add: (data: NewTransaction & { baseAmount?: number; baseCurrency?: string }) => Promise<Transaction>
  update: (id: string, data: Partial<NewTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByAccount: (accountId: string) => Transaction[]
  getByCategory: (categoryId: string) => Transaction[]
  getByDateRange: (from: Date, to: Date) => Transaction[]
  getByType: (type: TransactionKind) => Transaction[]
  getById: (id: string) => Transaction | undefined
}

export const useTransactionsStore = create<TransactionsState>()((set, get) => ({
  transactions: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions: Transaction[] = (data ?? []).map((row: any) => ({
      ...mapKeysToCamel<Transaction>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      date: new Date(row.date),
    }))
    set({ transactions, loading: false })
  },

  add: async (data) => {
    const payload = {
      ...data,
      baseAmount: data.baseAmount ?? data.amount,
      baseCurrency: data.baseCurrency ?? data.currency,
    }
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert(mapKeysToSnake(payload) as Record<string, unknown>)
      .select()
      .single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = inserted as any
    const transaction: Transaction = {
      ...mapKeysToCamel<Transaction>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      date: new Date(row.date),
    }
    await get().load()
    return transaction
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("transactions")
      .update(mapKeysToSnake(data) as Record<string, unknown>)
      .eq("id", id)
    if (error) throw error
    await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id)
    if (error) throw error
    await get().load()
  },

  getByAccount: (accountId) => {
    return get().transactions.filter((t) => t.accountId === accountId)
  },

  getByCategory: (categoryId) => {
    return get().transactions.filter((t) => t.categoryId === categoryId)
  },

  getByDateRange: (from, to) => {
    return get().transactions.filter((t) => t.date >= from && t.date <= to)
  },

  getByType: (type) => {
    return get().transactions.filter((t) => t.type === type)
  },

  getById: (id) => {
    return get().transactions.find((t) => t.id === id)
  },
}))
