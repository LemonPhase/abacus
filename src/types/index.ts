export type AccountType = 'checking' | 'savings' | 'investment' | 'credit' | 'cash'

export interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  /** Authoritative user-owned input; balance = openingBalance + signed transaction effects. */
  openingBalance: number
  /** Derived by the database: openingBalance + signed ledger effects. */
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
  /** Currency the amount is denominated in (the account's currency). */
  currency: string
  /** Amount converted into the reporting currency `baseCurrency`. */
  baseAmount: number
  /** Reporting currency this conversion was computed for. */
  baseCurrency: string
  /** FX quote used for the conversion; null for identity conversions or when unavailable. */
  fxRate: number | null
  /** Date (YYYY-MM-DD) the FX quote applies to; null for identity conversions. */
  fxDate: string | null
  /** True when base_amount predates provenance tracking or no reliable rate was available. */
  baseAmountStale: boolean
  date: Date
  description?: string
  correlativeId?: string
  /** Stable id shared by both legs of a transfer pair; doubles as the RPC idempotency key. */
  transferId?: string
  createdAt: Date
  updatedAt: Date
}

/** Input for createTransfer — amounts are positive magnitudes. */
export interface TransferCreateInput {
  /** Client-generated uuid; reused across retries so the RPC can deduplicate. */
  idempotencyKey: string
  fromAccountId: string
  toAccountId: string
  amount: number
  convertedAmount: number
  categoryId: string | null
  date: Date
  description?: string
  /** Existing row to convert into the outgoing leg (non-transfer edited into a transfer). */
  existingTransactionId?: string
}

/** Input for editTransfer — rewrites both legs of an existing pair. */
export interface TransferEditInput {
  transferId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  convertedAmount: number
  categoryId: string | null
  date: Date
  description?: string
}

/** Input for convertTransferToPlain — turns a leg back into a plain transaction. */
export interface TransferConvertInput {
  transactionId: string
  newType: 'income' | 'expense'
  amount: number
  accountId: string
  categoryId: string | null
  date: Date
  description?: string
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

// balance is derived by the database (opening_balance + ledger effects) —
// clients create/correct accounts via openingBalance only.
export type NewAccount = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'balance'>
export type NewCategory = Omit<Category, 'id' | 'createdAt' | 'updatedAt'>
// base fields are derived at write time from amount/currency/date (see transactionsStore)
export type NewTransaction = Omit<
  Transaction,
  | 'id'
  | 'baseAmount'
  | 'baseCurrency'
  | 'fxRate'
  | 'fxDate'
  | 'baseAmountStale'
  | 'createdAt'
  | 'updatedAt'
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
