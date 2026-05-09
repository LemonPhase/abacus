import type {
  Account,
  Category,
  Transaction,
  Budget,
  ExchangeRate,
  InvestmentPlan,
} from "@/types"

export interface AbacusDBSchema {
  accounts: Account
  categories: Category
  transactions: Transaction
  budgets: Budget
  exchangeRates: ExchangeRate
  investmentPlans: InvestmentPlan
}

export const DB_NAME = "abacus-db"
export const DB_VERSION = 2

export const TABLE_NAMES = {
  accounts: "accounts",
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  exchangeRates: "exchangeRates",
  investmentPlans: "investmentPlans",
} as const
