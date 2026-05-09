import { describe, it, expect, beforeEach } from "vitest"
import Dexie from "dexie"
import { seedCategories } from "@/db/seed"
import { nanoid } from "@/db/nanoid"
import type {
  Account,
  Category,
  Transaction,
  Budget,
  ExchangeRate,
} from "@/types"

const TEST_DB = "abacus-test-db"

async function createTestDB() {
  Dexie.delete(TEST_DB)
  const db = new Dexie(TEST_DB) as Dexie & {
    accounts: Dexie.Table<Account, string>
    categories: Dexie.Table<Category, string>
    transactions: Dexie.Table<Transaction, string>
    budgets: Dexie.Table<Budget, string>
    exchangeRates: Dexie.Table<ExchangeRate, string>
  }

  db.version(1).stores({
    accounts: "id, currency",
    categories: "id, type, parentId",
    transactions: "id, accountId, categoryId, type, date, currency, correlativeId",
    budgets: "id, period",
    exchangeRates: "id, fromCurrency, toCurrency, date, [fromCurrency+toCurrency+date]",
  })

  // Cast the tables
  db.accounts = db.table("accounts") as Dexie.Table<Account, string>
  db.categories = db.table("categories") as Dexie.Table<Category, string>
  db.transactions = db.table("transactions") as Dexie.Table<Transaction, string>
  db.budgets = db.table("budgets") as Dexie.Table<Budget, string>
  db.exchangeRates = db.table("exchangeRates") as Dexie.Table<ExchangeRate, string>

  return db
}

function makeAccount(overrides?: Partial<Account>): Account {
  const now = new Date()
  return {
    id: nanoid(),
    name: "Test Checking",
    type: "checking",
    currency: "USD",
    balance: 1000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeCategory(overrides?: Partial<Category>): Category {
  return {
    id: nanoid(),
    name: "Test Category",
    type: "expense",
    color: "#ff0000",
    ...overrides,
  }
}

function makeTransaction(overrides?: Partial<Transaction>): Transaction {
  const now = new Date()
  return {
    id: nanoid(),
    accountId: "acc-1",
    categoryId: "cat-1",
    type: "expense",
    amount: 50,
    currency: "USD",
    baseAmount: 50,
    baseCurrency: "USD",
    date: new Date("2026-05-01"),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeBudget(overrides?: Partial<Budget>): Budget {
  return {
    id: nanoid(),
    categoryIds: ["cat-1"],
    name: "Test Budget",
    amount: 500,
    period: "monthly",
    startDate: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeExchangeRate(overrides?: Partial<ExchangeRate>): ExchangeRate {
  return {
    id: nanoid(),
    fromCurrency: "EUR",
    toCurrency: "USD",
    rate: 1.08,
    date: new Date("2026-05-01"),
    ...overrides,
  }
}

describe("Dexie Database", () => {
  let db: Awaited<ReturnType<typeof createTestDB>>

  beforeEach(async () => {
    db = await createTestDB()
  })

  describe("accounts table", () => {
    it("adds and retrieves an account", async () => {
      const account = makeAccount()
      await db.accounts.add(account)

      const result = await db.accounts.get(account.id)
      expect(result).toBeDefined()
      expect(result!.name).toBe("Test Checking")
      expect(result!.type).toBe("checking")
    })

    it("filters accounts by currency", async () => {
      await db.accounts.add(makeAccount({ id: "a1", currency: "USD" }))
      await db.accounts.add(makeAccount({ id: "a2", currency: "EUR" }))

      const usdAccounts = await db.accounts.where("currency").equals("USD").toArray()
      expect(usdAccounts).toHaveLength(1)
      expect(usdAccounts[0].currency).toBe("USD")
    })

    it("updates an account", async () => {
      const account = makeAccount()
      await db.accounts.add(account)
      await db.accounts.update(account.id, { balance: 2000, updatedAt: new Date() })

      const updated = await db.accounts.get(account.id)
      expect(updated!.balance).toBe(2000)
    })

    it("deletes an account", async () => {
      const account = makeAccount()
      await db.accounts.add(account)
      await db.accounts.delete(account.id)

      const result = await db.accounts.get(account.id)
      expect(result).toBeUndefined()
    })

    it("lists all accounts", async () => {
      await db.accounts.bulkAdd([
        makeAccount({ id: "a1", name: "Account A" }),
        makeAccount({ id: "a2", name: "Account B" }),
        makeAccount({ id: "a3", name: "Account C" }),
      ])

      const all = await db.accounts.toArray()
      expect(all).toHaveLength(3)
    })
  })

  describe("categories table", () => {
    it("adds and retrieves a category", async () => {
      const cat = makeCategory()
      await db.categories.add(cat)

      const result = await db.categories.get(cat.id)
      expect(result).toBeDefined()
      expect(result!.name).toBe("Test Category")
    })

    it("filters categories by type", async () => {
      await db.categories.bulkAdd([
        makeCategory({ id: "c1", type: "income", name: "Salary" }),
        makeCategory({ id: "c2", type: "expense", name: "Food" }),
        makeCategory({ id: "c3", type: "expense", name: "Rent" }),
      ])

      const expenses = await db.categories.where("type").equals("expense").toArray()
      expect(expenses).toHaveLength(2)

      const incomes = await db.categories.where("type").equals("income").toArray()
      expect(incomes).toHaveLength(1)
    })

    it("seeds default categories correctly", async () => {
      await db.categories.bulkAdd(seedCategories)

      const all = await db.categories.toArray()
      expect(all.length).toBe(19)
      expect(all.filter((c) => c.type === "income").length).toBe(5)
      expect(all.filter((c) => c.type === "expense").length).toBe(14)
    })
  })

  describe("transactions table", () => {
    it("adds and retrieves a transaction", async () => {
      const txn = makeTransaction()
      await db.transactions.add(txn)

      const result = await db.transactions.get(txn.id)
      expect(result).toBeDefined()
      expect(result!.amount).toBe(50)
    })

    it("filters transactions by account", async () => {
      await db.transactions.bulkAdd([
        makeTransaction({ id: "t1", accountId: "acc-a" }),
        makeTransaction({ id: "t2", accountId: "acc-a" }),
        makeTransaction({ id: "t3", accountId: "acc-b" }),
      ])

      const result = await db.transactions.where("accountId").equals("acc-a").toArray()
      expect(result).toHaveLength(2)
    })

    it("filters transactions by date range", async () => {
      await db.transactions.bulkAdd([
        makeTransaction({ id: "t1", date: new Date("2026-04-01") }),
        makeTransaction({ id: "t2", date: new Date("2026-05-15") }),
        makeTransaction({ id: "t3", date: new Date("2026-06-30") }),
      ])

      const mayTxn = await db.transactions
        .where("date")
        .between(new Date("2026-05-01"), new Date("2026-05-31"), true, true)
        .toArray()
      expect(mayTxn).toHaveLength(1)
    })

    it("filters transactions by type", async () => {
      await db.transactions.bulkAdd([
        makeTransaction({ id: "t1", type: "income" }),
        makeTransaction({ id: "t2", type: "expense" }),
        makeTransaction({ id: "t3", type: "transfer" }),
      ])

      const expenses = await db.transactions.where("type").equals("expense").toArray()
      expect(expenses).toHaveLength(1)

      const incomes = await db.transactions.where("type").equals("income").toArray()
      expect(incomes).toHaveLength(1)
    })
  })

  describe("budgets table", () => {
    it("adds and retrieves a budget", async () => {
      const budget = makeBudget()
      await db.budgets.add(budget)

      const result = await db.budgets.get(budget.id)
      expect(result).toBeDefined()
      expect(result!.amount).toBe(500)
      expect(result!.period).toBe("monthly")
    })

    it("filters budgets by period", async () => {
      await db.budgets.bulkAdd([
        makeBudget({ id: "b1", period: "monthly" }),
        makeBudget({ id: "b2", period: "yearly" }),
        makeBudget({ id: "b3", period: "monthly" }),
      ])

      const monthly = await db.budgets.where("period").equals("monthly").toArray()
      expect(monthly).toHaveLength(2)
    })
  })

  describe("exchange rates table", () => {
    it("adds and retrieves an exchange rate", async () => {
      const rate = makeExchangeRate()
      await db.exchangeRates.add(rate)

      const result = await db.exchangeRates.get(rate.id)
      expect(result).toBeDefined()
      expect(result!.rate).toBe(1.08)
    })

    it("queries by currency pair and date", async () => {
      await db.exchangeRates.bulkAdd([
        makeExchangeRate({ id: "e1", fromCurrency: "EUR", toCurrency: "USD", date: new Date("2026-05-01") }),
        makeExchangeRate({ id: "e2", fromCurrency: "EUR", toCurrency: "USD", date: new Date("2026-05-08") }),
        makeExchangeRate({ id: "e3", fromCurrency: "GBP", toCurrency: "USD", date: new Date("2026-05-01") }),
      ])

      const eurUsd = await db.exchangeRates
        .where("[fromCurrency+toCurrency+date]")
        .equals(["EUR", "USD", new Date("2026-05-08")])
        .first()

      expect(eurUsd).toBeDefined()
      expect(eurUsd!.id).toBe("e2")
    })
  })
})

describe("nanoid", () => {
  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()))
    expect(ids.size).toBe(100)
  })

  it("generates string ids", () => {
    const id = nanoid()
    expect(typeof id).toBe("string")
    expect(id.length).toBeGreaterThan(0)
  })
})
