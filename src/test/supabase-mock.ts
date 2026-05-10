// In-memory mock of @supabase/supabase-js for tests
// Stores data in arrays, mimicking Supabase PostgREST behavior
// Data is stored with snake_case keys (matching Postgres)
// Simulates the maintain_account_balance DB trigger on transactions
import { vi } from 'vitest'

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
  if (!tables.has(name)) tables.set(name, [])
  return tables.get(name)!
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

function adjustBalance(accountId: string, delta: number) {
  const accounts = tables.get('accounts')
  if (!accounts) return
  const account = accounts.find((r) => r.id === accountId)
  if (!account) return
  account.balance = ((account.balance as number) ?? 0) + delta
}

function applyInsertBalanceEffect(row: Record<string, unknown>) {
  const type = row.type as string
  const amount = (row.amount as number) ?? 0
  const accountId = row.account_id as string
  if (type === 'income' || type === 'transfer') {
    adjustBalance(accountId, amount)
  } else if (type === 'expense') {
    adjustBalance(accountId, -amount)
  }
}

function applyDeleteBalanceEffect(row: Record<string, unknown>) {
  const type = row.type as string
  const amount = (row.amount as number) ?? 0
  const accountId = row.account_id as string
  if (type === 'income' || type === 'transfer') {
    adjustBalance(accountId, -amount)
  } else if (type === 'expense') {
    adjustBalance(accountId, amount)
  }
}

function applyUpdateBalanceEffect(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
) {
  applyDeleteBalanceEffect(oldRow)
  applyInsertBalanceEffect(newRow)
}

type Filter = { col: string; val: unknown; op: 'eq' | 'neq' }

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

  let _action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let _payload: Record<string, unknown> | Record<string, unknown>[] | null = null
  const _filters: Filter[] = []
  let _orderCol: string | null = null
  let _orderAsc = true
  let _returning = false
  let _single = false
  let _maybeSingle = false
  let _limit = 0
  let _rangeFrom = -1
  let _rangeTo = -1

  function applyFilters(
    rows: Record<string, unknown>[],
    filters: Filter[],
  ): Record<string, unknown>[] {
    let result = rows
    for (const f of filters) {
      if (f.op === 'neq') {
        result = result.filter((r) => r[f.col] !== f.val)
      } else {
        result = result.filter((r) => r[f.col] === f.val)
      }
    }
    return result
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {}

  builder.select = vi.fn(() => {
    if (_action === 'insert') {
      _returning = true
    } else {
      _action = 'select'
    }
    return builder
  })

  builder.insert = vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
    _action = 'insert'
    _payload = data
    return builder
  })

  builder.upsert = vi.fn((data: Record<string, unknown> | Record<string, unknown>[]) => {
    _action = 'insert'
    _payload = data
    return builder
  })

  builder.update = vi.fn((data: Record<string, unknown>) => {
    _action = 'update'
    _payload = data
    return builder
  })

  builder.delete = vi.fn(() => {
    _action = 'delete'
    return builder
  })

  builder.eq = vi.fn((col: string, val: unknown) => {
    _filters.push({ col, val, op: 'eq' })
    return builder
  })

  builder.neq = vi.fn((col: string, val: unknown) => {
    _filters.push({ col, val, op: 'neq' })
    return builder
  })

  builder.order = vi.fn((col: string, opts?: { ascending?: boolean }) => {
    _orderCol = col
    _orderAsc = opts?.ascending ?? true
    return builder
  })

  builder.range = vi.fn((from: number, to: number) => {
    _rangeFrom = from
    _rangeTo = to
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
      if (_action === 'select') {
        let result = [...rows]
        result = applyFilters(result, _filters)
        result = applyOrder(result, _orderCol, _orderAsc)
        if (_rangeFrom >= 0 && _rangeTo >= _rangeFrom) {
          result = result.slice(_rangeFrom, _rangeTo + 1)
        } else if (_limit > 0) {
          result = result.slice(0, _limit)
        }

        if (_single || _maybeSingle) {
          resolve({ data: result[0] ?? null, error: null })
        } else {
          resolve({ data: result, error: null })
        }
      } else if (_action === 'insert') {
        const toInsert = Array.isArray(_payload) ? _payload : [_payload ?? {}]
        const inserted = toInsert.map((d) => {
          const row = newRow(d as Record<string, unknown>)
          rows.push(row)
          if (tableName === 'transactions') applyInsertBalanceEffect(row)
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
      } else if (_action === 'update') {
        const targets = applyFilters([...rows], _filters)
        for (const target of targets) {
          const oldRow = { ...target }
          Object.assign(target, _payload ?? {}, { updated_at: new Date().toISOString() })
          if (tableName === 'transactions') applyUpdateBalanceEffect(oldRow, target)
        }
        if (_returning) {
          resolve({ data: targets.length === 1 && _single ? targets[0] : targets, error: null })
        } else {
          resolve({ data: null, error: null })
        }
      } else if (_action === 'delete') {
        if (_filters.length > 0) {
          const matched = applyFilters(rows, _filters)
          for (const r of matched) {
            if (tableName === 'transactions') applyDeleteBalanceEffect(r)
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

function createMockChannel() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  }
  return channel
}

export const mockSupabase = {
  from: vi.fn((table: string) => createBuilder(table)),
  channel: vi.fn(() => createMockChannel()),
  removeChannel: vi.fn(),
  removeAllChannels: vi.fn(),
  auth: {
    getSession: vi.fn<
      () => Promise<{ data: { session: Record<string, unknown> | null }; error: null }>
    >(() => Promise.resolve({ data: { session: null }, error: null })),
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
