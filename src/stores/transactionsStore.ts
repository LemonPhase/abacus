import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type {
  Transaction,
  NewTransaction,
  TransactionKind,
  TransferCreateInput,
  TransferEditInput,
  TransferConvertInput,
} from '@/types'
import type { Database } from '@/supabase/database.types'

type TransactionRow = Database['public']['Tables']['transactions']['Row']

function mapRow(row: TransactionRow): Transaction {
  return {
    ...mapKeysToCamel<Transaction>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    date: new Date(row.date),
    transferId: row.transfer_id ?? undefined,
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
  bulkAdd: (data: NewTransaction[]) => Promise<Transaction[]>
  update: (id: string, data: Partial<NewTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  createTransfer: (input: TransferCreateInput) => Promise<Transaction[]>
  editTransfer: (input: TransferEditInput) => Promise<Transaction[]>
  deleteTransfer: (transferId: string) => Promise<void>
  convertTransferToPlain: (input: TransferConvertInput) => Promise<Transaction>
  getByAccount: (accountId: string) => Transaction[]
  getByCategory: (categoryId: string) => Transaction[]
  getByDateRange: (from: Date, to: Date) => Transaction[]
  getByType: (type: TransactionKind) => Transaction[]
  getById: (id: string) => Transaction | undefined
  unsubscribe: () => void
  reset: () => void
}

export const useTransactionsStore = create<TransactionsState>()((set, get) => {
  // Bumped by reset(): a response landing after an auth identity change must
  // never repopulate the store (mirrors crudStore's generation guard).
  let rpcGeneration = 0
  const { _add, _bulkAdd, _update, reset, ...base } = crud(set, get)

  const toDateString = (d: Date) => d.toISOString().slice(0, 10)

  // Replace-by-id, prepend new rows (matches prependInsert ordering).
  const upsertLegs = (legs: Transaction[]) => {
    set((state) => {
      const ids = new Set(legs.map((l) => l.id))
      const kept = state.transactions.filter((t) => !ids.has(t.id))
      return { transactions: [...legs, ...kept] }
    })
  }

  return {
    transactions: [],
    ...base,
    reset: () => {
      rpcGeneration++
      reset()
    },
    add: (data) => {
      const payload = {
        ...data,
        baseAmount: data.baseAmount ?? data.amount,
        baseCurrency: data.baseCurrency ?? data.currency,
        categoryId: data.categoryId || null,
      }
      return _add(mapKeysToSnake(payload) as Database['public']['Tables']['transactions']['Insert'])
    },
    bulkAdd: (data) => {
      const payloads = data.map((d) => ({
        ...d,
        baseAmount: d.amount,
        baseCurrency: d.currency,
        categoryId: d.categoryId || null,
      }))
      return _bulkAdd(
        payloads.map((p) =>
          mapKeysToSnake(p),
        ) as Database['public']['Tables']['transactions']['Insert'][],
      )
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
    // Transfer mutations run as single atomic RPCs (migration
    // 20260917000002_atomic_transfers.sql); the returned legs update local
    // state and realtime keeps any other view in sync.
    createTransfer: async (input) => {
      const gen = rpcGeneration
      set({ error: null })
      const { data, error } = await supabase.rpc('create_transfer', {
        p_idempotency_key: input.idempotencyKey,
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount: input.amount,
        p_converted_amount: input.convertedAmount,
        p_category_id: input.categoryId,
        p_date: toDateString(input.date),
        p_description: input.description ?? null,
        p_out_transaction_id: input.existingTransactionId ?? null,
      })
      if (gen !== rpcGeneration) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message })
        throw error
      }
      const legs = ((data ?? []) as TransactionRow[]).map(mapRow)
      upsertLegs(legs)
      return legs
    },
    editTransfer: async (input) => {
      const gen = rpcGeneration
      set({ error: null })
      const { data, error } = await supabase.rpc('edit_transfer', {
        p_transfer_id: input.transferId,
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount: input.amount,
        p_converted_amount: input.convertedAmount,
        p_category_id: input.categoryId,
        p_date: toDateString(input.date),
        p_description: input.description ?? null,
      })
      if (gen !== rpcGeneration) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message })
        throw error
      }
      const legs = ((data ?? []) as TransactionRow[]).map(mapRow)
      upsertLegs(legs)
      return legs
    },
    deleteTransfer: async (transferId) => {
      const gen = rpcGeneration
      set({ error: null })
      const { error } = await supabase.rpc('delete_transfer', { p_transfer_id: transferId })
      if (gen !== rpcGeneration) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message })
        throw error
      }
      set((state) => ({
        transactions: state.transactions.filter((t) => t.transferId !== transferId),
      }))
    },
    convertTransferToPlain: async (input) => {
      const gen = rpcGeneration
      set({ error: null })
      const previous = get().transactions.find((t) => t.id === input.transactionId)
      const { data, error } = await supabase.rpc('convert_transfer_to_plain', {
        p_transaction_id: input.transactionId,
        p_new_type: input.newType,
        p_amount: input.amount,
        p_new_account_id: input.accountId,
        p_category_id: input.categoryId,
        p_date: toDateString(input.date),
        p_description: input.description ?? null,
      })
      if (gen !== rpcGeneration) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message })
        throw error
      }
      const row = mapRow(data as TransactionRow)
      set((state) => ({
        transactions: [
          row,
          ...state.transactions.filter((t) => {
            if (t.id === row.id) return false
            if (previous?.correlativeId && t.id === previous.correlativeId) return false
            if (previous?.transferId && t.transferId === previous.transferId) return false
            return true
          }),
        ],
      }))
      return row
    },
  }
})
