import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice, type LoadOptions } from '@/stores/crudStore'
import { roundCurrency } from '@/lib/currency'
import { useSettingsStore } from '@/stores/settingsStore'
import type { RecurringTransaction, NewRecurringTransaction } from '@/types'
import type { Database } from '@/supabase/database.types'

type RecurringRow = Database['public']['Tables']['recurring_transactions']['Row']

function mapRow(row: RecurringRow): RecurringTransaction {
  return {
    ...mapKeysToCamel<RecurringTransaction>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startDate: new Date(row.start_date),
    endDate: row.end_date ? new Date(row.end_date) : null,
    nextDate: new Date(row.next_date),
    dayOfMonth: row.day_of_month,
  }
}

const crud = createCrudSlice<RecurringTransaction>({
  table: 'recurring_transactions',
  collectionKey: 'items',
  order: { column: 'next_date', ascending: true },
  mapRow: (row) => mapRow(row as RecurringRow),
})

interface RecurringTransactionsState {
  items: RecurringTransaction[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: LoadOptions) => Promise<void>
  loadMore: () => Promise<void>
  loadingMore: boolean
  hasMore: boolean
  total: number | null
  add: (data: NewRecurringTransaction) => Promise<RecurringTransaction>
  update: (id: string, data: Partial<NewRecurringTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => RecurringTransaction | undefined
  getActive: () => RecurringTransaction[]
  getDue: () => RecurringTransaction[]
  unsubscribe: () => void
  reset: () => void
}

const clampDayOfMonth = (day: number | null | undefined): number | null =>
  day == null ? null : Math.min(31, Math.max(1, day))

export const useRecurringTransactionsStore = create<RecurringTransactionsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    items: [],
    ...base,
    add: (data) => {
      // Normalize to the domain the database enforces
      // (20260918000001_input_invariants.sql): positive money in the
      // account currency's minor units, interval >= 1, day-of-month 1..31.
      const payload = {
        ...data,
        amount: roundCurrency(data.amount, data.currency),
        categoryId: data.categoryId || null,
        dayOfMonth: clampDayOfMonth(data.dayOfMonth ?? null),
        intervalValue: Math.max(1, data.intervalValue),
        endDate: data.endDate ?? null,
      }
      return _add(
        mapKeysToSnake(payload) as Database['public']['Tables']['recurring_transactions']['Insert'],
      )
    },
    update: (id, data) => {
      const clean: Record<string, unknown> = { ...data }
      if ('categoryId' in data && !data.categoryId) {
        clean.categoryId = null
      }
      if ('dayOfMonth' in data && data.dayOfMonth === undefined) {
        clean.dayOfMonth = null
      }
      if ('endDate' in data && data.endDate === undefined) {
        clean.endDate = null
      }
      if (typeof data.amount === 'number') {
        const currency =
          data.currency ?? get().getById(id)?.currency ?? useSettingsStore.getState().baseCurrency
        clean.amount = roundCurrency(data.amount, currency)
      }
      if (typeof data.intervalValue === 'number') {
        clean.intervalValue = Math.max(1, data.intervalValue)
      }
      if ('dayOfMonth' in data) {
        clean.dayOfMonth = clampDayOfMonth(data.dayOfMonth as number | null | undefined)
      }
      return _update(
        id,
        mapKeysToSnake(clean) as Database['public']['Tables']['recurring_transactions']['Update'],
      )
    },
    getActive: () => get().items.filter((i) => i.isActive),
    getDue: () => {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      return get().items.filter((i) => i.isActive && new Date(i.nextDate) <= now)
    },
  }
})
