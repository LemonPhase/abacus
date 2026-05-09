import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

import Sidebar from "@/components/layout/Sidebar"
import MobileNav from "@/components/layout/MobileNav"

function renderWithRouter(ui: React.ReactElement, { route = "/" } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

describe("Sidebar", () => {
  it("renders brand name and all nav links", () => {
    renderWithRouter(<Sidebar />)
    expect(screen.getByText("Abacus")).toBeInTheDocument()
    expect(screen.getByText("Dashboard")).toBeInTheDocument()
    expect(screen.getByText("Accounts")).toBeInTheDocument()
    expect(screen.getByText("Transactions")).toBeInTheDocument()
    expect(screen.getByText("Budgets")).toBeInTheDocument()
    expect(screen.getByText("Reports")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })
})

describe("MobileNav", () => {
  it("renders all nav links with short labels", () => {
    renderWithRouter(<MobileNav />)
    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Accounts")).toBeInTheDocument()
    expect(screen.getByText("Txns")).toBeInTheDocument()
    expect(screen.getByText("Budgets")).toBeInTheDocument()
    expect(screen.getByText("Reports")).toBeInTheDocument()
    expect(screen.getByText("Settings")).toBeInTheDocument()
  })
})
