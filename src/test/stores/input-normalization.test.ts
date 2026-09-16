import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { mockSupabase, getTable, resetAllTables } from '@/test/supabase-mock'

// 20260918000001_input_invariants.sql rejects sub-cent amounts, zero/negative
// recurring intervals and out-of-range day-of-month at the database level.
// The store wrappers normalize user input to that domain so legitimate
// app writes never surface a raw constraint error.
describe('store input normalization (issue #13)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ baseCurrency: 'USD' })
    useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
    useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
    useBudgetsStore.setState({ budgets: [], loading: false, error: null, _unsub: null })
    useInvestmentPlansStore.setState({ plans: [], loading: false, error: null, _unsub: null })
    useRecurringTransactionsStore.setState({
      items: [],
      loading: false,
      error: null,
      _unsub: null,
    })
  })

  afterEach(() => {
    resetAllTables()
    vi.unstubAllGlobals()
  })

  it('transactionsStore.add rounds sub-cent amounts to the currency minor units', async () => {
    const txn = await useTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 19.999,
      currency: 'USD',
      date: new Date('2026-01-01'),
    })
    expect(txn.amount).toBe(20)
    expect(getTable('transactions')[0].amount).toBe(20)
  })

  it('transactionsStore rounds in the row currency (JPY has no minor units)', async () => {
    useSettingsStore.setState({ baseCurrency: 'JPY' })
    const txn = await useTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 1000.55,
      currency: 'JPY',
      date: new Date('2026-01-01'),
    })
    expect(txn.amount).toBe(1001)
  })

  it('transactionsStore.bulkAdd rounds every row (CSV import path)', async () => {
    await useTransactionsStore.getState().bulkAdd([
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'income',
        amount: 10.999,
        currency: 'USD',
        date: new Date('2026-01-01'),
      },
      {
        accountId: 'acc-1',
        categoryId: null,
        type: 'expense',
        amount: 0.005,
        currency: 'USD',
        date: new Date('2026-01-01'),
      },
    ])
    const rows = getTable('transactions')
    expect(rows.map((r) => r.amount)).toEqual([11, 0.01])
  })

  it('transactionsStore.update rounds the amount (also for derived base fields)', async () => {
    const txn = await useTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 10,
      currency: 'USD',
      date: new Date('2026-01-01'),
    })
    await useTransactionsStore.getState().update(txn.id, { amount: 10.999 })
    expect(getTable('transactions')[0].amount).toBe(11)
  })

  it('transactionsStore.createTransfer rounds leg magnitudes per account currency', async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'acc-1',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          openingBalance: 0,
          balance: 0,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'acc-2',
          name: 'Travel',
          type: 'cash',
          currency: 'JPY',
          openingBalance: 0,
          balance: 0,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ],
      loading: false,
      error: null,
      _unsub: null,
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null })

    await useTransactionsStore.getState().createTransfer({
      idempotencyKey: 'pair-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 100.999, // USD → 101
      convertedAmount: 12345.6, // JPY has no minor units → 12346
      categoryId: null,
      date: new Date('2026-01-01'),
    })

    const calls = mockSupabase.rpc.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const [name, args] = calls[calls.length - 1]
    expect(name).toBe('create_transfer')
    const params = args as { p_amount: number; p_converted_amount: number }
    expect(params.p_amount).toBe(101)
    expect(params.p_converted_amount).toBe(12346)
  })

  it('recurringTransactionsStore rounds amounts and clamps schedule bounds', async () => {
    const item = await useRecurringTransactionsStore.getState().add({
      accountId: 'acc-1',
      categoryId: null,
      type: 'expense',
      amount: 10.999,
      currency: 'USD',
      frequency: 'monthly',
      intervalValue: 0,
      dayOfMonth: 32,
      startDate: new Date('2026-01-01'),
      endDate: null,
      nextDate: new Date('2026-01-01'),
      isActive: true,
    })
    expect(item.amount).toBe(11)
    expect(item.intervalValue).toBe(1)
    expect(item.dayOfMonth).toBe(31)

    await useRecurringTransactionsStore.getState().update(item.id, {
      amount: 0.999,
      intervalValue: -3,
      dayOfMonth: 0,
    })
    const row = getTable('recurring_transactions')[0]
    expect(row.amount).toBe(1)
    expect(row.interval_value).toBe(1)
    expect(row.day_of_month).toBe(1)
  })

  it('budgetsStore rounds amounts in the reporting currency (incl. float dust)', async () => {
    const budget = await useBudgetsStore.getState().add({
      name: 'food',
      amount: 66.77000000000001,
      period: 'monthly',
      startDate: new Date('2026-01-01'),
      categoryIds: [],
    })
    expect(budget.amount).toBe(66.77)

    await useBudgetsStore.getState().update(budget.id, { amount: 10.999 })
    expect(getTable('budgets')[0].amount).toBe(11)
  })

  it('investmentPlansStore rounds the money fields in the plan currency', async () => {
    const plan = await useInvestmentPlansStore.getState().add({
      name: 'index',
      type: 'index_fund',
      initialAmount: 5000.999,
      monthlyContribution: 200.999,
      annualReturnRate: 7.5,
      currency: 'USD',
    })
    expect(plan.initialAmount).toBe(5001)
    expect(plan.monthlyContribution).toBe(201)

    await useInvestmentPlansStore.getState().update(plan.id, { initialAmount: 0.999 })
    expect(getTable('investment_plans')[0].initial_amount).toBe(1)
  })

  it('accountsStore rounds opening balances in the account currency', async () => {
    const account = await useAccountsStore.getState().add({
      name: 'Tokyo cash',
      type: 'cash',
      currency: 'JPY',
      openingBalance: 1000.55,
      notes: undefined,
    })
    expect(account.openingBalance).toBe(1001)

    await useAccountsStore.getState().update(account.id, { openingBalance: 100.999 })
    expect(getTable('accounts')[0].opening_balance).toBe(101)
  })
})
