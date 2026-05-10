export type AccountType = "checking" | "savings" | "investment" | "credit" | "cash"

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  notes?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export type CategoryKind = "income" | "expense"

export interface Category {
  id: string
  name: string
  type: CategoryKind
  parentId?: string
  color: string
  icon?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export type TransactionKind = "income" | "expense" | "transfer"

export interface Transaction {
  id: string
  accountId: string
  categoryId: string | null
  type: TransactionKind
  amount: number
  currency: string
  baseAmount: number
  baseCurrency: string
  date: Date
  description?: string
  correlativeId?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export type BudgetPeriod = "monthly" | "yearly"

export interface Budget {
  id: string
  categoryIds: string[]
  name: string
  amount: number
  period: BudgetPeriod
  startDate: Date
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  date: Date
}

export type InvestmentType = "fixed_income" | "index_fund" | "stock" | "real_estate" | "cash" | "crypto" | "other"

export interface InvestmentPlan {
  id: string
  name: string
  type: InvestmentType
  initialAmount: number
  monthlyContribution: number
  annualReturnRate: number
  currency: string
  notes?: string
  createdAt: Date | string
  updatedAt: Date | string
}

export interface ProjectionYear {
  year: number
  principal: number
  returns: number
  totalValue: number
}

export type NewInvestmentPlan = Omit<InvestmentPlan, "id" | "createdAt" | "updatedAt">

export type ThemeMode = "light" | "dark" | "system"

export interface UserSettings {
  baseCurrency: string
  theme: ThemeMode
  onboarded: boolean
}

export type NewAccount = Omit<Account, "id" | "createdAt" | "updatedAt">
export type NewCategory = Omit<Category, "id" | "createdAt" | "updatedAt">
export type NewTransaction = Omit<Transaction, "id" | "baseAmount" | "baseCurrency" | "createdAt" | "updatedAt">
export type NewBudget = Omit<Budget, "id" | "createdAt" | "updatedAt">
