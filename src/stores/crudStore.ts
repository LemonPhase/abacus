import { supabase } from '@/supabase/client'
import { subscribeToTable } from '@/supabase/realtime'
import { mapKeysToCamel } from '@/lib/case'
import type { Database } from '@/supabase/database.types'

type TableName = keyof Database['public']['Tables']

/** PostgREST max_rows cap (supabase/config.toml) — pages must not exceed it. */
export const MAX_PAGE_ROWS = 1000

/**
 * Server-side filter for list queries. Column names are snake_case DB columns
 * (the same filters are matched against raw realtime payloads).
 */
export interface CrudFilter {
  col: string
  op: 'eq' | 'gt' | 'gte' | 'lt' | 'lte'
  value: unknown
}

export interface LoadOptions {
  /** Page size — paged mode. Omit to load the complete dataset (auto-pages). */
  limit?: number
  offset?: number
  /** Append results to the collection instead of replacing (load-more). */
  append?: boolean
  /** Server-side filters; realtime inserts/updates are matched against them. */
  filters?: CrudFilter[]
}

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

function matchesFilters(row: Record<string, unknown>, filters: CrudFilter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col] as string | number | boolean | null | undefined
    const target = f.value as string | number | boolean
    if (v === null || v === undefined) return false
    switch (f.op) {
      case 'eq':
        return v === target
      case 'gt':
        return v > target
      case 'gte':
        return v >= target
      case 'lt':
        return v < target
      case 'lte':
        return v <= target
    }
  })
}

/**
 * A Zustand store slice factory for CRUD operations on Supabase tables.
 *
 * Each domain store spreads the returned base state and wraps `_add`/`_update`
 * with type-safe public methods. The factory handles:
 * - Loading state & error management (complete loads auto-page past the API's
 *   max_rows cap; `load({ limit })` gives paged mode with `loadMore`)
 * - Supabase select/insert/update/delete queries
 * - Realtime subscription (INSERT/UPDATE/DELETE, filter-matched)
 * - Optimistic local state updates with duplicate guards
 * - Cleanup via `unsubscribe`
 */
export function createCrudSlice<T extends { id: string }>(config: CrudConfig<T>) {
  const { table, collectionKey, mapRow, order, prependInsert } = config

  // Bumped by reset(). Async operations capture the value at start and discard
  // their results when it changed, so responses from a previous signed-in user
  // never repopulate the store after logout / account switch.
  let generation = 0

  // Monotonic load sequence: only the newest load may publish, so a slower
  // earlier load cannot overwrite a newer snapshot within the same session.
  // Cross-reset responses stay gated by `generation`.
  let loadSeq = 0

  // Filters of the most recent load — realtime events are matched against
  // them, so paged/filtered views never display rows outside the query.
  let lastFilters: CrudFilter[] = []
  // Options of the most recent paged load (undefined after a complete load);
  // loadMore() fetches the next page under the same query.
  let lastPageOptions: { limit: number; filters: CrudFilter[] } | null = null

  function getItems(getter: GetFn): T[] {
    return (getter() as Record<string, T[]>)[collectionKey] ?? []
  }

  function handleRealtime(set: SetFn, payload: RealtimePayload) {
    if (payload.eventType === 'INSERT') {
      const item = mapRow(payload.new)
      if (!matchesFilters(payload.new, lastFilters)) return
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (list.some((i) => i.id === item.id)) return state
        return { [collectionKey]: prependInsert ? [item, ...list] : [...list, item] }
      })
    } else if (payload.eventType === 'UPDATE') {
      const item = mapRow(payload.new)
      const matches = matchesFilters(payload.new, lastFilters)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (!matches) {
          // The row left the filtered set (e.g. edited out of the date range).
          return { [collectionKey]: list.filter((i) => i.id !== item.id) }
        }
        const present = list.some((i) => i.id === item.id)
        return {
          [collectionKey]: present
            ? list.map((i) => (i.id === item.id ? item : i))
            : prependInsert
              ? [item, ...list]
              : [...list, item],
        }
      })
    } else if (payload.eventType === 'DELETE') {
      const id = (payload.old as { id: string }).id
      set((state: Record<string, unknown>) => ({
        [collectionKey]: getItems(() => state).filter((item) => item.id !== id),
      }))
    }
  }

  // Build a page query: filters + deterministic order (config order, then id
  // as tiebreak so offset pagination never repeats or skips tied rows).
  function pageQuery(filters: CrudFilter[], from: number, to: number, withCount: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from(table).select('*', withCount ? { count: 'exact' } : undefined)
    for (const f of filters) {
      q = q[f.op](f.col, f.value)
    }
    if (order) {
      q = q.order(order.column, { ascending: order.ascending })
    }
    q = q.order('id', { ascending: true })
    return q.range(from, to)
  }

  type PageResult = {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
    count: number | null
  }

  // set/get come from Zustand, which has store-specific types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function build(set: any, get: any) {
    const isStale = (token: number) => token !== generation

    const load = async (options?: LoadOptions) => {
      const seq = ++loadSeq
      const token = generation
      const { limit, offset, append, filters } = options ?? {}
      const activeFilters = filters ?? []
      lastFilters = activeFilters
      set(append ? { loadingMore: true, error: null } : { loading: true, error: null })

      const failOrStale = (res: PageResult): boolean => {
        if (seq !== loadSeq || isStale(token)) return true
        if (res.error) {
          set({ error: res.error.message, loading: false, loadingMore: false })
          throw res.error
        }
        return false
      }

      try {
        let rows: Record<string, unknown>[] = []
        let total: number | null = null
        let hasMore = false

        if (limit === undefined) {
          // Complete load: page through until a short page so nothing is
          // silently truncated by the API's max_rows cap.
          lastPageOptions = null
          let from = offset ?? 0
          for (;;) {
            const res: PageResult = await pageQuery(
              activeFilters,
              from,
              from + MAX_PAGE_ROWS - 1,
              false,
            )
            if (failOrStale(res)) return
            const chunk = res.data ?? []
            rows = rows.concat(chunk)
            from += MAX_PAGE_ROWS
            if (chunk.length < MAX_PAGE_ROWS) break
          }
        } else {
          lastPageOptions = { limit, filters: activeFilters }
          const from = offset ?? 0
          const res: PageResult = await pageQuery(activeFilters, from, from + limit - 1, true)
          if (failOrStale(res)) return
          rows = res.data ?? []
          total = res.count
          hasMore = rows.length === limit
        }

        set((state: Record<string, unknown>) => {
          const prev = getItems(() => state)
          let items: T[]
          if (append) {
            // Offset pages can shift under concurrent inserts (realtime);
            // skip ids already in the collection.
            const seen = new Set(prev.map((i) => i.id))
            items = [...prev, ...rows.map(mapRow).filter((i) => !seen.has(i.id))]
          } else {
            items = rows.map(mapRow)
          }
          return { [collectionKey]: items, loading: false, loadingMore: false, hasMore, total }
        })
      } catch (e) {
        if (seq === loadSeq && !isStale(token)) {
          set({ loading: false, loadingMore: false })
        }
        throw e
      }

      if (!get()._unsub) {
        const unsub = subscribeToTable(table as string, (payload) => {
          if (isStale(token)) return
          handleRealtime(set, payload)
        })
        set({ _unsub: unsub })
      }
    }

    /** Fetch the next page of the last paged load (no-op after a complete load). */
    const loadMore = async (): Promise<void> => {
      if (!lastPageOptions) return
      await load({
        limit: lastPageOptions.limit,
        offset: getItems(get).length,
        append: true,
        filters: lastPageOptions.filters,
      })
    }

    const internalAdd = async (data: Record<string, unknown>): Promise<T> => {
      const token = generation
      set({ error: null })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
      const insertData: Record<string, unknown> =
        session?.user?.id && !('user_id' in data) ? { ...data, user_id: session.user.id } : data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error } = await (supabase.from as any)(table)
        .insert(insertData)
        .select()
        .single()
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      const item = mapRow(inserted as Record<string, unknown>)
      // Optimistic insert only lands in the collection when it matches the
      // active filters (in paged mode a reload fetches it under the right page).
      if (!matchesFilters(inserted as Record<string, unknown>, lastFilters)) return item
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (list.some((i) => i.id === item.id)) return state
        return { [collectionKey]: prependInsert ? [item, ...list] : [...list, item] }
      })
      return item
    }

    const internalBulkAdd = async (data: Record<string, unknown>[]): Promise<T[]> => {
      if (data.length === 0) return []
      const token = generation
      set({ error: null })
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
      const insertData = session?.user?.id
        ? data.map((d) => ('user_id' in d ? d : { ...d, user_id: session.user.id }))
        : data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error } = await (supabase.from as any)(table)
        .insert(insertData)
        .select()
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
      if (error) {
        set({ error: error.message, loading: false })
        throw error
      }
      const items = (inserted as Record<string, unknown>[])
        .filter((row) => matchesFilters(row, lastFilters))
        .map(mapRow)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        const newList = prependInsert ? [...items, ...list] : [...list, ...items]
        return { [collectionKey]: newList }
      })
      return items
    }

    const internalUpdate = async (id: string, data: Record<string, unknown>): Promise<void> => {
      const token = generation
      set({ error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(table).update(data).eq('id', id)
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
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
      const token = generation
      set({ error: null })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from as any)(table).delete().eq('id', id)
      if (isStale(token)) throw new Error('Session changed; stale response discarded')
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

    /**
     * Wipe all user data and teardown realtime. Called on auth identity change.
     * Also invalidates any in-flight load/mutation from the previous session.
     */
    const reset = () => {
      generation++
      unsubscribe()
      lastFilters = []
      lastPageOptions = null
      set({
        [collectionKey]: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        total: null,
        error: null,
      })
    }

    return {
      loading: false,
      loadingMore: false,
      hasMore: false,
      total: null,
      error: null,
      _unsub: null,
      clearError: () => set({ error: null }),
      load,
      loadMore,
      _add: internalAdd,
      _bulkAdd: internalBulkAdd,
      _update: internalUpdate,
      remove,
      getById,
      unsubscribe,
      reset,
    }
  }
}
