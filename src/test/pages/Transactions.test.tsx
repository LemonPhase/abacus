import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Transactions from "@/pages/Transactions"
import { TransactionFilters } from "@/pages/transactions/TransactionFilters"
import { TransactionDialog } from "@/pages/transactions/TransactionDialog"
import { CsvImportDialog } from "@/pages/transactions/CsvImportDialog"
import { useAccountsStore } from "@/stores/accountsStore"
import { useCategoriesStore } from "@/stores/categoriesStore"
import { useTransactionsStore } from "@/stores/transactionsStore"
import { useSettingsStore } from "@/stores/settingsStore"
import type { Account, Category } from "@/types"

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

const categoryFixture: Category = {
  id: "cat-1",
  name: "Groceries",
  type: "expense",
  color: "#ff0000",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useAccountsStore.setState({ accounts: [], loading: false, error: null, _unsub: null })
  useCategoriesStore.setState({ categories: [], loading: false, error: null, _unsub: null })
  useTransactionsStore.setState({ transactions: [], loading: false, error: null, _unsub: null })
})

describe("Transactions Page", () => {
  it("mounts and opens the add transaction dialog", async () => {
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText("Transactions")
    await user.click(screen.getByRole("button", { name: "Add Transaction" }))

    expect(await screen.findByLabelText("Amount")).toBeInTheDocument()
  })

  it("opens the CSV import dialog", async () => {
    const { user } = renderWithRouter(<Transactions />)

    await screen.findByText("Transactions")
    await user.click(screen.getByRole("button", { name: "Import CSV" }))

    expect(await screen.findByText("Click to upload a CSV file")).toBeInTheDocument()
  })
})

describe("TransactionFilters", () => {
  it("shows clear filters when active and calls onClear", async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionFilters
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        value={{ account: "all", category: "all", type: "all", dateFrom: "2026-05-01", dateTo: "" }}
        onChange={vi.fn()}
        onClear={onClear}
      />
    )

    const clearButton = screen.getByRole("button", { name: "Clear filters" })
    await user.click(clearButton)

    expect(onClear).toHaveBeenCalled()
  })

  it("notifies onChange when dates change", () => {
    const onChange = vi.fn()
    render(
      <TransactionFilters
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        value={{ account: "all", category: "all", type: "all", dateFrom: "2026-05-01", dateTo: "" }}
        onChange={onChange}
        onClear={vi.fn()}
      />
    )

    fireEvent.change(screen.getByDisplayValue("2026-05-01"), { target: { value: "2026-05-02" } })

    expect(onChange).toHaveBeenCalledWith({
      account: "all",
      category: "all",
      type: "all",
      dateFrom: "2026-05-02",
      dateTo: "",
    })
  })
})

describe("TransactionDialog", () => {
  it("disables save when required fields are missing", () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: "",
          categoryId: "",
          type: "expense",
          amount: "",
          date: "2026-05-01",
          description: "",
          toAccountId: "",
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Add Transaction" })).toBeDisabled()
  })

  it("disables save for transfers when toAccountId is missing", () => {
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: "acc-1",
          categoryId: "cat-1",
          type: "transfer",
          amount: "100",
          date: "2026-05-01",
          description: "",
          toAccountId: "",
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Add Transaction" })).toBeDisabled()
  })

  it("calls onSave when clicking Add Transaction", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: accountFixture.id,
          categoryId: categoryFixture.id,
          type: "expense",
          amount: "12.34",
          date: "2026-05-01",
          description: "Test",
          toAccountId: "",
        }}
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole("button", { name: "Add Transaction" }))

    expect(onSave).toHaveBeenCalled()
  })

  it("calls onSave with transfer data when clicking Add Transaction for transfer type", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionDialog
        open
        editing={false}
        form={{
          accountId: accountFixture.id,
          categoryId: categoryFixture.id,
          type: "transfer",
          amount: "12.34",
          date: "2026-05-01",
          description: "Transfer",
          toAccountId: "acc-2",
        }}
        accounts={[accountFixture, { ...accountFixture, id: "acc-2", name: "Savings" }]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFormChange={vi.fn()}
        onSave={onSave}
      />
    )

    await user.click(screen.getByRole("button", { name: "Add Transaction" }))

    expect(onSave).toHaveBeenCalled()
  })
})

describe("CsvImportDialog", () => {
  it("renders the upload step", () => {
    render(
      <CsvImportDialog
        open
        step="upload"
        headers={[]}
        rawRows={[]}
        mapping={{ date: "", description: "", amount: "", type: "" }}
        mappedRows={[]}
        accountId=""
        categoryId=""
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFileSelected={vi.fn()}
        onStepChange={vi.fn()}
        onMappingChange={vi.fn()}
        onMappedRowsChange={vi.fn()}
        onAccountChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onImport={vi.fn()}
      />
    )

    expect(screen.getByText("Click to upload a CSV file")).toBeInTheDocument()
  })

  it("maps rows and advances to preview", async () => {
    const onMappedRowsChange = vi.fn()
    const onStepChange = vi.fn()
    const user = userEvent.setup()

    render(
      <CsvImportDialog
        open
        step="map"
        headers={["Date", "Description", "Amount", "Type"]}
        rawRows={[{ Date: "2026-05-01", Description: "Coffee", Amount: "4.50", Type: "expense" }]}
        mapping={{ date: "Date", description: "Description", amount: "Amount", type: "Type" }}
        mappedRows={[]}
        accountId=""
        categoryId=""
        accounts={[accountFixture]}
        categories={[categoryFixture]}
        onOpenChange={vi.fn()}
        onFileSelected={vi.fn()}
        onStepChange={onStepChange}
        onMappingChange={vi.fn()}
        onMappedRowsChange={onMappedRowsChange}
        onAccountChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onImport={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Preview" }))

    expect(onMappedRowsChange).toHaveBeenCalledWith([
      {
        date: "2026-05-01",
        description: "Coffee",
        amount: "4.50",
        type: "expense",
      },
    ])
    expect(onStepChange).toHaveBeenCalledWith("preview")
  })
})
