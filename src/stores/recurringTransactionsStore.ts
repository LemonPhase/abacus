import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
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
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewRecurringTransaction) => Promise<RecurringTransaction>
  update: (id: string, data: Partial<NewRecurringTransaction>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => RecurringTransaction | undefined
  getActive: () => RecurringTransaction[]
  getDue: () => RecurringTransaction[]
  unsubscribe: () => void
}

export const useRecurringTransactionsStore = create<RecurringTransactionsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    items: [],
    ...base,
    add: (data) => {
      const payload = {
        ...data,
        categoryId: data.categoryId || null,
        dayOfMonth: data.dayOfMonth ?? null,
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
