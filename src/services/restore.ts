import { supabase } from '@/supabase/client'
import type { Json } from '@/supabase/database.types'
import { normalizeLegacyAccounts } from '@/lib/legacyAccounts'
import { parseAndValidateRestorePayload, type RestorePayload } from '@/lib/restoreValidation'

export interface RestoreResult {
  accounts: number
  categories: number
  transactions: number
  budgets: number
  budget_categories: number
  exchange_rates: number
  investment_plans: number
  recurring_transactions: number
  /** The signed-in user the restore ran for; the caller re-verifies after reloading stores. */
  restoredFor: string
}

// Re-read the signed-in identity from the client session. Export/import
// capture it at start and re-verify after every await and before every
// destructive side effect, aborting if the identity changed — so A's data is
// never downloaded or written during B's session.
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

/**
 * Restore a JSON export file atomically.
 *
 * Validates the full payload (structure, ownership, relationships) before any
 * side effect, derives opening balances for legacy exports (PR #23), then
 * delegates to the restore_user_data RPC — one database transaction that
 * deletes and reinserts everything, rolling back entirely on any error.
 */
export async function restoreUserData(file: File): Promise<RestoreResult> {
  // The identity captured here is the identity the whole operation is bound
  // to: re-verified after every await, before every destructive step, so the
  // restore can never run against a different user's tables than the one the
  // import started for.
  const uid = await currentUserId()
  const abort = () => new Error('Signed-in user changed; import aborted')
  if (uid === null) throw new Error('Not signed in; import aborted')

  const text = await file.text()
  if ((await currentUserId()) !== uid) throw abort()

  let payload: RestorePayload
  try {
    payload = parseAndValidateRestorePayload(text, uid ?? '')
  } catch (e) {
    throw e instanceof Error ? e : new Error('Invalid export file')
  }

  // Legacy exports (version 2) have no opening_balance; derive it from the
  // exported balance minus the signed effects of the exported transactions so
  // the DB's derived-balance model restores balances exactly. Exports that
  // already carry opening_balance pass through untouched.
  payload.accounts = normalizeLegacyAccounts(payload.accounts, payload.transactions)

  const { data, error } = await supabase.rpc('restore_user_data', {
    payload: payload as unknown as Json,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Restore failed: database returned no summary')
  return { ...(data as unknown as RestoreResult), restoredFor: uid }
}
