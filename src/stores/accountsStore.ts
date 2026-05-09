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

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from("accounts").select("*")
    if (error) throw error
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
    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert(mapKeysToSnake(data) as Database["public"]["Tables"]["accounts"]["Insert"])
      .select()
      .single()
    if (error) throw error
    const account = mapRow(inserted as AccountRow)
    await get().load()
    return account
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("accounts")
      .update(mapKeysToSnake(data) as Database["public"]["Tables"]["accounts"]["Update"])
      .eq("id", id)
    if (error) throw error
    await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id)
    if (error) throw error
    await get().load()
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
