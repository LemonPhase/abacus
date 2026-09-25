import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Accounts from '@/pages/Accounts'
import { useAccountsStore } from '@/stores/accountsStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getTable, resetAllTables } from '@/test/supabase-mock'
import type { Account } from '@/types'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    type: 'checking',
    currency: 'USD',
    openingBalance: 1000,
    balance: 1200,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function seedAccount(account: Account) {
  getTable('accounts').push({
    ...account,
    user_id: 'mock-user',
    created_at: account.createdAt.toISOString(),
    updated_at: account.updatedAt.toISOString(),
  })
}

function RoutePath() {
  return <output data-testid="pathname">{useLocation().pathname}</output>
}

function renderPage(route = '/app/accounts') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Accounts />
      <RoutePath />
    </MemoryRouter>,
  )
}

describe('Accounts page — opening balance semantics', () => {
  beforeEach(() => {
    resetAllTables()
    useAccountsStore.setState({ accounts: [], loading: false, _unsub: null })
    useTransactionsStore.setState({ transactions: [], loading: false, _unsub: null })
    useSettingsStore.setState({ baseCurrency: 'USD' })
  })

  it('add dialog asks for an opening balance, not a balance', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /add account/i }))
    expect(await screen.findByText('Opening balance')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Balance$/)).not.toBeInTheDocument()
  })

  it('adding an account stores opening balance and derives the balance', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /add account/i }))
    await user.type(await screen.findByLabelText(/Name/), 'Cash Wallet')
    await user.type(screen.getByLabelText('Opening balance'), '250')
    await user.click(screen.getByRole('button', { name: 'Add Account' }))

    await waitFor(() => {
      expect(useAccountsStore.getState().accounts).toHaveLength(1)
    })
    const row = getTable('accounts')[0]
    expect(row.opening_balance).toBe(250)
    // balance = opening + no transactions yet
    expect(row.balance).toBe(250)
    expect(useAccountsStore.getState().accounts[0].openingBalance).toBe(250)
  })

  it('locks and annotates the currency field when the account has transactions', async () => {
    seedAccount(makeAccount())
    useTransactionsStore.setState({
      transactions: [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          categoryId: null,
          type: 'expense',
          amount: 10,
          currency: 'USD',
          baseAmount: 10,
          baseCurrency: 'USD',
          baseAmountStale: false,
          fxRate: null,
          fxDate: null,
          date: new Date('2026-01-02'),
          createdAt: new Date('2026-01-02'),
          updatedAt: new Date('2026-01-02'),
        },
      ],
      loading: false,
      _unsub: null,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Checking' }))

    // Pre-emptive guard for the 20260918000001 currency-pinning FK: the field
    // is disabled with a reason, not left to fail at the database.
    expect(
      await screen.findByText(/Currency can.t be changed while transactions reference/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeDisabled()
  })

  it('keeps the currency field editable when the account has no transactions', async () => {
    seedAccount(makeAccount())
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Edit Checking' }))

    await screen.findByLabelText('Opening balance')
    expect(screen.getByLabelText('Currency')).toBeEnabled()
    expect(screen.queryByText(/Currency can.t be changed/)).not.toBeInTheDocument()
  })

  it('edit dialog shows the derived current balance read-only and the opening balance', async () => {
    seedAccount(makeAccount())
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Checking')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    expect(await screen.findByText('Current balance (derived)')).toBeInTheDocument()
    // rendered in the table row and in the edit dialog
    expect(screen.getAllByText('$1,200').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByLabelText('Opening balance')).toHaveValue(1000)
  })

  it('saving an edit sends opening_balance and never balance', async () => {
    seedAccount(makeAccount())
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Checking')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = await screen.findByLabelText('Opening balance')
    await user.clear(input)
    await user.type(input, '1300')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(useAccountsStore.getState().accounts[0]?.openingBalance).toBe(1300)
    })
    const row = getTable('accounts').find((r) => r.id === 'acc-1')
    expect(row?.opening_balance).toBe(1300)
    // balance re-derived in the DB (mock) from the new opening balance + effects
    expect(row?.balance).toBe(1300)
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it('reloads accounts after an opening-balance edit so the store balance is fresh', async () => {
    // Seed with a drifted balance (opening 1000, balance 1200) as the DB would have it.
    seedAccount(makeAccount())
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Checking')

    await user.click(screen.getByRole('button', { name: /edit/i }))
    const input = await screen.findByLabelText('Opening balance')
    await user.clear(input)
    await user.type(input, '1300')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The optimistic update only merges request fields; the page must reload so
    // the store's derived balance reflects the database (1300, not the stale 1200).
    await waitFor(() => {
      expect(useAccountsStore.getState().accounts[0]?.balance).toBe(1300)
    })
    expect(useAccountsStore.getState().accounts[0]?.openingBalance).toBe(1300)
  })

  it('links to the standalone Investments page', async () => {
    renderPage()
    await screen.findByText('No accounts yet')
    expect(screen.getByRole('link', { name: 'View investments' })).toHaveAttribute(
      'href',
      '/app/investments',
    )
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })
})
