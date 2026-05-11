import { supabase } from '@/supabase/client'
import { subscribeToTable } from '@/supabase/realtime'
import { mapKeysToCamel } from '@/lib/case'
import type { Database } from '@/supabase/database.types'

type TableName = keyof Database['public']['Tables']

interface CrudConfig<T extends { id: string }> {
  table: TableName
  collectionKey: string
  mapRow: (row: Record<string, unknown>) => T
  order?: { column: string; ascending: boolean }
  /** Prepend new items instead of appending (e.g. transactions sorted by date desc) */
  prependInsert?: boolean
}

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

type SetFn = (
  partial:
    | Partial<Record<string, unknown>>
    | ((state: Record<string, unknown>) => Partial<Record<string, unknown>>),
) => void

type GetFn = () => Record<string, unknown>

/**
 * A Zustand store slice factory for CRUD operations on Supabase tables.
 *
 * Each domain store spreads the returned base state and wraps `_add`/`_update`
 * with type-safe public methods. The factory handles:
 * - Loading state & error management
 * - Supabase select/insert/update/delete queries
 * - Realtime subscription (INSERT/UPDATE/DELETE)
 * - Optimistic local state updates with duplicate guards
 * - Cleanup via `unsubscribe`
 */
export function createCrudSlice<T extends { id: string }>(config: CrudConfig<T>) {
  const { table, collectionKey, mapRow, order, prependInsert } = config

  function getItems(getter: GetFn): T[] {
    return (getter() as Record<string, T[]>)[collectionKey] ?? []
  }

  function handleRealtime(set: SetFn, payload: RealtimePayload) {
    if (payload.eventType === 'INSERT') {
      const item = mapRow(payload.new)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (list.some((i) => i.id === item.id)) return state
        return { [collectionKey]: prependInsert ? [item, ...list] : [...list, item] }
      })
    } else if (payload.eventType === 'UPDATE') {
      const item = mapRow(payload.new)
      set((state: Record<string, unknown>) => ({
        [collectionKey]: getItems(() => state).map((i) => (i.id === item.id ? item : i)),
      }))
    } else if (payload.eventType === 'DELETE') {
      const id = (payload.old as { id: string }).id
      set((state: Record<string, unknown>) => ({
        [collectionKey]: getItems(() => state).filter((i) => i.id !== id),
      }))
    }
  }

  // set/get come from Zustand, which has store-specific types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function build(set: any, get: any) {
    const load = async (options?: { limit?: number; offset?: number }) => {
      set({ loading: true, error: null })
      const { limit, offset } = options ?? {}
      let query = supabase.from(table).select('*')
      if (order) {
        query = query.order(order.column, { ascending: order.ascending })
      }
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
      const items: T[] = (data ?? []).map(mapRow)
      set({ [collectionKey]: items, loading: false })

      if (!get()._unsub) {
        const unsub = subscribeToTable(table as string, (payload) => {
          handleRealtime(set, payload)
        })
        set({ _unsub: unsub })
      }
    }

    const internalAdd = async (data: Record<string, unknown>): Promise<T> => {
      set({ error: null })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const insertData: Record<string, unknown> =
        session?.user?.id && !('user_id' in data) ? { ...data, user_id: session.user.id } : data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error } = await (supabase.from as any)(table)
        .insert(insertData)
        .select()
        .single()
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      const item = mapRow(inserted as Record<string, unknown>)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (list.some((i) => i.id === item.id)) return state
        return { [collectionKey]: prependInsert ? [item, ...list] : [...list, item] }
      })
      return item
    }

    const internalBulkAdd = async (data: Record<string, unknown>[]): Promise<T[]> => {
      if (data.length === 0) return []
      set({ error: null })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const insertData = session?.user?.id
        ? data.map((d) => ('user_id' in d ? d : { ...d, user_id: session.user.id }))
        : data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error } = await (supabase.from as any)(table)
        .insert(insertData)
        .select()
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      const items = (inserted as Record<string, unknown>[]).map(mapRow)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        const newList = prependInsert ? [...items, ...list] : [...list, ...items]
        return { [collectionKey]: newList }
      })
      return items
    }

    const internalUpdate = async (id: string, data: Record<string, unknown>): Promise<void> => {
      set({ error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(table).update(data).eq('id', id)
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      const camelData = mapKeysToCamel<Record<string, unknown>>(data)
      set((state: Record<string, unknown>) => ({
        [collectionKey]: getItems(() => state).map((item) =>
          item.id === id ? { ...item, ...camelData } : item,
        ),
      }))
    }

    const remove = async (id: string): Promise<void> => {
      set({ error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(table).delete().eq('id', id)
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      set((state: Record<string, unknown>) => ({
        [collectionKey]: getItems(() => state).filter((item) => item.id !== id),
      }))
    }

    const getById = (id: string): T | undefined => {
      return getItems(get).find((item) => item.id === id)
    }

    const unsubscribe = () => {
      const unsub = get()._unsub as (() => void) | null
      unsub?.()
      set({ _unsub: null })
    }

    return {
      loading: false,
      error: null,
      _unsub: null,
      clearError: () => set({ error: null }),
      load,
      _add: internalAdd,
      _bulkAdd: internalBulkAdd,
      _update: internalUpdate,
      remove,
      getById,
      unsubscribe,
    }
  }
}
