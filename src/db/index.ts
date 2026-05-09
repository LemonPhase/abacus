import Dexie from "dexie"
import type { Account, Category, Transaction, Budget, ExchangeRate, InvestmentPlan } from "@/types"
import { DB_NAME, TABLE_NAMES } from "./schema"
import { seedCategories } from "./seed"

class AbacusDB extends Dexie {
  accounts!: Dexie.Table<Account, string>
  categories!: Dexie.Table<Category, string>
  transactions!: Dexie.Table<Transaction, string>
  budgets!: Dexie.Table<Budget, string>
  exchangeRates!: Dexie.Table<ExchangeRate, string>
  investmentPlans!: Dexie.Table<InvestmentPlan, string>

  constructor() {
    super(DB_NAME)

    this.version(1).stores({
      [TABLE_NAMES.accounts]: "id, currency",
      [TABLE_NAMES.categories]: "id, type, parentId",
      [TABLE_NAMES.transactions]: "id, accountId, categoryId, type, date, currency, correlativeId",
      [TABLE_NAMES.budgets]: "id, period",
      [TABLE_NAMES.exchangeRates]: "id, fromCurrency, toCurrency, date, [fromCurrency+toCurrency+date]",
    })

    this.version(2).stores({
      [TABLE_NAMES.accounts]: "id, currency",
      [TABLE_NAMES.categories]: "id, type, parentId",
      [TABLE_NAMES.transactions]: "id, accountId, categoryId, type, date, currency, correlativeId",
      [TABLE_NAMES.budgets]: "id, period",
      [TABLE_NAMES.exchangeRates]: "id, fromCurrency, toCurrency, date, [fromCurrency+toCurrency+date]",
      [TABLE_NAMES.investmentPlans]: "id, type",
    })
  }

  async seedIfEmpty() {
    const count = await this.categories.count()
    if (count === 0) {
      await this.categories.bulkAdd(seedCategories)
    }
  }
}

export const db = new AbacusDB()
