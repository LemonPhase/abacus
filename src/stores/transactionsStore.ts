import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getRate, type RateQuote } from '@/services/exchange'
import { roundCurrency } from '@/lib/currency'
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
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewTransaction) => Promise<Transaction>
  bulkAdd: (data: NewTransaction[]) => Promise<Transaction[]>
  update: (id: string, data: Partial<NewTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByAccount: (accountId: string) => Transaction[]
  getByCategory: (categoryId: string) => Transaction[]
  getByDateRange: (from: Date, to: Date) => Transaction[]
  getByType: (type: TransactionKind) => Transaction[]
  getById: (id: string) => Transaction | undefined
  unsubscribe: () => void
  reset: () => void
}

export const useTransactionsStore = create<TransactionsState>()((set, get) => {
  const { _add, _bulkAdd, _update, ...base } = crud(set, get)
  return {
    transactions: [],
    ...base,
    add: async (data) => {
      const baseFields = await computeBase(data.amount, data.currency, data.date)
      const payload = {
        ...data,
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
          let baseFields: BaseFields
          if (d.currency === reporting) {
            baseFields = {
              baseAmount: roundCurrency(d.amount, reporting),
              baseCurrency: reporting,
              fxRate: null,
              fxDate: null,
              baseAmountStale: false,
            }
          } else {
            const quote = await quoteFor(d.currency, d.date)
            baseFields = quote
              ? {
                  baseAmount: roundCurrency(d.amount * quote.rate, reporting),
                  baseCurrency: reporting,
                  fxRate: quote.rate,
                  fxDate: quote.asOf,
                  baseAmountStale: false,
                }
              : {
                  baseAmount: d.amount,
                  baseCurrency: d.currency,
                  fxRate: null,
                  fxDate: null,
                  baseAmountStale: true,
                }
          }
          return {
            ...d,
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
      // Recalculate derived base fields whenever the value they were derived
      // from changes (amount, currency, or date).
      if ('amount' in data || 'currency' in data || 'date' in data) {
        const current = get().getById(id)
        if (current) {
          const baseFields = await computeBase(
            (data.amount as number | undefined) ?? current.amount,
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
  }
})
