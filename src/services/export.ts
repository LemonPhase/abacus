import { supabase } from '@/supabase/client'
import { currentUserId } from '@/services/restore'
import { MAX_PAGE_ROWS } from '@/stores/crudStore'

/**
 * Full-dataset JSON export (Settings). Every table is read in max_rows-bounded
 * pages — a single unbounded select is capped by the API (locally 1000 rows)
 * and would silently truncate the export. Any page failure aborts the whole
 * export with the failing table/page in the message, so a partial file is
 * never produced. The payload shape (version 3, snake_case rows,
 * budgets[].category_ids derived from the association table) is unchanged and
 * stays compatible with the restore path (restoreValidation + restore_user_data).
 */

export const EXPORT_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'exchange_rates',
  'investment_plans',
  'recurring_transactions',
] as const

type ExportRow = Record<string, unknown>

async function fetchAllRows(table: string, orderColumns: string[]): Promise<ExportRow[]> {
  const rows: ExportRow[] = []
  for (let from = 0; ; from += MAX_PAGE_ROWS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = (supabase.from as any)(table).select('*')
    for (const col of orderColumns) {
      query = query.order(col)
    }
    const { data, error } = await query.range(from, from + MAX_PAGE_ROWS - 1)
    if (error) {
      throw new Error(
        `Export failed reading ${table} (rows ${from + 1}–${from + MAX_PAGE_ROWS}): ${error.message}`,
      )
    }
    const page = data ?? []
    rows.push(...page)
    if (page.length < MAX_PAGE_ROWS) return rows
  }
}

/**
 * Build the complete export payload for the signed-in user. The identity is
 * re-verified between tables so a mid-export sign-out/switch can never mix
 * two users' data; realtime writes during the export are inherently possible
 * and are simply included per-table as read (single-file JSON snapshot).
 */
export async function exportAllData(): Promise<Record<string, unknown>> {
  const uid = await currentUserId()
  if (!uid) throw new Error('Not signed in; export aborted')
  const abort = () => new Error('Signed-in user changed; export aborted')

  const data: Record<string, unknown> = {
    version: 3,
    exportedAt: new Date().toISOString(),
  }

  for (const table of EXPORT_TABLES) {
    data[table] = await fetchAllRows(table, ['id'])
    if ((await currentUserId()) !== uid) throw abort()
  }

  // The v3 payload keeps the budgets[].category_ids array shape so exports
  // stay stable across the Audit 08 schema change: the DB stores the links in
  // the budget_categories association table, so derive the arrays on export
  // (the restore RPC regenerates the association rows from them).
  const assoc = await fetchAllRows('budget_categories', ['budget_id', 'category_id'])
  if ((await currentUserId()) !== uid) throw abort()
  const byBudget = new Map<string, string[]>()
  for (const row of assoc) {
    const budgetId = row.budget_id as string
    const list = byBudget.get(budgetId) ?? []
    list.push(row.category_id as string)
    byBudget.set(budgetId, list)
  }
  for (const budget of data.budgets as ExportRow[]) {
    budget.category_ids = byBudget.get(budget.id as string) ?? []
  }

  return data
}
