import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { subscribeToTable } from '@/lib/realtime'
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

export const useTransactionsStore = create<TransactionsState>()((set, get) => ({
  transactions: [],
  loading: false,
  error: null,
  _unsub: null,
  clearError: () => set({ error: null }),

  load: async (options) => {
    set({ loading: true, error: null })
    const { limit, offset } = options ?? {}
    let query = supabase.from('transactions').select('*').order('date', { ascending: false })
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
    const transactions: Transaction[] = (data ?? []).map(mapRow)
    set({ transactions, loading: false })

    if (!get()._unsub) {
      const unsub = subscribeToTable('transactions', (payload) => {
        if (payload.eventType === 'INSERT') {
          const transaction = mapRow(payload.new as TransactionRow)
          set((state) => {
            if (state.transactions.some((t) => t.id === transaction.id)) return state
            return { transactions: [transaction, ...state.transactions] }
          })
        } else if (payload.eventType === 'UPDATE') {
          const transaction = mapRow(payload.new as TransactionRow)
          set((state) => ({
            transactions: state.transactions.map((t) =>
              t.id === transaction.id ? transaction : t,
            ),
          }))
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            transactions: state.transactions.filter((t) => t.id !== id),
          }))
        }
      })
      set({ _unsub: unsub })
    }
  },

  add: async (data) => {
    set({ error: null })
    const payload = {
      ...data,
      baseAmount: data.baseAmount ?? data.amount,
      baseCurrency: data.baseCurrency ?? data.currency,
      categoryId: data.categoryId || null,
    }
    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert(mapKeysToSnake(payload) as Database['public']['Tables']['transactions']['Insert'])
      .select()
      .single()
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }
    const transaction = mapRow(inserted as TransactionRow)
    set((state) => {
      if (state.transactions.some((item) => item.id === transaction.id)) return state
      return { transactions: [...state.transactions, transaction] }
    })
    return transaction
  },

  update: async (id, data) => {
    set({ error: null })
    const clean: Record<string, unknown> = { ...data }
    if ('categoryId' in data && !data.categoryId) {
      clean.categoryId = null
    }
    const { error } = await supabase
      .from('transactions')
      .update(mapKeysToSnake(clean) as Database['public']['Tables']['transactions']['Update'])
      .eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      transactions: state.transactions.map((item) =>
        item.id === id ? { ...item, ...data } : item,
      ),
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      transactions: state.transactions.filter((item) => item.id !== id),
    }))
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
    get()._unsub?.()
    set({ _unsub: null })
  },
}))
