import { supabase } from '@/supabase/client'
import { subscribeToTable, type RealtimeStatus } from '@/supabase/realtime'
import { mapKeysToCamel, snakeToCamel } from '@/lib/case'
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
 * Total order mirroring the page query (config order, then id asc) so a row
 * inserted locally lands at the position the server would return it at.
 */
function makeComparator<T extends { id: string }>(order?: {
  column: string
  ascending: boolean
}): (a: T, b: T) => number {
  const col = order ? snakeToCamel(order.column) : null
  return (a, b) => {
    if (col) {
      // Date keys compare by value so the id tiebreak stays reachable for
      // equal keys (two distinct Date instances are never `===`).
      const av = (a as Record<string, unknown>)[col] as string | number | Date
      const bv = (b as Record<string, unknown>)[col] as string | number | Date
      const aVal = av instanceof Date ? +av : av
      const bVal = bv instanceof Date ? +bv : bv
      if (aVal !== bVal) {
        const aFirst = aVal < bVal
        return order!.ascending ? (aFirst ? -1 : 1) : aFirst ? 1 : -1
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }
}

function insertSorted<T>(list: T[], item: T, cmp: (a: T, b: T) => number): T[] {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cmp(list[mid], item) < 0) lo = mid + 1
    else hi = mid
  }
  return [...list.slice(0, lo), item, ...list.slice(lo)]
}

/**
 * A Zustand store slice factory for CRUD operations on Supabase tables.
 *
 * Each domain store spreads the returned base state and wraps `_add`/`_update`
 * with type-safe public methods. The factory handles:
 * - Loading state & error management (complete loads auto-page past the API's
 *   max_rows cap; `load({ limit })` gives paged mode with `loadMore`)
 * - Supabase select/insert/update/delete queries
 * - Realtime subscription opened BEFORE the first query (no missed-event gap);
 *   events arriving mid-load are buffered and replayed after the snapshot
 *   publishes, and a reconnect after a dropped socket triggers a silent
 *   refetch of the current query
 * - Per-event reconcile: insert-if-absent dedupe by id, last-write-wins
 *   updates, evict on delete, ordered per the load query
 * - Paged-window rule: while unfetched pages remain, rows sorting
 *   beyond the loaded window are left for `loadMore` (they only bump `total`),
 *   so offset paging state is never corrupted — enforced for realtime events
 *   AND optimistic inserts/updates
 * - Optimistic local state updates with duplicate guards
 * - Session-generation protection: `reset()` invalidates every in-flight
 *   operation and tears down realtime
 */
export function createCrudSlice<T extends { id: string }>(config: CrudConfig<T>) {
  const { table, collectionKey, mapRow, order } = config
  const compareItems = makeComparator<T>(order)

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
  // Options of the most recent load — re-run (from offset 0, silently) after
  // a realtime reconnect to reconcile events missed during the outage.
  let lastQueryOptions: LoadOptions | null = null

  // Realtime events that arrive while a load is in flight. Applying them live
  // would be wiped by the snapshot publish, so they are replayed in arrival
  // order right after the publish — dedupe by id makes replays idempotent.
  let pendingEvents: RealtimePayload[] | null = null

  // Session generation the current realtime subscription was created under.
  let subscriptionToken: number | null = null
  let sawDisconnect = false
  // Wall clock of the last reconnect reconcile — debounces flapping links.
  let lastReconcileAt = 0

  function getItems(getter: GetFn): T[] {
    return (getter() as Record<string, T[]>)[collectionKey] ?? []
  }

  /**
   * Count deltas on realtime/optimistic mutations: `total` tracks rows
   * matching the active filters, `grandTotal` tracks every row (the unfiltered
   * denominator the count line displays).
   */
  function countBump(state: Record<string, unknown>, delta: number, counted = true) {
    const patch: Record<string, unknown> = {}
    const total = state.total as number | null
    if (counted && total !== null) patch.total = total + delta
    const grandTotal = state.grandTotal as number | null
    if (grandTotal !== null) patch.grandTotal = grandTotal + delta
    return patch
  }

  function handleRealtime(set: SetFn, payload: RealtimePayload) {
    if (payload.eventType === 'DELETE') {
      const id = (payload.old as { id?: string }).id
      // Only correct `total` when the deleted row counted toward it.
      const counted = matchesFilters(payload.old, lastFilters)
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        if (!list.some((i) => i.id === id)) return countBump(state, -1, counted)
        return {
          [collectionKey]: list.filter((item) => item.id !== id),
          ...countBump(state, -1, counted),
        }
      })
      return
    }

    const raw = payload.new
    if (!matchesFilters(raw, lastFilters)) {
      if (payload.eventType === 'UPDATE') {
        // The row was edited out of the filtered set — evict it.
        const id = (raw as { id?: string }).id
        set((state: Record<string, unknown>) => ({
          [collectionKey]: getItems(() => state).filter((item) => item.id !== id),
        }))
      } else if (payload.eventType === 'INSERT') {
        // A row outside the query still exists — counts toward grandTotal only.
        set((state: Record<string, unknown>) => countBump(state, 1, false))
      }
      return
    }

    const item = mapRow(raw)
    set((state: Record<string, unknown>) => {
      const list = getItems(() => state)
      const idx = list.findIndex((i) => i.id === item.id)
      if (payload.eventType === 'INSERT' && idx >= 0) return state // duplicate event
      if (idx < 0) {
        // Paged window rule: while unfetched pages remain, a row sorting
        // strictly after the last loaded row is beyond the loaded window —
        // leave it for loadMore() (applying it here would corrupt offset
        // paging). It still exists, so it counts toward `total`.
        const last = list[list.length - 1]
        if ((state.hasMore as boolean) && last && compareItems(item, last) > 0) {
          return payload.eventType === 'INSERT' ? countBump(state, 1) : state
        }
        return {
          [collectionKey]: insertSorted(list, item, compareItems),
          ...(payload.eventType === 'INSERT' ? countBump(state, 1) : {}),
        }
      }
      // Last write wins: replace in place. If the update moves the row
      // beyond the loaded window while more pages remain, evict instead —
      // it now lives on an unloaded page, and keeping it would break the
      // contiguous-prefix invariant loadMore()'s offset relies on.
      const last = list[list.length - 1]
      if ((state.hasMore as boolean) && compareItems(item, last) > 0) {
        return { [collectionKey]: list.filter((i) => i.id !== item.id) }
      }
      return { [collectionKey]: list.map((i) => (i.id === item.id ? item : i)) }
    })
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

  /** Minimum interval between reconnect-triggered reconcile refetches. */
  const RECONCILE_DEBOUNCE_MS = 5000

  // set/get come from Zustand, which has store-specific types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function build(set: any, get: any) {
    const isStale = (token: number) => token !== generation

    const flushEvents = () => {
      const events = pendingEvents
      pendingEvents = null
      if (!events) return
      for (const payload of events) handleRealtime(set, payload)
    }

    const handleEvent = (payload: RealtimePayload) => {
      if (subscriptionToken === null || subscriptionToken !== generation) return
      // Mid-load events are buffered: the snapshot publish would overwrite
      // live-applied changes. Replayed in order after the publish.
      if (pendingEvents) {
        pendingEvents.push(payload)
        return
      }
      handleRealtime(set, payload)
    }

    const handleStatus = (status: RealtimeStatus) => {
      if (subscriptionToken === null || subscriptionToken !== generation) return
      if (status !== 'SUBSCRIBED') {
        sawDisconnect = true
        return
      }
      // Rejoined after a drop: events during the outage are lost, so silently
      // re-run the current query to reconcile. Debounced: on a flapping link
      // rejoins arrive in quick succession — skip ones inside the window;
      // sawDisconnect stays set so the next rejoin after it retries.
      if (sawDisconnect && lastQueryOptions) {
        if (Date.now() - lastReconcileAt < RECONCILE_DEBOUNCE_MS) return
        sawDisconnect = false
        lastReconcileAt = Date.now()
        void load(
          { ...lastQueryOptions, offset: undefined, append: undefined },
          { silent: true },
        ).catch(() => {
          // Best-effort reconcile; the next reconnect retries.
        })
      }
    }

    const ensureSubscription = () => {
      if (get()._unsub) return
      subscriptionToken = generation
      sawDisconnect = false
      const unsub = subscribeToTable(table as string, handleEvent, handleStatus)
      set({ _unsub: unsub })
    }

    const load = async (options?: LoadOptions, opts?: { silent?: boolean }) => {
      const seq = ++loadSeq
      const token = generation
      const { limit, offset, append, filters } = options ?? {}
      const activeFilters = filters ?? []
      lastFilters = activeFilters
      lastQueryOptions = { ...(options ?? {}) }
      lastPageOptions = limit !== undefined ? { limit, filters: activeFilters } : null
      // Subscribe BEFORE the first query so no event can fall into the gap
      // between snapshot and subscription.
      ensureSubscription()
      if (!pendingEvents) pendingEvents = []
      if (!opts?.silent) {
        set(append ? { loadingMore: true, error: null } : { loading: true, error: null })
      }

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
        let grandTotal: number | null = null
        let hasMore = false

        if (limit === undefined) {
          // Complete load: page through until a short page so nothing is
          // silently truncated by the API's max_rows cap.
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
          const from = offset ?? 0
          const res: PageResult = await pageQuery(activeFilters, from, from + limit - 1, true)
          if (failOrStale(res)) return
          rows = res.data ?? []
          total = res.count
          hasMore = rows.length === limit
          if (activeFilters.length === 0) {
            grandTotal = res.count
          } else {
            // The page count is the filtered total; the count line shows the
            // unfiltered grand total too — one head-count query supplies it.
            const head: PageResult = await supabase
              .from(table)
              .select('*', { count: 'exact', head: true })
            if (failOrStale(head)) return
            grandTotal = head.count
          }
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
          return {
            [collectionKey]: items,
            loading: false,
            loadingMore: false,
            hasMore,
            total,
            grandTotal,
          }
        })
        // Snapshot published — apply everything that happened mid-load.
        flushEvents()
      } catch (e) {
        if (seq === loadSeq && !isStale(token)) {
          set({ loading: false, loadingMore: false })
          // The load failed; don't sit on events that arrived meanwhile.
          flushEvents()
        }
        throw e
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
      // Rows outside the query are counted by their realtime echo (grandTotal).
      if (!matchesFilters(inserted as Record<string, unknown>, lastFilters)) return item
      if (pendingEvents) {
        // Mid-load: a live optimistic insert would be wiped by the snapshot
        // publish — queue it for the post-publish replay. The realtime echo
        // of this insert dedupes against it.
        pendingEvents.push({
          eventType: 'INSERT',
          new: inserted as Record<string, unknown>,
          old: {},
        })
        return item
      }
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        // Realtime echo may have landed first — never duplicate.
        if (list.some((i) => i.id === item.id)) return state
        const last = list[list.length - 1]
        // Paged window rule (same as realtime inserts): with unfetched pages
        // remaining, a row sorting beyond the loaded window is left for
        // loadMore() — applying it here would corrupt the offset paging.
        if ((state.hasMore as boolean) && last && compareItems(item, last) > 0) {
          return countBump(state, 1)
        }
        return {
          [collectionKey]: insertSorted(list, item, compareItems),
          ...countBump(state, 1),
        }
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
      const rows = inserted as Record<string, unknown>[]
      const items = rows.filter((row) => matchesFilters(row, lastFilters)).map(mapRow)
      if (pendingEvents) {
        // Same mid-load handling as internalAdd, per row.
        for (const row of rows) {
          pendingEvents.push({ eventType: 'INSERT', new: row, old: {} })
        }
        return items
      }
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        const existing = new Set(list.map((i) => i.id))
        let newList = list
        let newCount = 0
        for (const item of items) {
          // Dedupe by id: the realtime echo of these inserts may have landed
          // before the response.
          if (existing.has(item.id)) continue
          existing.add(item.id)
          newCount++
          // Paged window rule (same as realtime inserts): beyond-window rows
          // are left for loadMore(), they only count toward total.
          const last = newList[newList.length - 1]
          if ((state.hasMore as boolean) && last && compareItems(item, last) > 0) continue
          newList = insertSorted(newList, item, compareItems)
        }
        return {
          [collectionKey]: newList,
          ...countBump(state, newCount),
        }
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
      set((state: Record<string, unknown>) => {
        const list = getItems(() => state)
        const updated = list.map((item) => (item.id === id ? { ...item, ...camelData } : item))
        // Paged window rule (same as realtime updates): if the update moved
        // the row beyond the loaded window while more pages remain, evict it
        // — it now belongs to an unloaded page.
        const updatedItem = updated.find((item) => item.id === id)
        const last = list[list.length - 1]
        if (
          updatedItem &&
          (state.hasMore as boolean) &&
          last &&
          compareItems(updatedItem, last) > 0
        ) {
          return { [collectionKey]: list.filter((item) => item.id !== id) }
        }
        return { [collectionKey]: updated }
      })
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
      lastQueryOptions = null
      pendingEvents = null
      sawDisconnect = false
      lastReconcileAt = 0
      set({
        [collectionKey]: [],
        loading: false,
        loadingMore: false,
        hasMore: false,
        total: null,
        grandTotal: null,
        error: null,
      })
    }

    return {
      loading: false,
      loadingMore: false,
      hasMore: false,
      total: null,
      grandTotal: null,
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
