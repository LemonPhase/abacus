import { create } from 'zustand'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { createCrudSlice } from '@/stores/crudStore'
import type { Account, NewAccount, AccountType } from '@/types'
import type { Database } from '@/supabase/database.types'

type AccountRow = Database['public']['Tables']['accounts']['Row']

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
  load: (options?: { limit?: number; offset?: number }) => Promise<void>
  add: (data: NewAccount) => Promise<Account>
  update: (id: string, data: Partial<NewAccount>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByType: (type: AccountType) => Account[]
  getById: (id: string) => Account | undefined
  unsubscribe: () => void
}

export const useAccountsStore = create<AccountsState>()((set, get) => {
  const { _add, _update, ...base } = crud(set, get)
  return {
    accounts: [],
    ...base,
    add: (data) => _add(mapKeysToSnake(data) as Database['public']['Tables']['accounts']['Insert']),
    update: (id, data) =>
      _update(id, mapKeysToSnake(data) as Database['public']['Tables']['accounts']['Update']),
    getByType: (type) => get().accounts.filter((a) => a.type === type),
  }
})
