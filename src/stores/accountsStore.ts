import { create } from "zustand"
import { db } from "@/db"
import { nanoid } from "@/db/nanoid"
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
    const accounts = await db.accounts.toArray()
    set({ accounts, loading: false })
  },

  add: async (data) => {
    const now = new Date()
    const account: Account = {
      ...data,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    }
    await db.accounts.add(account)
    await get().load()
    return account
  },

  update: async (id, data) => {
    await db.accounts.update(id, { ...data, updatedAt: new Date() })
    await get().load()
  },

  remove: async (id) => {
    await db.accounts.delete(id)
    await get().load()
  },

  getByType: (type) => {
    return get().accounts.filter((a) => a.type === type)
  },

  getById: (id) => {
    return get().accounts.find((a) => a.id === id)
  },
}))
