import { create } from "zustand"
import { supabase } from "@/supabase/client"
import { mapKeysToCamel, mapKeysToSnake } from "@/lib/case"
import type { Account, NewAccount, AccountType } from "@/types"

interface AccountsState {
  accounts: Account[]
  loading: boolean
  load: () => Promise<void>
  add: (data: NewAccount) => Promise<Account>
  update: (id: string, data: Partial<NewAccount>) => Promise<void>
  remove: (id: string) => Promise<void>
  getByType: (type: AccountType) => Account[]
  getById: (id: string) => Account | undefined
}

export const useAccountsStore = create<AccountsState>()((set, get) => ({
  accounts: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from("accounts").select("*")
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts: Account[] = (data ?? []).map((row: any) => ({
      ...mapKeysToCamel<Account>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }))
    set({ accounts, loading: false })
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert(mapKeysToSnake(data) as Record<string, unknown>)
      .select()
      .single()
    if (error) throw error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = inserted as any
    const account: Account = {
      ...mapKeysToCamel<Account>(row),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
    await get().load()
    return account
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from("accounts")
      .update(mapKeysToSnake(data) as Record<string, unknown>)
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
}))
