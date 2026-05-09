import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { db } from "@/db"
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

async function clearDB() {
  await db.accounts.clear()
  await db.categories.clear()
  await db.transactions.clear()
  await db.budgets.clear()
  await db.exchangeRates.clear()
}

describe("Accounts Page", () => {
  beforeEach(async () => {
    await clearDB()
  })

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
    // Click the header button (the one with the Plus icon, not inside dialog)
    const addBtn = screen.getByRole("button", { name: /add account/i })
    await user.click(addBtn)
    await waitFor(() => {
      // Dialog should have the title "Add Account"
      const titles = screen.getAllByText("Add Account")
      expect(titles.length).toBeGreaterThanOrEqual(2) // at least the button and dialog title
    })
  })
})

describe("Categories Page", () => {
  beforeEach(async () => {
    await clearDB()
  })

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
  beforeEach(async () => {
    await clearDB()
    // Seed required data
    await db.accounts.add({
      id: "acc-test",
      name: "Test Account",
      type: "checking",
      currency: "USD",
      balance: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.categories.add({
      id: "cat-test",
      name: "Test Category",
      type: "expense",
      color: "#ff0000",
    })
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
  beforeEach(async () => {
    await clearDB()
  })

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
