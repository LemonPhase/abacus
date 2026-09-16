import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Transactions from '@/pages/Transactions'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Account, Category, Transaction } from '@/types'

function renderWithRouter(ui: React.ReactElement) {
  return {
    user: userEvent.setup(),
    ...render(<MemoryRouter>{ui}</MemoryRouter>),
  }
}

const accountFixture: Account = {
  id: 'acc-1',
  name: 'Checking',
  type: 'checking',
  currency: 'USD',

  openingBalance: 0,
  balance: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const toAccountFixture: Account = {
  id: 'acc-2',
  name: 'Savings',
  type: 'savings',
  currency: 'EUR',

  openingBalance: 0,
  balance: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const categoryFixture: Category = {
  id: 'cat-1',
  name: 'Transfers',
  type: 'expense',
  color: '#ff0000',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function transferLeg(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'leg',
    accountId: accountFixture.id,
    categoryId: categoryFixture.id,
    type: 'transfer',
    amount: -125,
    currency: accountFixture.currency,
    baseAmount: -125,
    baseCurrency: accountFixture.currency,
    date: new Date('2026-05-01'),
    description: 'Move funds',
    transferId: 'pair-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const outLeg = transferLeg({ id: 'tx-out', amount: -125, description: 'Out going' })
const inLeg = transferLeg({
  id: 'tx-in',
  accountId: toAccountFixture.id,
  currency: toAccountFixture.currency,
  amount: 125,
  description: 'Coming in',
  transferId: 'pair-1',
})

const noop = vi.fn()

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({
    accounts: [accountFixture, toAccountFixture],
    loading: false,
    error: null,
    _unsub: null,
    load: noop,
  })
  useCategoriesStore.setState({
    categories: [categoryFixture],
    loading: false,
    error: null,
    _unsub: null,
    load: noop,
  })
  useTransactionsStore.setState({
    transactions: [],
    loading: false,
    error: null,
    _unsub: null,
    load: noop,
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    createTransfer: vi.fn(),
    editTransfer: vi.fn(),
    deleteTransfer: vi.fn(),
    convertTransferToPlain: vi.fn(),
  })
})

async function openTransferDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText('Transactions')
  await user.click(screen.getByRole('button', { name: 'Add Transaction' }))
  const dialog = await screen.findByRole('dialog')

  const comboboxes = within(dialog).getAllByRole('combobox')
  // Type → Transfer
  await user.click(comboboxes[0])
  await user.click(await screen.findByRole('option', { name: 'Transfer' }))

  const updated = within(dialog).getAllByRole('combobox')
  // From / To / Category
  await user.click(updated[1])
  await user.click(await screen.findByRole('option', { name: 'Checking (USD)' }))
  await user.click(updated[2])
  await user.click(await screen.findByRole('option', { name: 'Savings (EUR)' }))
  await user.click(updated[3])
  await user.click(await screen.findByRole('option', { name: 'Transfers' }))

  const amountInput = within(dialog).getByLabelText('Amount')
  await user.clear(amountInput)
  await user.type(amountInput, '125')
  await user.type(within(dialog).getByLabelText('Description'), 'Move funds')

  return dialog
}

describe('Transactions transfer logic', () => {
  it('creates a transfer with one atomic RPC call', async () => {
    const { user } = renderWithRouter(<Transactions />)

    await openTransferDialog(user)
    await user.click(
      screen.getByRole('dialog').querySelector('button[type="submit"]') ??
        screen.getByRole('button', { name: 'Add Transaction' }),
    )

    await waitFor(() => {
      expect(useTransactionsStore.getState().createTransfer).toHaveBeenCalledTimes(1)
    })

    expect(useTransactionsStore.getState().createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        fromAccountId: accountFixture.id,
        toAccountId: toAccountFixture.id,
        amount: 125,
        convertedAmount: 125,
        categoryId: categoryFixture.id,
        description: 'Move funds',
      }),
    )
    // The legacy multi-step orchestration is gone.
    expect(useTransactionsStore.getState().add).not.toHaveBeenCalled()
    expect(useTransactionsStore.getState().update).not.toHaveBeenCalled()
    // The dialog closes on success.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('reuses the idempotency key across retries within the same dialog session', async () => {
    const { user } = renderWithRouter(<Transactions />)

    const createTransfer = useTransactionsStore.getState().createTransfer as ReturnType<
      typeof vi.fn
    >
    createTransfer.mockRejectedValueOnce(new Error('network gone'))
    createTransfer.mockResolvedValueOnce([outLeg, inLeg])

    await openTransferDialog(user)
    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))
    await waitFor(() => expect(createTransfer).toHaveBeenCalledTimes(1))
    const firstKey = createTransfer.mock.calls[0][0].idempotencyKey

    // Retry after the failure — dialog stays open, key unchanged.
    await user.click(screen.getByRole('button', { name: 'Add Transaction' }))
    await waitFor(() => expect(createTransfer).toHaveBeenCalledTimes(2))
    expect(createTransfer.mock.calls[1][0].idempotencyKey).toBe(firstKey)
  })

  it('edits an existing transfer pair through one editTransfer call', async () => {
    useTransactionsStore.setState({ transactions: [outLeg, inLeg] })
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    // Hover row controls: the pencil button for the outgoing leg.
    const row = screen.getByText('Out going').closest('tr')!
    await user.click(within(row).getAllByRole('button')[0])

    const dialog = await screen.findByRole('dialog')
    const amountInput = within(dialog).getByLabelText('Amount')
    await user.clear(amountInput)
    await user.type(amountInput, '200')

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(useTransactionsStore.getState().editTransfer).toHaveBeenCalledTimes(1)
    })
    expect(useTransactionsStore.getState().editTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        transferId: 'pair-1',
        fromAccountId: accountFixture.id,
        toAccountId: toAccountFixture.id,
        amount: 200,
      }),
    )
    expect(useTransactionsStore.getState().update).not.toHaveBeenCalled()
  })

  it('converts a transfer back to a plain transaction through one RPC call', async () => {
    useTransactionsStore.setState({ transactions: [outLeg, inLeg] })
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    const row = screen.getByText('Out going').closest('tr')!
    await user.click(within(row).getAllByRole('button')[0])

    const dialog = await screen.findByRole('dialog')
    const comboboxes = within(dialog).getAllByRole('combobox')
    await user.click(comboboxes[0])
    await user.click(await screen.findByRole('option', { name: 'Expense' }))

    // Type change resets the category; pick one so validation passes.
    const updatedComboboxes = within(dialog).getAllByRole('combobox')
    await user.click(updatedComboboxes[2])
    await user.click(await screen.findByRole('option', { name: 'Transfers' }))

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(useTransactionsStore.getState().convertTransferToPlain).toHaveBeenCalledTimes(1)
    })
    expect(useTransactionsStore.getState().convertTransferToPlain).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: 'tx-out',
        newType: 'expense',
        amount: 125,
        accountId: accountFixture.id,
      }),
    )
  })

  it('deletes both legs of a pair through one deleteTransfer call', async () => {
    useTransactionsStore.setState({ transactions: [outLeg, inLeg] })
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText('Transactions')
    const row = screen.getByText('Out going').closest('tr')!
    await user.click(within(row).getAllByRole('button')[1])

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(useTransactionsStore.getState().deleteTransfer).toHaveBeenCalledTimes(1)
    })
    expect(useTransactionsStore.getState().deleteTransfer).toHaveBeenCalledWith('pair-1')
    expect(useTransactionsStore.getState().remove).not.toHaveBeenCalled()
  })
})
