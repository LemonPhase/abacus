import { create } from "zustand"
import { db } from "@/db"
import { nanoid } from "@/db/nanoid"
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
    const transactions = await db.transactions.orderBy("date").reverse().toArray()
    set({ transactions, loading: false })
  },

  add: async (data) => {
    const now = new Date()
    const transaction: Transaction = {
      ...data,
      id: nanoid(),
      baseAmount: data.baseAmount ?? data.amount,
      baseCurrency: data.baseCurrency ?? data.currency,
      createdAt: now,
      updatedAt: now,
    }
    await db.transactions.add(transaction)
    await get().load()
    return transaction
  },

  update: async (id, data) => {
    await db.transactions.update(id, { ...data, updatedAt: new Date() })
    await get().load()
  },

  remove: async (id) => {
    await db.transactions.delete(id)
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
