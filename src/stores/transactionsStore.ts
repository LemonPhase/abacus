import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice, type LoadOptions } from '@/stores/crudStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { getRate, type RateQuote } from '@/services/exchange'
import { roundCurrency } from '@/lib/currency'
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
  mapRow: (row) => mapRow(row as TransactionRow),
})

/** Base (reporting) fields derived from amount/currency at write time. */
interface BaseFields {
  baseAmount: number
  baseCurrency: string
  fxRate: number | null
  fxDate: string | null
  baseAmountStale: boolean
}

/**
 * Convert an amount into the user's reporting currency, recording rate/date
 * provenance. When no honest rate is available the original amount is kept,
 * labeled with its own currency, and flagged stale so aggregates exclude it —
 * never silently converted 1:1.
 */
async function computeBase(amount: number, currency: string, date: Date): Promise<BaseFields> {
  const reporting = useSettingsStore.getState().baseCurrency
  if (currency === reporting) {
    return {
      baseAmount: roundCurrency(amount, reporting),
      baseCurrency: reporting,
      fxRate: null,
      fxDate: null,
      baseAmountStale: false,
    }
  }
  const quote = await getRate(currency, reporting, date)
  if (quote) {
    return {
      baseAmount: roundCurrency(amount * quote.rate, reporting),
      baseCurrency: reporting,
      fxRate: quote.rate,
      fxDate: quote.asOf,
      baseAmountStale: false,
    }
  }
  return {
    baseAmount: amount,
    baseCurrency: currency,
    fxRate: null,
    fxDate: null,
    baseAmountStale: true,
  }
}

interface TransactionsState {
  transactions: Transaction[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: LoadOptions) => Promise<void>
  loadMore: () => Promise<void>
  loadingMore: boolean
  hasMore: boolean
  total: number | null
  add: (data: NewTransaction) => Promise<Transaction>
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

  // Replace-by-id, prepend new rows (newest first, matching the date-desc
  // load order).
  const upsertLegs = (legs: Transaction[]) => {
    set((state) => {
      const ids = new Set(legs.map((l) => l.id))
      const kept = state.transactions.filter((t) => !ids.has(t.id))
      return { transactions: [...legs, ...kept] }
    })
  }

  // Base-amount provenance for one transfer leg, in that leg's account
  // currency (the out leg is signed negative, mirroring its row).
  const legBase = async (accountId: string, amount: number, date: Date) => {
    const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId)
    if (!account) throw new Error(`Account ${accountId} not found`)
    return computeBase(amount, account.currency, date)
  }

  // Flatten BaseFields into prefixed RPC params (prefix 'p_out_'/'p_in_' for
  // transfer legs, 'p_' for the single row of convert_transfer_to_plain).
  // Optional RPC args are absent rather than null: Postgres applies the
  // column's null default either way.
  const rpcBaseParams = (prefix: string, b: BaseFields) => ({
    [`${prefix}base_amount`]: b.baseAmount,
    [`${prefix}base_currency`]: b.baseCurrency,
    [`${prefix}fx_rate`]: b.fxRate ?? undefined,
    [`${prefix}fx_date`]: b.fxDate ?? undefined,
    [`${prefix}base_stale`]: b.baseAmountStale,
  })

  return {
    transactions: [],
    ...base,
    reset: () => {
      rpcGeneration++
      reset()
    },
    add: async (data) => {
      // Money enters the store in minor units (20260918000001_input_invariants
      // rejects sub-cent amounts): round typed input to the row's currency.
      const amount = roundCurrency(data.amount, data.currency)
      const baseFields = await computeBase(amount, data.currency, data.date)
      const payload = {
        ...data,
        amount,
        categoryId: data.categoryId || null,
        ...baseFields,
      }
      return _add(mapKeysToSnake(payload) as Database['public']['Tables']['transactions']['Insert'])
    },
    bulkAdd: async (data) => {
      const reporting = useSettingsStore.getState().baseCurrency
      // One quote lookup per distinct currency per batch, so importing many
      // historical rows doesn't fire one request per row. Memoize the promise
      // so concurrent rows share a single in-flight lookup.
      const quotePromises = new Map<string, Promise<RateQuote | null>>()
      const quoteFor = (currency: string, date: Date) => {
        if (!quotePromises.has(currency)) {
          quotePromises.set(currency, getRate(currency, reporting, date))
        }
        return quotePromises.get(currency)!
      }
      const payloads = await Promise.all(
        data.map(async (d) => {
          const amount = roundCurrency(d.amount, d.currency)
          let baseFields: BaseFields
          if (d.currency === reporting) {
            baseFields = {
              baseAmount: roundCurrency(amount, reporting),
              baseCurrency: reporting,
              fxRate: null,
              fxDate: null,
              baseAmountStale: false,
            }
          } else {
            const quote = await quoteFor(d.currency, d.date)
            baseFields = quote
              ? {
                  baseAmount: roundCurrency(amount * quote.rate, reporting),
                  baseCurrency: reporting,
                  fxRate: quote.rate,
                  fxDate: quote.asOf,
                  baseAmountStale: false,
                }
              : {
                  baseAmount: amount,
                  baseCurrency: d.currency,
                  fxRate: null,
                  fxDate: null,
                  baseAmountStale: true,
                }
          }
          return {
            ...d,
            amount,
            categoryId: d.categoryId || null,
            ...baseFields,
          }
        }),
      )
      return _bulkAdd(
        payloads.map((p) =>
          mapKeysToSnake(p),
        ) as Database['public']['Tables']['transactions']['Insert'][],
      )
    },
    update: async (id, data) => {
      const clean: Record<string, unknown> = { ...data }
      if ('categoryId' in data && !data.categoryId) {
        clean.categoryId = null
      }
      const current = get().getById(id)
      if (typeof data.amount === 'number') {
        const currency =
          (data.currency as string | undefined) ??
          current?.currency ??
          useSettingsStore.getState().baseCurrency
        clean.amount = roundCurrency(data.amount, currency)
      }
      // Recalculate derived base fields whenever the value they were derived
      // from changes (amount, currency, or date).
      if ('amount' in data || 'currency' in data || 'date' in data) {
        if (current) {
          const baseFields = await computeBase(
            (clean.amount as number | undefined) ?? current.amount,
            (data.currency as string | undefined) ?? current.currency,
            (data.date as Date | undefined) ?? current.date,
          )
          Object.assign(clean, baseFields)
        }
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
    //
    // Base-amount provenance is computed HERE, before the RPC: the reporting
    // currency lives in localStorage-only settings and FX quotes need the
    // provider fetch — neither is reachable from SQL. The store's computeBase
    // (the same path plain writes use) produces per-leg provenance, so a leg
    // with no available rate is flagged stale instead of silently converted
    // 1:1, exactly matching the add/bulkAdd/update semantics from
    // 20260917000003_currency_provenance.sql.
    createTransfer: async (input) => {
      const gen = rpcGeneration
      set({ error: null })
      // Leg amounts in their account's minor units (DB rejects sub-cent).
      const accounts = useAccountsStore.getState().accounts
      const reporting = useSettingsStore.getState().baseCurrency
      const amount = roundCurrency(
        input.amount,
        accounts.find((a) => a.id === input.fromAccountId)?.currency ?? reporting,
      )
      const convertedAmount = roundCurrency(
        input.convertedAmount,
        accounts.find((a) => a.id === input.toAccountId)?.currency ?? reporting,
      )
      const [outBase, inBase] = await Promise.all([
        legBase(input.fromAccountId, -amount, input.date),
        legBase(input.toAccountId, convertedAmount, input.date),
      ])
      const { data, error } = await supabase.rpc('create_transfer', {
        p_idempotency_key: input.idempotencyKey,
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount: amount,
        p_converted_amount: convertedAmount,
        p_category_id: input.categoryId ?? undefined,
        p_date: toDateString(input.date),
        p_description: input.description ?? undefined,
        p_out_transaction_id: input.existingTransactionId ?? undefined,
        ...rpcBaseParams('p_out_', outBase),
        ...rpcBaseParams('p_in_', inBase),
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
      // Leg amounts in their account's minor units (DB rejects sub-cent).
      const accounts = useAccountsStore.getState().accounts
      const reporting = useSettingsStore.getState().baseCurrency
      const amount = roundCurrency(
        input.amount,
        accounts.find((a) => a.id === input.fromAccountId)?.currency ?? reporting,
      )
      const convertedAmount = roundCurrency(
        input.convertedAmount,
        accounts.find((a) => a.id === input.toAccountId)?.currency ?? reporting,
      )
      const [outBase, inBase] = await Promise.all([
        legBase(input.fromAccountId, -amount, input.date),
        legBase(input.toAccountId, convertedAmount, input.date),
      ])
      const { data, error } = await supabase.rpc('edit_transfer', {
        p_transfer_id: input.transferId,
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount: amount,
        p_converted_amount: convertedAmount,
        p_category_id: input.categoryId ?? undefined,
        p_date: toDateString(input.date),
        p_description: input.description ?? undefined,
        ...rpcBaseParams('p_out_', outBase),
        ...rpcBaseParams('p_in_', inBase),
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
      // Amount in the target account's minor units (DB rejects sub-cent).
      const amount = roundCurrency(
        input.amount,
        useAccountsStore.getState().accounts.find((a) => a.id === input.accountId)?.currency ??
          useSettingsStore.getState().baseCurrency,
      )
      const base = await legBase(input.accountId, amount, input.date)
      const { data, error } = await supabase.rpc('convert_transfer_to_plain', {
        p_transaction_id: input.transactionId,
        p_new_type: input.newType,
        p_amount: amount,
        p_new_account_id: input.accountId,
        p_category_id: input.categoryId ?? undefined,
        p_date: toDateString(input.date),
        p_description: input.description ?? undefined,
        ...rpcBaseParams('p_', base),
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
