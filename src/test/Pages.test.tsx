import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { getTable } from "@/test/supabase-mock"
import Accounts from "@/pages/Accounts"
import Categories from "@/pages/Categories"
import Transactions from "@/pages/Transactions"
import Budgets from "@/pages/Budgets"

function renderWithRouter(ui: React.ReactElement) {
  return {
    user: userEvent.setup(),
    ...render(<MemoryRouter>{ui}</MemoryRouter>),
  }
}

function seedAccount() {
  getTable("accounts").push({
    id: "acc-test",
    name: "Test Account",
    type: "checking",
    currency: "USD",
    balance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

function seedCategory() {
  getTable("categories").push({
    id: "cat-test",
    name: "Test Category",
    type: "expense",
    color: "#ff0000",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

describe("Accounts Page", () => {
  it("shows empty state when no accounts", async () => {
    renderWithRouter(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText("No accounts yet")).toBeInTheDocument()
    })
  })

  it("has an add account button", async () => {
    renderWithRouter(<Accounts />)
    await waitFor(() => {
      const buttons = screen.getAllByText("Add Account")
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it("opens dialog when add account header button is clicked", async () => {
    const { user } = renderWithRouter(<Accounts />)
    await waitFor(() => {
      expect(screen.getByText("No accounts yet")).toBeInTheDocument()
    })
    const addBtn = screen.getByRole("button", { name: /add account/i })
    await user.click(addBtn)
    await waitFor(() => {
      const titles = screen.getAllByText("Add Account")
      expect(titles.length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe("Categories Page", () => {
  it("shows expense and income tabs", async () => {
    renderWithRouter(<Categories />)
    await waitFor(() => {
      expect(screen.getByText("Expenses")).toBeInTheDocument()
      expect(screen.getByText("Income")).toBeInTheDocument()
    })
  })

  it("has an add category button", async () => {
    renderWithRouter(<Categories />)
    await waitFor(() => {
      expect(screen.getByText("Add Category")).toBeInTheDocument()
    })
  })
})

describe("Transactions Page", () => {
  beforeEach(() => {
    seedAccount()
    seedCategory()
  })

  it("shows empty state when no transactions", async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText("No transactions yet")).toBeInTheDocument()
    })
  })

  it("has add transaction and import buttons", async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText("Add Transaction")).toBeInTheDocument()
      expect(screen.getByText("Import CSV")).toBeInTheDocument()
    })
  })

  it("shows filter controls", async () => {
    renderWithRouter(<Transactions />)
    await waitFor(() => {
      expect(screen.getByText("Account")).toBeInTheDocument()
      expect(screen.getByText("Category")).toBeInTheDocument()
      expect(screen.getByText("Type")).toBeInTheDocument()
    })
  })
})

describe("Budgets Page", () => {
  it("shows empty state when no budgets", async () => {
    renderWithRouter(<Budgets />)
    await waitFor(() => {
      expect(screen.getByText("No budgets yet")).toBeInTheDocument()
    })
  })

  it("has an add budget button", async () => {
    renderWithRouter(<Budgets />)
    await waitFor(() => {
      expect(screen.getByText("Add Budget")).toBeInTheDocument()
    })
  })
})
