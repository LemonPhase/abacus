export type AccountType = 'checking' | 'savings' | 'investment' | 'credit' | 'cash'

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  balance: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export type CategoryKind = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  type: CategoryKind
  parentId?: string
  color: string
  icon?: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export type TransactionKind = 'income' | 'expense' | 'transfer'

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
  createdAt: Date
  updatedAt: Date
}

export type BudgetPeriod = 'monthly' | 'yearly'

export interface Budget {
  id: string
  categoryIds: string[]
  name: string
  amount: number
  period: BudgetPeriod
  startDate: Date
  createdAt: Date
  updatedAt: Date
}

export interface ExchangeRate {
  id: string
  fromCurrency: string
  toCurrency: string
  rate: number
  date: Date
}

export type InvestmentType =
  | 'fixed_income'
  | 'index_fund'
  | 'stock'
  | 'real_estate'
  | 'cash'
  | 'crypto'
  | 'other'

export interface InvestmentPlan {
  id: string
  name: string
  type: InvestmentType
  initialAmount: number
  monthlyContribution: number
  annualReturnRate: number
  currency: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface ProjectionYear {
  year: number
  principal: number
  returns: number
  totalValue: number
}

export type NewInvestmentPlan = Omit<InvestmentPlan, 'id' | 'createdAt' | 'updatedAt'>

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UserSettings {
  baseCurrency: string
  theme: ThemeMode
  onboarded: boolean
}

export type NewAccount = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>
export type NewCategory = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>
export type NewTransaction = Omit<
  Transaction,
  'id' | 'baseAmount' | 'baseCurrency' | 'createdAt' | 'updatedAt'
>
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type RecurringTransactionKind = 'income' | 'expense'

export interface RecurringTransaction {
  id: string
  accountId: string
  categoryId: string | null
  type: RecurringTransactionKind
  amount: number
  currency: string
  description?: string
  frequency: RecurringFrequency
  intervalValue: number
  dayOfMonth?: number | null
  startDate: Date
  endDate?: Date | null
  nextDate: Date
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export type NewRecurringTransaction = Omit<RecurringTransaction, 'id' | 'createdAt' | 'updatedAt'>

export type NewBudget = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>
