import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice, type LoadOptions } from '@/stores/crudStore'
import { computeBase } from '@/stores/transactionsStore'
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
  /** Apply the next due occurrence via the DB engine; returns occurrences applied (0 = nothing due). */
  applyNow: (id: string) => Promise<number>
  /** Catch-up-on-open: apply every due schedule. Idempotent (retries/tabs are no-ops). */
  catchUp: () => Promise<number>
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
      // Compare UTC calendar dates (the same domain as the server's
      // current_date, which alone decides due-ness inside the RPC). A local-
      // clock comparison would delay catch-up by up to 23h for UTC+ zones.
      const todayUtc = new Date().toISOString().slice(0, 10)
      return get().items.filter(
        (i) => i.isActive && new Date(i.nextDate).toISOString().slice(0, 10) <= todayUtc,
      )
    },
    applyNow: async (id) => {
      const item = get().getById(id)
      if (!item) throw new Error('Recurring transaction not found')
      try {
        const applied = await applyOccurrenceRpc(item)
        await get().load()
        return applied
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
        throw e
      }
    },
    catchUp: async () => {
      await get().load()
      // The RPC re-checks due-ness against the server date and is idempotent,
      // so a stale/over-inclusive client prefilter is always safe.
      const due = get().getDue()
      let total = 0
      try {
        for (const item of due) {
          // Drain capped catch-up windows: the RPC applies at most
          // APPLY_OCCURRENCE_CAP occurrences per call and always advances
          // next_date, so re-invoking while it returns the cap makes progress.
          let applied: number
          do {
            applied = await applyOccurrenceRpc(item)
            total += applied
          } while (applied === APPLY_OCCURRENCE_CAP)
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
        throw e
      }
      if (total > 0) await get().load()
      return total
    },
  }
})

// Per-call occurrence cap the SQL engine enforces (20260919000001
// _recurring_engine.sql, v_cap): catchUp drains capped windows by re-invoking
// while the RPC returns exactly this value.
const APPLY_OCCURRENCE_CAP = 100

// One engine call: inserts + advances (or deactivates) in a single DB
// transaction. Base-amount provenance is computed client-side like the
// transfer RPCs (the reporting currency is a client-only setting).
async function applyOccurrenceRpc(item: RecurringTransaction): Promise<number> {
  const base = await computeBase(item.amount, item.currency, new Date(item.nextDate))
  const { data, error } = await supabase.rpc('apply_recurring_occurrence', {
    p_recurring_id: item.id,
    p_base_amount: base.baseAmount,
    p_base_currency: base.baseCurrency,
    p_base_stale: base.baseAmountStale,
    p_fx_rate: base.fxRate ?? undefined,
    p_fx_date: base.fxDate ?? undefined,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}
