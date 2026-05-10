import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type { Transaction, NewTransaction, TransactionKind } from '@/types'
import type { Database } from '@/supabase/database.types'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

function mapRow(row: TransactionRow): Transaction {
  return {
    ...mapKeysToCamel<Transaction>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    date: new Date(row.date),
  }
}

const crud = createCrudSlice<Transaction>({
  table: 'transactions',
  collectionKey: 'transactions',
  order: { column: 'date', ascending: false },
  prependInsert: true,
  mapRow: (row) => mapRow(row as TransactionRow),
})

interface TransactionsState {
  transactions: Transaction[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (
    data: NewTransaction & { baseAmount?: number; baseCurrency?: string },
  ) => Promise<Transaction>
  update: (id: string, data: Partial<NewTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByAccount: (accountId: string) => Transaction[]
  getByCategory: (categoryId: string) => Transaction[]
  getByDateRange: (from: Date, to: Date) => Transaction[]
  getByType: (type: TransactionKind) => Transaction[]
  getById: (id: string) => Transaction | undefined
  unsubscribe: () => void
}

export const useTransactionsStore = create<TransactionsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    transactions: [],
    ...base,
    add: (data) => {
      const payload = {
        ...data,
        baseAmount: data.baseAmount ?? data.amount,
        baseCurrency: data.baseCurrency ?? data.currency,
        categoryId: data.categoryId || null,
      }
      return _add(mapKeysToSnake(payload) as Database['public']['Tables']['transactions']['Insert'])
    },
    update: (id, data) => {
      const clean: Record<string, unknown> = { ...data }
      if ('categoryId' in data && !data.categoryId) {
        clean.categoryId = null
      }
      return _update(
        id,
        mapKeysToSnake(clean) as Database['public']['Tables']['transactions']['Update'],
      )
    },
    getByAccount: (accountId) => get().transactions.filter((t) => t.accountId === accountId),
    getByCategory: (categoryId) => get().transactions.filter((t) => t.categoryId === categoryId),
    getByDateRange: (from, to) => get().transactions.filter((t) => t.date >= from && t.date <= to),
    getByType: (type) => get().transactions.filter((t) => t.type === type),
  }
})
