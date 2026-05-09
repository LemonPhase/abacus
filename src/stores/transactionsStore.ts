import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { Transaction, NewTransaction, TransactionKind } from "@/types"
import type { Database } from "@/supabase/database.types"

type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"]

let _unsub: (() => void) | null = null

function mapRow(row: TransactionRow): Transaction {
  return {
    ...mapKeysToCamel<Transaction>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    date: new Date(row.date),
  }
}

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
  unsubscribe: () => void
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
    const transactions: Transaction[] = (data ?? []).map(mapRow)
    set({ transactions, loading: false })

    if (!_unsub) {
      _unsub = subscribeToTable("transactions", (payload) => {
        if (payload.eventType === "INSERT") {
          const transaction = mapRow(payload.new as TransactionRow)
          set((state) => {
            if (state.transactions.some((t) => t.id === transaction.id)) return state
            return { transactions: [transaction, ...state.transactions] }
          })
        } else if (payload.eventType === "UPDATE") {
          const transaction = mapRow(payload.new as TransactionRow)
          set((state) => ({
            transactions: state.transactions.map((t) => (t.id === transaction.id ? transaction : t)),
          }))
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            transactions: state.transactions.filter((t) => t.id !== id),
          }))
        }
      })
    }
  },

  add: async (data) => {
    const payload = {
      ...data,
      baseAmount: data.baseAmount ?? data.amount,
      baseCurrency: data.baseCurrency ?? data.currency,
    }
    const { data: inserted, error } = await supabase
      .from("transactions")
      .insert(mapKeysToSnake(payload) as Database["public"]["Tables"]["transactions"]["Insert"])
      .select()
      .single()
    if (error) throw error
    const transaction = mapRow(inserted as TransactionRow)
    await get().load()
    return transaction
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("transactions")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["transactions"]["Update"])
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

  unsubscribe: () => {
    if (_unsub) {
      _unsub()
      _unsub = null
    }
  },
}))
