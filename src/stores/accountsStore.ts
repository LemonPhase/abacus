import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import { subscribeToTable } from "@/lib/realtime"
import type { Account, NewAccount, AccountType } from "@/types"
import type { Database } from "@/supabase/database.types"

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"]

let _unsub: (() => void) | null = null

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
  clearError: () => void
  load: () => Promise<void>
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
  clearError: () => set({ error: null }),

  load: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.from("accounts").select("*")
    if (error) { set({ error: error.message, loading: false }); throw error }
    const accounts: Account[] = (data ?? []).map(mapRow)
    set({ accounts, loading: false })

    if (!_unsub) {
      _unsub = subscribeToTable("accounts", (payload) => {
        if (payload.eventType === "INSERT") {
          const account = mapRow(payload.new as AccountRow)
          set((state) => {
            if (state.accounts.some((a) => a.id === account.id)) return state
            return { accounts: [...state.accounts, account] }
          })
        } else if (payload.eventType === "UPDATE") {
          const account = mapRow(payload.new as AccountRow)
          set((state) => ({
            accounts: state.accounts.map((a) => (a.id === account.id ? account : a)),
          }))
        } else if (payload.eventType === "DELETE") {
          const id = (payload.old as { id: string }).id
          set((state) => ({
            accounts: state.accounts.filter((a) => a.id !== id),
          }))
        }
      })
    }
  },

  add: async (data) => {
    set({ error: null })
    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["accounts"]["Insert"])
      .select()
      .single()
    if (error) { set({ error: error.message, loading: false }); throw error }
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
      .from("accounts")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["accounts"]["Update"])
      .eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

    set((state) => ({
      accounts: state.accounts.map((item) => (item.id === id ? { ...item, ...data } : item)) as any,
    }))
  },

  remove: async (id) => {
    set({ error: null })
    const { error } = await supabase.from("accounts").delete().eq("id", id)
    if (error) { set({ error: error.message, loading: false }); throw error }

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
    if (_unsub) {
      _unsub()
      _unsub = null
    }
  },
}))
