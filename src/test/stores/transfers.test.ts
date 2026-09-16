import { describe, it, expect, beforeEach } from 'vitest'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { mockSupabase } from '@/test/supabase-mock'
import type { Database } from '@/supabase/database.types'
import type { Transaction } from '@/types'

type TxRow = Database['public']['Tables']['transactions']['Row']

const ISO = '2026-01-01T00:00:00.000Z'

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
    date: new Date(row.date),
    description: row.description ?? undefined,
    correlativeId: row.correlative_id ?? undefined,
    transferId: row.transfer_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

beforeEach(() => {
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    _unsub: null,
  })
})

describe('transfer RPC actions', () => {
  it('createTransfer calls the RPC with snake_case args and upserts the returned legs', async () => {
    const out = leg({ id: 'out-1', amount: -100, correlative_id: 'in-1' })
    const inc = leg({
      id: 'in-1',
      amount: 90,
      account_id: 'acc-2',
      currency: 'EUR',
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

    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_transfer', {
      p_idempotency_key: 'pair-1',
      p_from_account_id: 'acc-1',
      p_to_account_id: 'acc-2',
      p_amount: 100,
      p_converted_amount: 90,
      p_category_id: null,
      p_date: '2026-01-01',
      p_description: 'rent',
      p_out_transaction_id: null,
    })
    expect(legs).toHaveLength(2)
    expect(legs[0].transferId).toBe('pair-1')
    expect(legs[0].date).toEqual(new Date('2026-01-01'))
    expect(useTransactionsStore.getState().transactions.map((t) => t.id)).toEqual(['out-1', 'in-1'])
  })

  it('createTransfer passes an existing row id when converting a non-transfer into a transfer', async () => {
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

  it('createTransfer surfaces RPC errors and leaves state untouched', async () => {
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

  it('editTransfer updates both legs in place', async () => {
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
      p_category_id: null,
      p_date: '2026-01-01',
      p_description: null,
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

  it('convertTransferToPlain replaces the leg and drops its partner', async () => {
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
      p_category_id: null,
      p_date: '2026-01-01',
      p_description: 'misc',
    })
    expect(row.type).toBe('expense')
    const state = useTransactionsStore.getState().transactions
    expect(state.map((t) => t.id)).toEqual(['out-1', 'plain'])
    expect(state[0].transferId).toBeUndefined()
  })

  it('discards a response that lands after the store was reset', async () => {
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
    useTransactionsStore.getState().reset()
    resolveRpc!({ data: [leg({ id: 'late' })], error: null })

    await expect(pending).rejects.toThrow('Session changed')
    expect(useTransactionsStore.getState().transactions).toEqual([])
  })
})
