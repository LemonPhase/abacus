// Raw snake_case rows, as stored in Settings export JSON (DB shape).
export type RawRow = Record<string, unknown>

/**
 * Legacy exports (before opening balances existed, i.e. format version 2)
 * carry `accounts[].balance` but no `opening_balance`. The database derives
 * `balance := opening_balance` on INSERT, so restoring such an export as-is
 * would silently zero every restored balance. For each row without
 * `opening_balance`, derive it from the exported balance minus the signed
 * effects of that account's exported transactions, mirroring exactly the
 * migration's account_ledger_effects sign rules: expense -amount,
 * income/transfer +amount (per account_id).
 *
 * Rows that already carry `opening_balance` (current exports) pass through
 * untouched.
 */
export function normalizeLegacyAccounts(accounts: RawRow[], transactions: RawRow[]): RawRow[] {
  return accounts.map((account) => {
    if (account.opening_balance !== undefined) return account
    const effects = transactions
      .filter((t) => t.account_id === account.id)
      .reduce(
        (sum, t) => sum + (t.type === 'expense' ? -Number(t.amount ?? 0) : Number(t.amount ?? 0)),
        0,
      )
    return { ...account, opening_balance: Number(account.balance ?? 0) - effects }
  })
}
