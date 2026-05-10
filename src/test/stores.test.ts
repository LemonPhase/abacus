import { describe, it, expect, beforeEach } from "vitest"
import { useAccountsStore } from "@/stores/accountsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useBudgetsStore } from "@/stores/budgetsStore"
import { useInvestmentPlansStore } from "@/stores/investmentPlansStore"
import { useSettingsStore } from "@/stores/settingsStore"
import { getTable } from "@/test/supabase-mock"

describe("Accounts Store", () => {
  beforeEach(() => {
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

    const dbRows = getTable("accounts")
    const updated = dbRows.find((r) => r.id === account.id)
    expect(updated?.name).toBe("New Name")
    expect(updated?.balance).toBe(200)
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
    const dbRows = getTable("accounts")
    expect(dbRows.find((r) => r.id === account.id)).toBeUndefined()
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

  it("returns undefined for unknown id", () => {
    const store = useAccountsStore.getState()
    expect(store.getById("nonexistent")).toBeUndefined()
  })

  describe("balance updates from transactions (DB trigger simulation)", () => {
    let accountId: string

    beforeEach(async () => {
      useAccountsStore.setState({ accounts: [], loading: false, _unsub: null })
      useTransactionsStore.setState({ transactions: [], loading: false, _unsub: null })
      const account = await useAccountsStore.getState().add({
        name: "Checking",
        type: "checking",
        currency: "USD",
        balance: 1000,
      })
      accountId = account.id
    })

    async function reloadAccounts() {
      await useAccountsStore.getState().load()
    }

    it("decreases account balance when an expense transaction is added", async () => {
      const txStore = useTransactionsStore.getState()
      await txStore.add({
        accountId,
        categoryId: "cat-1",
        type: "expense",
        amount: 100,
        currency: "USD",
        date: new Date("2026-05-01"),
      })
      await reloadAccounts()

      const updated = useAccountsStore.getState().getById(accountId)
      expect(updated!.balance).toBe(900)
    })

    it("increases account balance when an income transaction is added", async () => {
      const txStore = useTransactionsStore.getState()
      await txStore.add({
        accountId,
        categoryId: "cat-1",
        type: "income",
        amount: 500,
        currency: "USD",
        date: new Date("2026-05-01"),
      })
      await reloadAccounts()

      const updated = useAccountsStore.getState().getById(accountId)
      expect(updated!.balance).toBe(1500)
    })

    it("reverses balance when an expense transaction is deleted", async () => {
      const txStore = useTransactionsStore.getState()
      const tx = await txStore.add({
        accountId,
        categoryId: "cat-1",
        type: "expense",
        amount: 250,
        currency: "USD",
        date: new Date("2026-05-01"),
      })
      await reloadAccounts()
      expect(useAccountsStore.getState().getById(accountId)!.balance).toBe(750)

      await txStore.remove(tx.id)
      await reloadAccounts()

      const restored = useAccountsStore.getState().getById(accountId)
      expect(restored!.balance).toBe(1000)
    })

    it("adjusts balance when a transaction amount is updated", async () => {
      const txStore = useTransactionsStore.getState()
      const tx = await txStore.add({
        accountId,
        categoryId: "cat-1",
        type: "expense",
        amount: 100,
        currency: "USD",
        date: new Date("2026-05-01"),
      })
      await reloadAccounts()
      expect(useAccountsStore.getState().getById(accountId)!.balance).toBe(900)

      await txStore.update(tx.id, { amount: 200 })
      await reloadAccounts()

      const updated = useAccountsStore.getState().getById(accountId)
      expect(updated!.balance).toBe(800)
    })

    it("adjusts balance when transaction type changes", async () => {
      const txStore = useTransactionsStore.getState()
      const tx = await txStore.add({
        accountId,
        categoryId: "cat-1",
        type: "expense",
        amount: 100,
        currency: "USD",
        date: new Date("2026-05-01"),
      })
      await reloadAccounts()
      expect(useAccountsStore.getState().getById(accountId)!.balance).toBe(900)

      await txStore.update(tx.id, { type: "income", amount: 100 })
      await reloadAccounts()

      const updated = useAccountsStore.getState().getById(accountId)
      expect(updated!.balance).toBe(1100)
    })
  })
})

describe("Categories Store", () => {
  beforeEach(() => {
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

  it("updates a category in the database", async () => {
    const store = useCategoriesStore.getState()
    const cat = await store.add({ name: "Old Name", type: "expense", color: "#ff0000" })

    await store.update(cat.id, { name: "New Name", color: "#00ff00" })

    const dbRows = getTable("categories")
    const updated = dbRows.find((r) => r.id === cat.id)
    expect(updated?.name).toBe("New Name")
    expect(updated?.color).toBe("#00ff00")
  })

  it("removes a category from the database", async () => {
    const store = useCategoriesStore.getState()
    const cat = await store.add({ name: "To Delete", type: "income", color: "#ff0000" })

    await store.remove(cat.id)
    const dbRows = getTable("categories")
    expect(dbRows.find((r) => r.id === cat.id)).toBeUndefined()
  })

  it("gets category by id", async () => {
    const store = useCategoriesStore.getState()
    const cat = await store.add({ name: "Utilities", type: "expense", color: "#ffff00" })

    const found = store.getById(cat.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe("Utilities")
  })

  it("gets child categories", async () => {
    const store = useCategoriesStore.getState()
    const parent = await store.add({ name: "Food", type: "expense", color: "#ff0000" })
    await store.add({ name: "Groceries", type: "expense", color: "#00ff00", parentId: parent.id })
    await store.add({ name: "Dining Out", type: "expense", color: "#0000ff", parentId: parent.id })

    await store.load()
    const children = useCategoriesStore.getState().getChildren(parent.id)
    expect(children).toHaveLength(2)
    expect(children.map((c) => c.name).sort()).toEqual(["Dining Out", "Groceries"])
  })
})

describe("Transactions Store", () => {
  beforeEach(() => {
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

  it("updates a transaction in the database", async () => {
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 42, currency: "USD", date: new Date("2026-05-01"),
    })

    await store.update(txn.id, { amount: 99, description: "Updated" })

    const dbRows = getTable("transactions")
    const updated = dbRows.find((r) => r.id === txn.id)
    expect(updated?.amount).toBe(99)
    expect(updated?.description).toBe("Updated")
  })

  it("removes a transaction from the database", async () => {
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 15, currency: "USD", date: new Date("2026-05-01"),
    })

    await store.remove(txn.id)
    const dbRows = getTable("transactions")
    expect(dbRows.find((r) => r.id === txn.id)).toBeUndefined()
  })

  it("filters by account", async () => {
    const store = useTransactionsStore.getState()
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 10, currency: "USD", date: new Date("2026-05-01"),
    })
    await store.add({
      accountId: "acc-2", categoryId: "cat-1", type: "expense",
      amount: 20, currency: "USD", date: new Date("2026-05-02"),
    })

    await store.load()
    const forAcc1 = useTransactionsStore.getState().getByAccount("acc-1")
    expect(forAcc1).toHaveLength(1)
    expect(forAcc1[0].amount).toBe(10)
  })

  it("filters by category", async () => {
    const store = useTransactionsStore.getState()
    await store.add({
      accountId: "acc-1", categoryId: "cat-food", type: "expense",
      amount: 50, currency: "USD", date: new Date("2026-05-01"),
    })
    await store.add({
      accountId: "acc-1", categoryId: "cat-rent", type: "expense",
      amount: 500, currency: "USD", date: new Date("2026-05-01"),
    })

    await store.load()
    const forFood = useTransactionsStore.getState().getByCategory("cat-food")
    expect(forFood).toHaveLength(1)
    expect(forFood[0].amount).toBe(50)
  })

  it("filters by type", async () => {
    const store = useTransactionsStore.getState()
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "income",
      amount: 1000, currency: "USD", date: new Date("2026-05-01"),
    })
    await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 100, currency: "USD", date: new Date("2026-05-02"),
    })

    await store.load()
    const incomes = useTransactionsStore.getState().getByType("income")
    const expenses = useTransactionsStore.getState().getByType("expense")
    expect(incomes).toHaveLength(1)
    expect(incomes[0].amount).toBe(1000)
    expect(expenses).toHaveLength(1)
    expect(expenses[0].amount).toBe(100)
  })

  it("gets transaction by id", async () => {
    const store = useTransactionsStore.getState()
    const txn = await store.add({
      accountId: "acc-1", categoryId: "cat-1", type: "expense",
      amount: 42, currency: "USD", date: new Date("2026-05-01"),
    })

    const found = store.getById(txn.id)
    expect(found).toBeDefined()
    expect(found!.amount).toBe(42)
  })
})

describe("Budgets Store", () => {
  beforeEach(() => {
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

    const dbRows = getTable("budgets")
    const updated = dbRows.find((r) => r.id === budget.id)
    expect(updated?.amount).toBe(1000)
    expect(updated?.name).toBe("Updated Budget")
  })

  it("removes a budget from the database", async () => {
    const store = useBudgetsStore.getState()
    const budget = await store.add({
      categoryIds: ["cat-1"],
      name: "To Delete",
      amount: 100,
      period: "monthly",
      startDate: new Date("2026-01-01"),
    })

    await store.remove(budget.id)
    const dbRows = getTable("budgets")
    expect(dbRows.find((r) => r.id === budget.id)).toBeUndefined()
  })

  it("gets budget by id", async () => {
    const store = useBudgetsStore.getState()
    const budget = await store.add({
      categoryIds: ["cat-1"],
      name: "Find Me",
      amount: 500,
      period: "monthly",
      startDate: new Date("2026-01-01"),
    })

    const found = store.getById(budget.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe("Find Me")
  })
})

describe("Investment Plans Store", () => {
  beforeEach(() => {
    useInvestmentPlansStore.setState({ plans: [], loading: false })
  })

  it("starts with empty state", () => {
    const state = useInvestmentPlansStore.getState()
    expect(state.plans).toEqual([])
    expect(state.loading).toBe(false)
  })

  it("adds an investment plan and loads it", async () => {
    const store = useInvestmentPlansStore.getState()
    const plan = await store.add({
      name: "Index Fund",
      type: "index_fund",
      initialAmount: 10000,
      monthlyContribution: 500,
      annualReturnRate: 7,
      currency: "USD",
    })

    expect(plan.name).toBe("Index Fund")
    expect(plan.type).toBe("index_fund")
    expect(plan.id).toBeDefined()

    const loaded = useInvestmentPlansStore.getState()
    expect(loaded.plans).toHaveLength(1)
    expect(loaded.plans[0].initialAmount).toBe(10000)
  })

  it("updates a plan in the database", async () => {
    const store = useInvestmentPlansStore.getState()
    const plan = await store.add({
      name: "Old Plan",
      type: "stock",
      initialAmount: 5000,
      monthlyContribution: 200,
      annualReturnRate: 5,
      currency: "USD",
    })

    await store.update(plan.id, { name: "New Plan", monthlyContribution: 300 })

    const dbRows = getTable("investment_plans")
    const updated = dbRows.find((r) => r.id === plan.id)
    expect(updated?.name).toBe("New Plan")
    expect(updated?.monthly_contribution).toBe(300)
  })

  it("removes a plan from the database", async () => {
    const store = useInvestmentPlansStore.getState()
    const plan = await store.add({
      name: "To Delete",
      type: "cash",
      initialAmount: 1000,
      monthlyContribution: 100,
      annualReturnRate: 2,
      currency: "USD",
    })

    await store.remove(plan.id)
    const dbRows = getTable("investment_plans")
    expect(dbRows.find((r) => r.id === plan.id)).toBeUndefined()
  })

  it("gets plan by id", async () => {
    const store = useInvestmentPlansStore.getState()
    const plan = await store.add({
      name: "Find Me",
      type: "real_estate",
      initialAmount: 50000,
      monthlyContribution: 1000,
      annualReturnRate: 8,
      currency: "USD",
    })

    const found = store.getById(plan.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe("Find Me")
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
