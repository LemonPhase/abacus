// In-memory mock of @supabase/supabase-js for tests
// Stores data in arrays, mimicking Supabase PostgREST behavior
// Data is stored with snake_case keys (matching Postgres)
import { vi } from "vitest"

const tables = new Map<string, Record<string, unknown>[]>()

let _counter = 0

function genId(): string {
  return `mock-${++_counter}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureTable(name: string): Record<string, unknown>[] {
  if (!tables.has(name)) tables.set(name, [])
  return tables.get(name)!
}

export function resetAllTables(): void {
  tables.clear()
  _counter = 0
}

export function getTable(name: string): Record<string, unknown>[] {
  return [...(tables.get(name) ?? [])]
}

function newRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    id: genId(),
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

type Filter = { col: string; val: unknown }

function applyOrder(
  rows: Record<string, unknown>[],
  col: string | null,
  asc: boolean,
): Record<string, unknown>[] {
  if (!col) return rows
  return [...rows].sort((a, b) => {
    const av = a[col] as string | number
    const bv = b[col] as string | number
    if (av < bv) return asc ? -1 : 1
    if (av > bv) return asc ? 1 : -1
    return 0
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createBuilder(tableName: string): any {
  const rows = ensureTable(tableName)

  let _action: "select" | "insert" | "update" | "delete" = "select"
  let _payload: Record<string, unknown> | Record<string, unknown>[] | null = null
  const _filters: Filter[] = []
  let _orderCol: string | null = null
  let _orderAsc = true
  let _returning = false
  let _single = false
  let _maybeSingle = false
  let _limit = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {}

  builder.select = vi.fn(() => {
    if (_action === "insert") {
      _returning = true
    } else {
      _action = "select"
    }
    return builder
  })

  builder.insert = vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
    _action = "insert"
    _payload = data
    return builder
  })

  builder.upsert = vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
    _action = "insert"
    _payload = data
    return builder
  })

  builder.update = vi.fn((data: Record<string, unknown>) => {
    _action = "update"
    _payload = data
    return builder
  })

  builder.delete = vi.fn(() => {
    _action = "delete"
    return builder
  })

  builder.eq = vi.fn((col: string, val: unknown) => {
    _filters.push({ col, val })
    return builder
  })

  builder.neq = vi.fn((col: string, val: unknown) => {
    _filters.push({ col, val })
    return builder
  })

  builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
    _orderCol = col
    _orderAsc = opts?.ascending ?? true
    return builder
  })

  builder.single = vi.fn(() => {
    _single = true
    return builder
  })

  builder.maybeSingle = vi.fn(() => {
    _maybeSingle = true
    return builder
  })

  builder.limit = vi.fn((n: number) => {
    _limit = n
    return builder
  })

  builder.throwOnError = vi.fn(() => builder)

  // Make thenable
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
    try {
      if (_action === "select") {
        let result = [...rows]
        // neq filter: exclude rows matching the value
        // eq filter: include rows matching the value
        for (const f of _filters) {
          result = result.filter((r) => r[f.col] === f.val)
        }
        result = applyOrder(result, _orderCol, _orderAsc)
        if (_limit > 0) result = result.slice(0, _limit)

        if (_single || _maybeSingle) {
          resolve({ data: result[0] ?? null, error: null })
        } else {
          resolve({ data: result, error: null })
        }
      } else if (_action === "insert") {
        const toInsert = Array.isArray(_payload) ? _payload : [_payload ?? {}]
        const inserted = toInsert.map((d) => {
          const row = newRow(d as Record<string, unknown>)
          rows.push(row)
          return row
        })

        if (_returning) {
          if (_single) {
            resolve({ data: inserted[0], error: null })
          } else {
            resolve({ data: inserted, error: null })
          }
        } else {
          resolve({ data: null, error: null })
        }
      } else if (_action === "update") {
        let targets = [...rows]
        for (const f of _filters) {
          targets = targets.filter((r) => r[f.col] === f.val)
        }
        for (const target of targets) {
          Object.assign(target, _payload ?? {}, { updated_at: new Date().toISOString() })
        }
        if (_returning) {
          resolve({ data: targets.length === 1 && _single ? targets[0] : targets, error: null })
        } else {
          resolve({ data: null, error: null })
        }
      } else if (_action === "delete") {
        if (_filters.length > 0) {
          const matched = rows.filter((r) => _filters.every((f) => r[f.col] === f.val))
          for (const r of matched) {
            const idx = rows.indexOf(r)
            if (idx >= 0) rows.splice(idx, 1)
          }
        }
        resolve({ data: null, error: null })
      }
    } catch (e) {
      reject?.(e)
    }
  }

  return builder
}

export const mockSupabase = {
  from: vi.fn((table: string) => createBuilder(table)),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    getUser: vi.fn(),
    setSession: vi.fn(),
    refreshSession: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}
