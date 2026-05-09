import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Investments from "@/pages/Investments"
import { useInvestmentPlansStore } from "@/stores/investmentPlansStore"
import { useSettingsStore } from "@/stores/settingsStore"

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.getState().reset()
  useInvestmentPlansStore.setState({ plans: [], loading: false, error: null, _unsub: null })
})

describe("Investments Page", () => {
  it("renders the page header and action", () => {
    renderWithRouter(<Investments />)

    expect(screen.getByText("Investments")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add Investment" })).toBeInTheDocument()
  })

  it("shows empty state when there are no plans", async () => {
    renderWithRouter(<Investments />)

    await waitFor(() => {
      expect(screen.getByText("No investment plans yet")).toBeInTheDocument()
      expect(screen.getByText("Add investments to see compound growth projections.")).toBeInTheDocument()
    })
  })

  it("loads investment plans on mount", async () => {
    const loadPlans = vi.spyOn(useInvestmentPlansStore.getState(), "load").mockResolvedValue()

    renderWithRouter(<Investments />)

    await waitFor(() => {
      expect(loadPlans).toHaveBeenCalled()
    })

    loadPlans.mockRestore()
  })
})
