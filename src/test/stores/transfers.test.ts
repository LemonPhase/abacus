import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { mockSupabase, resetAllTables } from '@/test/supabase-mock'
import type { Database } from '@/supabase/database.types'
import type { Account, Transaction } from '@/types'

type TxRow = Database['public']['Tables']['transactions']['Row']

const ISO = '2026-01-01T00:00:00.000Z'

const acc1: Account = {
  id: 'acc-1',
  name: 'Checking',
  type: 'checking',
  currency: 'USD',
  openingBalance: 0,
  balance: 0,
  createdAt: new Date(ISO),
  updatedAt: new Date(ISO),
}
const acc2: Account = {
  id: 'acc-2',
  name: 'Savings',
  type: 'savings',
  currency: 'EUR',
  openingBalance: 0,
  balance: 0,
  createdAt: new Date(ISO),
  updatedAt: new Date(ISO),
}

function leg(overrides: Partial<TxRow>): TxRow {
  return {
    id: 'leg',
    user_id: 'user-1',
    created_at: ISO,
    updated_at: ISO,
    account_id: 'acc-1',
    category_id: null,
    type: 'transfer',
    amount: -100,
    currency: 'USD',
    base_amount: -100,
    base_currency: 'USD',
    fx_rate: null,
    fx_date: null,
    base_amount_stale: false,
    date: '2026-01-01',
    description: null,
    correlative_id: null,
    transfer_id: 'pair-1',
    ...overrides,
  }
}

// Seed helper: shape rows take after mapRow (camelCase, Date fields).
function mapped(row: TxRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    type: row.type as Transaction['type'],
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    baseCurrency: row.base_currency,
    fxRate: row.fx_rate,
    fxDate: row.fx_date,
    baseAmountStale: row.base_amount_stale,
    date: new Date(row.date),
    description: row.description ?? undefined,
    correlativeId: row.correlative_id ?? undefined,
    transferId: row.transfer_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function stubRate(rates: Record<string, number>): ReturnType<typeof vi.fn> {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ result: 'success', rates }),
  })
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

beforeEach(() => {
  useSettingsStore.setState({ baseCurrency: 'USD' })
  useAccountsStore.setState({
    accounts: [acc1, acc2],
    loading: false,
    error: null,
    _unsub: null,
  })
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    _unsub: null,
  })
})

afterEach(() => {
  resetAllTables()
  vi.unstubAllGlobals()
})

describe('transfer RPC actions', () => {
  it('createTransfer computes per-leg provenance and upserts the returned legs', async () => {
    // In leg is EUR; stub EUR→USD (the reporting currency) at 1.08.
    stubRate({ USD: 1.08 })
    const out = leg({ id: 'out-1', amount: -100, correlative_id: 'in-1' })
    const inc = leg({
      id: 'in-1',
      amount: 90,
      account_id: 'acc-2',
      currency: 'EUR',
      base_amount: 97.2,
      base_currency: 'USD',
      fx_rate: 1.08,
      fx_date: todayStr(),
      correlative_id: 'out-1',
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [out, inc], error: null })

    const legs = await useTransactionsStore.getState().createTransfer({
      idempotencyKey: 'pair-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 100,
      convertedAmount: 90,
      categoryId: null,
      date: new Date('2026-01-01'),
      description: 'rent',
    })

    // Out leg (USD, the reporting currency): identity conversion, no quote.
    // In leg (EUR): converted with recorded provenance — never 1:1.
    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_transfer', {
      p_idempotency_key: 'pair-1',
      p_from_account_id: 'acc-1',
      p_to_account_id: 'acc-2',
      p_amount: 100,
      p_converted_amount: 90,
      p_category_id: undefined,
      p_date: '2026-01-01',
      p_description: 'rent',
      p_out_transaction_id: undefined,
      p_out_base_amount: -100,
      p_out_base_currency: 'USD',
      p_out_fx_rate: undefined,
      p_out_fx_date: undefined,
      p_out_base_stale: false,
      p_in_base_amount: 97.2,
      p_in_base_currency: 'USD',
      p_in_fx_rate: 1.08,
      p_in_fx_date: todayStr(),
      p_in_base_stale: false,
    })
    expect(legs).toHaveLength(2)
    expect(legs[0].transferId).toBe('pair-1')
    expect(legs[0].date).toEqual(new Date('2026-01-01'))
    expect(legs[0].fxRate).toBeNull()
    expect(legs[1].fxRate).toBe(1.08)
    expect(legs[1].fxDate).toBe(todayStr())
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual(['out-1', 'in-1'])
  })

  it('createTransfer flags a leg stale when no rate is available (no silent 1:1)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const out = leg({ id: 'out-1', amount: -100 })
    const inc = leg({ id: 'in-1', amount: 90, account_id: 'acc-2', currency: 'EUR' })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [out, inc], error: null })

    await useTransactionsStore.getState().createTransfer({
      idempotencyKey: 'pair-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 100,
      convertedAmount: 90,
      categoryId: null,
      date: new Date('2026-01-01'),
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_transfer',
      expect.objectContaining({
        // Out leg: USD identity conversion stays reliable.
        p_out_base_amount: -100,
        p_out_base_currency: 'USD',
        p_out_base_stale: false,
        // In leg: no EUR→USD rate → kept in EUR, flagged stale so
        // aggregates exclude it (20260917000003 semantics).
        p_in_base_amount: 90,
        p_in_base_currency: 'EUR',
        p_in_fx_rate: undefined,
        p_in_fx_date: undefined,
        p_in_base_stale: true,
      }),
    )
  })

  it('createTransfer passes an existing row id when converting a non-transfer into a transfer', async () => {
    stubRate({ USD: 1 })
    const out = leg({ id: 'existing', transfer_id: 'pair-2' })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [out], error: null })

    await useTransactionsStore.getState().createTransfer({
      idempotencyKey: 'pair-2',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 10,
      convertedAmount: 10,
      categoryId: null,
      date: new Date('2026-01-01'),
      existingTransactionId: 'existing',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'create_transfer',
      expect.objectContaining({ p_out_transaction_id: 'existing' }),
    )
  })

  it('createTransfer rejects when a leg account is not loaded (no provenance guess)', async () => {
    useAccountsStore.setState({ accounts: [acc1] })
    await expect(
      useTransactionsStore.getState().createTransfer({
        idempotencyKey: 'pair-4',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 10,
        convertedAmount: 10,
        categoryId: null,
        date: new Date('2026-01-01'),
      }),
    ).rejects.toThrow(/acc-2 not found/)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('createTransfer surfaces RPC errors and leaves state untouched', async () => {
    stubRate({ USD: 1 })
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'nope' } })

    await expect(
      useTransactionsStore.getState().createTransfer({
        idempotencyKey: 'pair-3',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 10,
        convertedAmount: 10,
        categoryId: null,
        date: new Date('2026-01-01'),
      }),
    ).rejects.toThrow('nope')

    expect(useTransactionsStore.getState().error).toBe('nope')
    expect(useTransactionsStore.getState().transactions).toEqual([])
  })

  it('editTransfer recomputes provenance for both legs', async () => {
    stubRate({ USD: 1.08 })
    useTransactionsStore.setState({
      transactions: [mapped(leg({ id: 'out-1', amount: -100, correlative_id: 'in-1' }))],
    })
    const out = leg({ id: 'out-1', amount: -50 })
    const inc = leg({ id: 'in-1', amount: 45, account_id: 'acc-2' })
    mockSupabase.rpc.mockResolvedValueOnce({ data: [out, inc], error: null })

    const legs = await useTransactionsStore.getState().editTransfer({
      transferId: 'pair-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 50,
      convertedAmount: 45,
      categoryId: null,
      date: new Date('2026-01-01'),
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('edit_transfer', {
      p_transfer_id: 'pair-1',
      p_from_account_id: 'acc-1',
      p_to_account_id: 'acc-2',
      p_amount: 50,
      p_converted_amount: 45,
      p_category_id: undefined,
      p_date: '2026-01-01',
      p_description: undefined,
      p_out_base_amount: -50,
      p_out_base_currency: 'USD',
      p_out_fx_rate: undefined,
      p_out_fx_date: undefined,
      p_out_base_stale: false,
      p_in_base_amount: 48.6,
      p_in_base_currency: 'USD',
      p_in_fx_rate: 1.08,
      p_in_fx_date: todayStr(),
      p_in_base_stale: false,
    })
    expect(legs.map((l) => l.amount)).toEqual([-50, 45])
    const ids = useTransactionsStore
      .getState()
      .transactions.map((t) => t.id)
      .sort()
    expect(ids).toEqual(['in-1', 'out-1'])
  })

  it('deleteTransfer removes every leg of the pair from local state', async () => {
    useTransactionsStore.setState({
      transactions: [
        mapped(leg({ id: 'out-1', amount: -100 })),
        mapped(leg({ id: 'in-1', amount: 100, account_id: 'acc-2' })),
        mapped(leg({ id: 'other', amount: 5, type: 'income', transfer_id: null })),
      ],
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null })

    await useTransactionsStore.getState().deleteTransfer('pair-1')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('delete_transfer', { p_transfer_id: 'pair-1' })
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual(['other'])
  })

  it('convertTransferToPlain replaces the leg, drops its partner, and records provenance', async () => {
    useTransactionsStore.setState({
      transactions: [
        mapped(leg({ id: 'out-1', amount: -100, correlative_id: 'in-1' })),
        mapped(leg({ id: 'in-1', amount: 100, account_id: 'acc-2' })),
        mapped(leg({ id: 'plain', amount: 5, type: 'income', transfer_id: null })),
      ],
    })
    const converted = leg({
      id: 'out-1',
      type: 'expense',
      amount: 80,
      transfer_id: null,
      correlative_id: null,
    })
    mockSupabase.rpc.mockResolvedValueOnce({ data: converted, error: null })

    const row = await useTransactionsStore.getState().convertTransferToPlain({
      transactionId: 'out-1',
      newType: 'expense',
      amount: 80,
      accountId: 'acc-1',
      categoryId: null,
      date: new Date('2026-01-01'),
      description: 'misc',
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('convert_transfer_to_plain', {
      p_transaction_id: 'out-1',
      p_new_type: 'expense',
      p_amount: 80,
      p_new_account_id: 'acc-1',
      p_category_id: undefined,
      p_date: '2026-01-01',
      p_description: 'misc',
      p_base_amount: 80,
      p_base_currency: 'USD',
      p_fx_rate: undefined,
      p_fx_date: undefined,
      p_base_stale: false,
    })
    expect(row.type).toBe('expense')
    const state = useTransactionsStore.getState().transactions
    expect(state.map((t) => t.id)).toEqual(['out-1', 'plain'])
    expect(state[0].transferId).toBeUndefined()
  })

  it('discards a response that lands after the store was reset', async () => {
    stubRate({ USD: 1 })
    let resolveRpc: ((v: { data: TxRow[]; error: null }) => void) | undefined
    mockSupabase.rpc.mockImplementationOnce(
      () =>
        new Promise<{ data: TxRow[]; error: null }>((resolve) => {
          resolveRpc = resolve
        }),
    )

    const pending = useTransactionsStore.getState().createTransfer({
      idempotencyKey: 'pair-9',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 10,
      convertedAmount: 10,
      categoryId: null,
      date: new Date('2026-01-01'),
    })
    // Provenance is computed before the RPC fires.
    await vi.waitFor(() => expect(mockSupabase.rpc).toHaveBeenCalledTimes(1))
    useTransactionsStore.getState().reset()
    resolveRpc!({ data: [leg({ id: 'late' })], error: null })

    await expect(pending).rejects.toThrow('Session changed')
    expect(useTransactionsStore.getState().transactions).toEqual([])
  })
})
