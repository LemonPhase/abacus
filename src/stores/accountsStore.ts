import { create } from 'zustand'
import { supabase } from '@/supabase/client'
import { mapKeysToCamel, mapKeysToSnake } from '@/lib/case'
import { subscribeToTable } from '@/lib/realtime'
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

export const useAccountsStore = create<AccountsState>()((set, get) => ({
  accounts: [],
  loading: false,
  error: null,
  _unsub: null,
  clearError: () => set({ error: null }),

  load: async (options) => {
    set({ loading: true, error: null })
    const { limit, offset } = options ?? {}
    let query = supabase.from('accounts').select('*')
    if (offset !== undefined && limit !== undefined) {
      query = query.range(offset, offset + limit - 1)
    } else if (limit !== undefined) {
      query = query.limit(limit)
    }
    const { data, error } = await query
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }
    const accounts: Account[] = (data ?? []).map(mapRow)
    set({ accounts, loading: false })

    if (!get()._unsub) {
      const unsub = subscribeToTable('accounts', (payload) => {
        if (payload.eventType === 'INSERT') {
          const account = mapRow(payload.new as AccountRow)
          set((state) => {
            if (state.accounts.some((a) => a.id === account.id)) return state
            return { accounts: [...state.accounts, account] }
          })
        } else if (payload.eventType === 'UPDATE') {
          const account = mapRow(payload.new as AccountRow)
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id === account.id ? account : a)),
          }))
        } else if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== id),
          }))
        }
      })
      set({ _unsub: unsub })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from('accounts')
      .insert(mapKeysToSnake(data) as Database['public']['Tables']['accounts']['Insert'])
      .select()
      .single()
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }
    const account = mapRow(inserted as AccountRow)
    set((state) => {
      if (state.accounts.some((item) => item.id === account.id)) return state
      return { accounts: [...state.accounts, account] }
    })
    return account
  },

  update: async (id, data) => {
    set({ error: null })
    const { error } = await supabase
      .from('accounts')
      .update(mapKeysToSnake(data) as Database['public']['Tables']['accounts']['Update'])
      .eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      accounts: state.accounts.map((item) => (item.id === id ? { ...item, ...data } : item)) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from('accounts').delete().eq('id', id)
    if (error) {
      set({ error: error.message, loading: false })
      throw error
    }

    set((state) => ({
      accounts: state.accounts.filter((item) => item.id !== id),
    }))
  },

  getByType: (type) => {
    return get().accounts.filter((a) => a.type === type)
  },

  getById: (id) => {
    return get().accounts.find((a) => a.id === id)
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },
}))
