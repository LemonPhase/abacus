import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import Settings from "@/pages/Settings"

// Mock the Auth context
vi.mock("@/supabase/auth", async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    useAuth: () => ({ user: { email: "test@example.com" }, signOut: vi.fn() }),
  }
})

describe("Settings Page", () => {
  it("renders correctly", () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(screen.getByText("Settings")).toBeInTheDocument()
    expect(screen.getByText("Base Currency")).toBeInTheDocument()
    expect(screen.getByText("Theme")).toBeInTheDocument()
    expect(screen.getByText("Data Management")).toBeInTheDocument()
    expect(screen.getByText("test@example.com")).toBeInTheDocument()
  })

  it("opens import dialog", async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Settings /></MemoryRouter>)
    
    await user.click(screen.getByText("Import Data"))
    expect(screen.getByText("Click to select a JSON export file")).toBeInTheDocument()
  })
})
