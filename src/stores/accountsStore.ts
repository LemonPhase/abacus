import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice, type LoadOptions } from '@/stores/crudStore'
import { roundCurrency } from '@/lib/currency'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Account, NewAccount, AccountType } from '@/types'
import type { Database } from '@/supabase/database.types'

type AccountRow = Database['public']['Tables']['accounts']['Row']

// 20260918000001_input_invariants.sql pins an account's currency while
// transactions or recurring templates reference it (composite FKs on
// (account_id, currency)). PostgREST surfaces the DB constraint name; both
// pinning FKs share the *_account_currency_fkey suffix. The dialog prevents
// this pre-emptively (currencyLocked); the store translates any race-window
// leftover so the banner shows the reason instead of a raw FK error.
const PINNED_CURRENCY_MESSAGE = 'Cannot change currency while transactions reference this account'

function isPinnedCurrencyError(error: unknown): boolean {
  const e = error as { message?: unknown; details?: unknown } | null
  return (String(e?.message ?? '') + String(e?.details ?? '')).includes('_account_currency_fkey')
}

function mapRow(row: AccountRow): Account {
  return {
    ...mapKeysToCamel<Account>(row),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

const crud = createCrudSlice<Account>({
  table: 'accounts',
  collectionKey: 'accounts',
  mapRow: (row) => mapRow(row as AccountRow),
})

interface AccountsState {
  accounts: Account[]
  loading: boolean
  error: string | null
  _unsub: (() => void) | null
  clearError: () => void
  load: (options?: LoadOptions) => Promise<void>
  loadMore: () => Promise<void>
  loadingMore: boolean
  hasMore: boolean
  total: number | null
  add: (data: NewAccount) => Promise<Account>
  update: (id: string, data: Partial<NewAccount>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByType: (type: AccountType) => Account[]
  getById: (id: string) => Account | undefined
  unsubscribe: () => void
  reset: () => void
}

export const useAccountsStore = create<AccountsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)

  // opening_balance is user input in the account currency's minor units
  // (20260918000001_input_invariants rejects sub-cent amounts).
  const roundOpeningBalance = (data: Partial<NewAccount>, currency: string) => {
    const clean = { ...data }
    if (typeof clean.openingBalance === 'number') {
      clean.openingBalance = roundCurrency(clean.openingBalance, currency)
    }
    return clean
  }

  return {
    accounts: [],
    ...base,
    add: (data) =>
      _add(
        mapKeysToSnake(
          roundOpeningBalance(data, data.currency),
        ) as Database['public']['Tables']['accounts']['Insert'],
      ),
    update: (id, data) => {
      const currency =
        data.currency ?? get().getById(id)?.currency ?? useSettingsStore.getState().baseCurrency
      return _update(
        id,
        mapKeysToSnake(
          roundOpeningBalance(data, currency),
        ) as Database['public']['Tables']['accounts']['Update'],
      ).catch((error: unknown) => {
        if (isPinnedCurrencyError(error)) {
          set({ error: PINNED_CURRENCY_MESSAGE })
          throw new Error(PINNED_CURRENCY_MESSAGE)
        }
        throw error
      })
    },
    getByType: (type) => get().accounts.filter((a) => a.type === type),
  }
})
