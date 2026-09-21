// Pure validation of an export-file payload before any restore side effect.
// The database RPC (20260917000001_atomic_restore.sql) re-validates inside
// its transaction; this mirrors it so malformed files fail fast, client-side,
// with a precise message.

// Raw snake_case rows, as stored in Settings export JSON (DB shape).
export type RawRow = Record<string, unknown>

export const RESTORE_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'exchange_rates',
  'investment_plans',
  'recurring_transactions',
] as const

export type RestoreTable = (typeof RESTORE_TABLES)[number]

export const MAX_RESTORE_ROWS = 10000

export interface RestorePayload {
  version: number
  exportedAt?: string
  accounts: RawRow[]
  categories: RawRow[]
  transactions: RawRow[]
  budgets: RawRow[]
  exchange_rates: RawRow[]
  investment_plans: RawRow[]
  recurring_transactions: RawRow[]
}

const SUPPORTED_VERSIONS = [2, 3]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tableOf(payload: Record<string, unknown>, table: RestoreTable): unknown {
  return payload[table]
}

export function parseAndValidateRestorePayload(text: string, uid: string): RestorePayload {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('Invalid export file: not valid JSON')
  }
  if (!isRecord(payload)) {
    throw new Error('Invalid export file: expected a JSON object')
  }

  const version = payload.version
  if (typeof version !== 'number' || !SUPPORTED_VERSIONS.includes(version)) {
    throw new Error(
      `Unsupported export version: ${String(version)}. This app exports versions ${SUPPORTED_VERSIONS.join(' and ')}.`,
    )
  }

  for (const table of RESTORE_TABLES) {
    const rows = tableOf(payload, table)
    if (rows === undefined) continue
    if (!Array.isArray(rows)) {
      throw new Error(`Invalid export format: "${table}" must be an array`)
    }
  }

  for (const table of ['accounts', 'transactions'] as const) {
    if (!Array.isArray(tableOf(payload, table))) {
      throw new Error(`Invalid export format: missing required table (${table})`)
    }
  }

  const typed = {} as Record<RestoreTable, RawRow[]>
  let totalRows = 0
  for (const table of RESTORE_TABLES) {
    const rows = (tableOf(payload, table) as RawRow[] | undefined) ?? []
    typed[table] = rows
    totalRows += rows.length
  }
  if (totalRows > MAX_RESTORE_ROWS) {
    throw new Error(
      `File contains ${totalRows} rows. Maximum is ${MAX_RESTORE_ROWS}. Please reduce the data and try again.`,
    )
  }

  // Row structure: object with a string id; no row may belong to another user.
  for (const table of RESTORE_TABLES) {
    typed[table].forEach((row, i) => {
      if (!isRecord(row) || typeof row.id !== 'string') {
        throw new Error(`Invalid export: ${table}[${i}] must be an object with a string id`)
      }
      if (row.user_id !== undefined && row.user_id !== null && row.user_id !== uid) {
        throw new Error(`Invalid export: ${table}[${i}] belongs to another user`)
      }
    })
  }

  const accountIds = new Set(typed.accounts.map((a) => a.id as string))
  const categoryIds = new Set(typed.categories.map((c) => c.id as string))

  for (const table of ['transactions', 'recurring_transactions'] as const) {
    typed[table].forEach((t, i) => {
      if (typeof t.account_id !== 'string' || !accountIds.has(t.account_id)) {
        throw new Error(`Invalid export: ${table}[${i}].account_id not found in accounts`)
      }
      if (t.category_id !== undefined && t.category_id !== null) {
        if (!categoryIds.has(t.category_id as string)) {
          throw new Error(`Invalid export: ${table}[${i}].category_id not found in categories`)
        }
      }
    })
  }

  typed.budgets.forEach((b, i) => {
    const ids = b.category_ids
    // Absent is fine (no links). Anything present must be an array — an
    // explicit JSON null is a payload defect, not an empty list.
    if (ids === undefined) return
    if (!Array.isArray(ids)) {
      throw new Error(`Invalid export: budgets[${i}].category_ids must be an array`)
    }
    for (const id of ids) {
      if (!categoryIds.has(id as string)) {
        throw new Error(`Invalid export: budgets[${i}] references a category not in categories`)
      }
    }
  })

  return {
    version,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined,
    ...typed,
  }
}
