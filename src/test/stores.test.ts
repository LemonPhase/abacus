import { describe, it, expect, beforeEach } from "vitest"
import { db } from "@/db"
import { useAccountsStore } from "@/stores/accountsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useBudgetsStore } from "@/stores/budgetsStore"
import { useSettingsStore } from "@/stores/settingsStore"

async function clearAllTables() {
  await db.accounts.clear()
  await db.categories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.exchangeRates.clear()
}

describe("Accounts Store", () => {
  beforeEach(async () => {
    await clearAllTables()
    useAccountsStore.setState({ accounts: [], loading: false })
  })

  it("starts with empty state", () => {
    const state = useAccountsStore.getState()
    expect(state.accounts).toEqual([])
    expect(state.loading).toBe(false)
  })

  it("adds an account and loads it", async () => {
    const store = useAccountsStore.getState()
    const account = await store.add({
      name: "My Savings",
      type: "savings",
      currency: "USD",
      balance: 5000,
    })

    expect(account.name).toBe("My Savings")
    expect(account.type).toBe("savings")
    expect(account.id).toBeDefined()

    const loaded = useAccountsStore.getState()
    expect(loaded.accounts).toHaveLength(1)
    expect(loaded.accounts[0].name).toBe("My Savings")
  })

  it("updates an account in the database", async () => {
    const store = useAccountsStore.getState()
    const account = await store.add({
      name: "Old Name",
      type: "checking",
      currency: "USD",
      balance: 100,
    })

    await store.update(account.id, { name: "New Name", balance: 200 })

    const result = await db.accounts.get(account.id)
    expect(result!.name).toBe("New Name")
    expect(result!.balance).toBe(200)
  })

  it("removes an account from the database", async () => {
    const store = useAccountsStore.getState()
    const account = await store.add({
      name: "To Delete",
      type: "cash",
      currency: "USD",
      balance: 0,
    })

    await store.remove(account.id)
    const result = await db.accounts.get(account.id)
    expect(result).toBeUndefined()
  })

  it("filters accounts by type", async () => {
    const store = useAccountsStore.getState()
    await store.add({ name: "Checking", type: "checking", currency: "USD", balance: 1000 })
    await store.add({ name: "Savings", type: "savings", currency: "USD", balance: 5000 })
    await store.add({ name: "Credit Card", type: "credit", currency: "USD", balance: -200 })

    const checking = store.getByType("checking")
    expect(checking).toHaveLength(1)
    expect(checking[0].name).toBe("Checking")
  })

  it("gets account by id", async () => {
    const store = useAccountsStore.getState()
    const account = await store.add({
      name: "Find Me",
      type: "investment",
      currency: "USD",
      balance: 10000,
    })

    const found = store.getById(account.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe("Find Me")
  })
})

describe("Categories Store", () => {
  beforeEach(async () => {
    await clearAllTables()
    useCategoriesStore.setState({ categories: [], loading: false })
  })

  it("adds a category", async () => {
    const store = useCategoriesStore.getState()
    const cat = await store.add({ name: "Groceries", type: "expense", color: "#ff0000" })

    expect(cat.name).toBe("Groceries")
    const state = useCategoriesStore.getState()
    expect(state.categories).toHaveLength(1)
  })

  it("filters by type", async () => {
    const store = useCategoriesStore.getState()
    await store.add({ name: "Salary", type: "income", color: "#00ff00" })
    await store.add({ name: "Rent", type: "expense", color: "#ff0000" })
    await store.add({ name: "Food", type: "expense", color: "#0000ff" })

    const expenses = store.getByType("expense")
    expect(expenses).toHaveLength(2)
  })

  it("gets root categories (no parent)", async () => {
    const store = useCategoriesStore.getState()
    await store.add({ name: "Salary", type: "income", color: "#00ff00" })
    await store.add({ name: "Food", type: "expense", color: "#ff0000" })
    await store.add({ name: "Dining Out", type: "expense", color: "#0000ff", parentId: "food-id" })

    await store.load()
    const roots = useCategoriesStore.getState().getRootCategories("expense")
    expect(roots).toHaveLength(1)
    expect(roots[0].name).toBe("Food")
  })
})

describe("Transactions Store", () => {
  beforeEach(async () => {
    await clearAllTables()
    useTransactionsStore.setState({ transactions: [], loading: false })
  })

  it("adds a transaction with base currency", async () => {
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "expense",
      amount: 42.50,
      currency: "EUR",
      baseAmount: 45.00,
      baseCurrency: "USD",
      date: new Date("2026-05-01"),
      description: "Dinner",
    })

    expect(txn.amount).toBe(42.50)
    expect(txn.currency).toBe("EUR")
    expect(txn.baseAmount).toBe(45.00)
    expect(txn.baseCurrency).toBe("USD")
    expect(txn.description).toBe("Dinner")
  })

  it("defaults baseAmount to amount when not provided", async () => {
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "income",
      amount: 100,
      currency: "USD",
      date: new Date("2026-05-01"),
    })

    expect(txn.baseAmount).toBe(100)
    expect(txn.baseCurrency).toBe("USD")
  })

  it("filters by date range", async () => {
    const store = useTransactionsStore.getState()
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 10, currency: "USD", date: new Date("2026-04-15"),
    })
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 20, currency: "USD", date: new Date("2026-05-10"),
    })
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 30, currency: "USD", date: new Date("2026-06-01"),
    })

    await store.load()
    const may = useTransactionsStore.getState().getByDateRange(
      new Date("2026-05-01"),
      new Date("2026-05-31")
    )
    expect(may).toHaveLength(1)
    expect(may[0].amount).toBe(20)
  })
})

describe("Budgets Store", () => {
  beforeEach(async () => {
    await clearAllTables()
    useBudgetsStore.setState({ budgets: [], loading: false })
  })

  it("adds a budget with category ids", async () => {
    const store = useBudgetsStore.getState()
    const budget = await store.add({
      categoryIds: ["cat-food", "cat-drinks"],
      name: "Food Budget",
      amount: 500,
      period: "monthly",
      startDate: new Date("2026-01-01"),
    })

    expect(budget.name).toBe("Food Budget")
    expect(budget.categoryIds).toHaveLength(2)
    const state = useBudgetsStore.getState()
    expect(state.budgets).toHaveLength(1)
  })

  it("updates a budget in the database", async () => {
    const store = useBudgetsStore.getState()
    const budget = await store.add({
      categoryIds: ["cat-1"],
      name: "Old Budget",
      amount: 300,
      period: "yearly",
      startDate: new Date("2026-01-01"),
    })

    await store.update(budget.id, { amount: 1000, name: "Updated Budget" })

    const result = await db.budgets.get(budget.id)
    expect(result!.amount).toBe(1000)
    expect(result!.name).toBe("Updated Budget")
  })
})

describe("Settings Store", () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
  })

  it("has default values", () => {
    const state = useSettingsStore.getState()
    expect(state.baseCurrency).toBe("USD")
    expect(state.theme).toBe("system")
    expect(state.onboarded).toBe(false)
  })

  it("sets base currency", () => {
    useSettingsStore.getState().setBaseCurrency("EUR")
    expect(useSettingsStore.getState().baseCurrency).toBe("EUR")
  })

  it("sets theme", () => {
    useSettingsStore.getState().setTheme("dark")
    expect(useSettingsStore.getState().theme).toBe("dark")
  })

  it("sets onboarded flag", () => {
    useSettingsStore.getState().setOnboarded(true)
    expect(useSettingsStore.getState().onboarded).toBe(true)
  })

  it("persists to localStorage", () => {
    useSettingsStore.getState().setBaseCurrency("GBP")
    useSettingsStore.getState().setTheme("light")

    useSettingsStore.getState().load()
    expect(useSettingsStore.getState().baseCurrency).toBe("GBP")
    expect(useSettingsStore.getState().theme).toBe("light")
  })

  it("resets to defaults", () => {
    useSettingsStore.getState().setBaseCurrency("JPY")
    useSettingsStore.getState().setTheme("dark")
    useSettingsStore.getState().setOnboarded(true)

    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().baseCurrency).toBe("USD")
    expect(useSettingsStore.getState().theme).toBe("system")
    expect(useSettingsStore.getState().onboarded).toBe(false)
  })
})
