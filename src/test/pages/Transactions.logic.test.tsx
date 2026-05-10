import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Transactions from "@/pages/Transactions"
import { useAccountsStore } from "@/stores/accountsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { Account, Category, Transaction } from "@/types"

function renderWithRouter(ui: React.ReactElement) {
  return {
    user: userEvent.setup(),
    ...render(<MemoryRouter>{ui}</MemoryRouter>),
  }
}

const accountFixture: Account = {
  id: "acc-1",
  name: "Checking",
  type: "checking",
  currency: "USD",
  balance: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const toAccountFixture: Account = {
  id: "acc-2",
  name: "Savings",
  type: "savings",
  currency: "EUR",
  balance: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const categoryFixture: Category = {
  id: "cat-1",
  name: "Transfers",
  type: "expense",
  color: "#ff0000",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null, load: vi.fn().mockResolvedValue(undefined) })
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null, load: vi.fn().mockResolvedValue(undefined) })
  useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null, load: vi.fn().mockResolvedValue(undefined) })
})

describe("Transactions transfer logic", () => {
  it("creates two linked transfer transactions", async () => {
    const add = vi.fn()
    const update = vi.fn().mockResolvedValue(undefined)

    const outTx: Transaction = {
      id: "tx-out",
      accountId: accountFixture.id,
      categoryId: categoryFixture.id,
      type: "transfer",
      amount: -125,
      currency: accountFixture.currency,
      baseAmount: -125,
      baseCurrency: accountFixture.currency,
      date: new Date("2026-05-01"),
      description: "Move funds",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const inTx: Transaction = {
      id: "tx-in",
      accountId: toAccountFixture.id,
      categoryId: categoryFixture.id,
      type: "transfer",
      amount: 125,
      currency: toAccountFixture.currency,
      baseAmount: 125,
      baseCurrency: toAccountFixture.currency,
      date: new Date("2026-05-01"),
      description: "Move funds",
      correlativeId: outTx.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    add.mockResolvedValueOnce(outTx).mockResolvedValueOnce(inTx)

    useAccountsStore.setState({ accounts: [accountFixture, toAccountFixture], loading: false, error: null, _unsub: null })
    useCategoriesStore.setState({ categories: [categoryFixture], loading: false, error: null, _unsub: null })
    useTransactionsStore.setState({ add, update, transactions: [], loading: false, error: null, _unsub: null })

    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText("Transactions")
    await user.click(screen.getByRole("button", { name: "Add Transaction" }))

    const dialog = await screen.findByRole("dialog")

    // Find all comboboxes in the dialog
    const comboboxes = within(dialog).getAllByRole("combobox")
    // The first one is Type (which has no accessible name)
    await user.click(comboboxes[0])
    await user.click(await screen.findByRole("option", { name: "Transfer" }))

    // Re-fetch comboboxes after changing Type
    const updatedComboboxes = within(dialog).getAllByRole("combobox")

    // Account (From) is index 1
    await user.click(updatedComboboxes[1])
    await user.click(await screen.findByRole("option", { name: "Checking (USD)" }))

    // Account (To) is index 2
    await user.click(updatedComboboxes[2])
    await user.click(await screen.findByRole("option", { name: "Savings (EUR)" }))

    // Category is index 3
    await user.click(updatedComboboxes[3])
    await user.click(await screen.findByRole("option", { name: "Transfers" }))

    const amountInput = within(dialog).getByLabelText("Amount")
    await user.clear(amountInput)
    await user.type(amountInput, "125")

    const descriptionInput = within(dialog).getByLabelText("Description")
    await user.type(descriptionInput, "Move funds")

    await user.click(within(dialog).getByRole("button", { name: "Add Transaction" }))

    await waitFor(() => {
      expect(add).toHaveBeenCalledTimes(2)
    })

    expect(add.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        accountId: accountFixture.id,
        categoryId: categoryFixture.id,
        type: "transfer",
        amount: -125,
        currency: accountFixture.currency,
        description: "Move funds",
      })
    )

    expect(add.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        accountId: toAccountFixture.id,
        categoryId: categoryFixture.id,
        type: "transfer",
        amount: 125,
        currency: toAccountFixture.currency,
        description: "Move funds",
        correlativeId: outTx.id,
      })
    )
  })
})
