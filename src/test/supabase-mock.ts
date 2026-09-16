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
  _onAuthStateChangeCallback = null
  _failNextRpc = null
  // Restore the default RPC dispatch — restore-service tests override it via
  // mockImplementation/mockResolvedValue, which would otherwise leak here.
  mockSupabase.rpc.mockImplementation(defaultRpc)
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

function validateAccountOwnership(accountId: string, userId: string): boolean {
  const accounts = tables.get('accounts')
  if (!accounts) return false
  const account = accounts.find((r) => r.id === accountId)
  if (!account) return false
  return account.user_id === userId
}

// Mirrors the real DB (20260916000000_opening_balance_ledger.sql):
// balance = opening_balance + signed transaction effects, enforced.
function accountEffectsSum(accountId: string): number {
  const txns = (tables.get('transactions') ?? []).filter((t) => t.account_id === accountId)
  return txns.reduce((sum, t) => {
    const amount = (t.amount as number) ?? 0
    return t.type === 'expense' ? sum - amount : sum + amount
  }, 0)
}

function recomputeBalance(accountId: string) {
  const account = ensureTable('accounts').find((r) => r.id === accountId)
  if (!account) return
  account.balance = ((account.opening_balance as number) ?? 0) + accountEffectsSum(accountId)
}

const DERIVED_BALANCE_ERROR =
  'account balance is derived (opening_balance + transaction effects); update opening_balance instead'

function applyInsertBalanceEffect(row: Record<string, unknown>) {
  recomputeBalance(row.account_id as string)
}

function applyDeleteBalanceEffect(row: Record<string, unknown>) {
  recomputeBalance(row.account_id as string)
}

function applyUpdateBalanceEffect(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
) {
  recomputeBalance(newRow.account_id as string)
  recomputeBalance(oldRow.account_id as string)
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

        if (tableName === 'transactions') {
          for (const d of toInsert) {
            const accountId = d.account_id as string | undefined
            const userId = d.user_id as string | undefined
            if (accountId && userId && !validateAccountOwnership(accountId, userId)) {
              resolve({ data: null, error: { message: 'Account does not belong to this user' } })
              return
            }
          }
        }

        const inserted = toInsert.map((d) => {
          const row = newRow(d as Record<string, unknown>)
          if (tableName === 'accounts') {
            // New account: balance is derived, no transactions can exist yet.
            row.balance = (row.opening_balance as number) ?? 0
          }
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

        if (tableName === 'accounts') {
          // balance is derived: reject direct writes, mirror enforce_account_balance.
          if (_payload && 'balance' in _payload) {
            resolve({ data: null, error: { message: DERIVED_BALANCE_ERROR } })
            return
          }
        }

        if (tableName === 'transactions') {
          for (const target of targets) {
            const payload = _payload as Record<string, unknown>
            const accountId = (payload?.account_id ?? target.account_id) as string | undefined
            const userId = (payload?.user_id ?? target.user_id) as string | undefined
            if (accountId && userId && !validateAccountOwnership(accountId, userId)) {
              resolve({ data: null, error: { message: 'Account does not belong to this user' } })
              return
            }
          }
        }

        for (const target of targets) {
          const oldRow = { ...target }
          Object.assign(target, _payload ?? {}, { updated_at: new Date().toISOString() })
          if (tableName === 'accounts') {
            // Opening-balance edits re-derive the balance.
            recomputeBalance(target.id as string)
          }
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

          if (tableName === 'transactions') {
            for (const r of matched) {
              const accountId = r.account_id as string | undefined
              const userId = r.user_id as string | undefined
              if (accountId && userId && !validateAccountOwnership(accountId, userId)) {
                resolve({ data: null, error: { message: 'Account does not belong to this user' } })
                return
              }
            }
          }

          for (const r of matched) {
            const idx = rows.indexOf(r)
            if (idx >= 0) rows.splice(idx, 1)
            // recompute after removal — matches AFTER DELETE trigger semantics
            if (tableName === 'transactions') applyDeleteBalanceEffect(r)
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

let _onAuthStateChangeCallback:
  | ((event: string, session: Record<string, unknown> | null) => void)
  | null = null

// When set, the next rpc() call resolves with this error message without
// mutating any table — lets store tests exercise RPC failure paths.
let _failNextRpc: string | null = null

export function failNextRpc(message = 'rpc failed'): void {
  _failNextRpc = message
}

// Mirrors public.replace_budget_categories (20260917000005): replaces all
// association rows for one budget in a single atomic step.
function mockReplaceBudgetCategories(args: Record<string, unknown>) {
  const budgetId = args.p_budget_id as string
  const categoryIds = (args.p_category_ids as string[]) ?? []
  const assoc = ensureTable('budget_categories')
  for (let i = assoc.length - 1; i >= 0; i--) {
    if (assoc[i].budget_id === budgetId) assoc.splice(i, 1)
  }
  for (const category_id of categoryIds) {
    if (!assoc.some((r) => r.budget_id === budgetId && r.category_id === category_id)) {
      assoc.push({ budget_id: budgetId, category_id, user_id: 'user-1' })
    }
  }
}

export function simulateAuthEvent(event: string, session: Record<string, unknown> | null = null) {
  _onAuthStateChangeCallback?.(event, session)
}

// Default RPC dispatch: failNextRpc injects one failure; known RPCs are
// simulated; anything else is a loud test bug.
function defaultRpc(fn: string, args: Record<string, unknown> = {}) {
  if (_failNextRpc) {
    const message = _failNextRpc
    _failNextRpc = null
    return Promise.resolve({ data: null, error: { message } })
  }
  if (fn === 'replace_budget_categories') {
    mockReplaceBudgetCategories(args)
    return Promise.resolve({ data: null, error: null })
  }
  return Promise.resolve({ data: null, error: { message: `Unknown RPC: ${fn}` } })
}

export const mockSupabase = {
  from: vi.fn((table: string) => createBuilder(table)),
  rpc: vi.fn(defaultRpc),
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
    onAuthStateChange: vi.fn(
      (callback: (event: string, session: Record<string, unknown> | null) => void) => {
        _onAuthStateChangeCallback = callback
        return {
          data: {
            subscription: {
              unsubscribe: vi.fn(() => {
                _onAuthStateChangeCallback = null
              }),
            },
          },
        }
      },
    ),
    getUser: vi.fn(),
    setSession: vi.fn(),
    refreshSession: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}
