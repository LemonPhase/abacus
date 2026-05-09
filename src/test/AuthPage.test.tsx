import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { AuthProvider } from "@/supabase/auth"
import { mockSupabase } from "@/test/supabase-mock"
import Auth from "@/pages/Auth"

beforeEach(() => {
  vi.clearAllMocks()
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
})

function renderAuthPage() {
  return {
    user: userEvent.setup(),
    ...render(
      <MemoryRouter initialEntries={["/auth"]}>
        <AuthProvider>
          <Auth />
        </AuthProvider>
      </MemoryRouter>,
    ),
  }
}

describe("Auth Page", () => {
  it("renders login form by default", async () => {
    renderAuthPage()
    await waitFor(() => {
      expect(screen.getByText("Sign in to your account")).toBeInTheDocument()
      expect(screen.getByLabelText("Email")).toBeInTheDocument()
      expect(screen.getByLabelText("Password")).toBeInTheDocument()
    })
  })

  it("toggles to sign up mode", async () => {
    const { user } = renderAuthPage()
    await waitFor(() => {
      expect(screen.getByText("Sign in to your account")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Sign up" }))
    expect(screen.getByText("Create a new account")).toBeInTheDocument()

    // Toggle back
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument()
  })

  it("calls signInWithPassword on submit", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.com" }, session: {} },
      error: null,
    })

    const { user } = renderAuthPage()
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText("Email"), "a@b.com")
    await user.type(screen.getByLabelText("Password"), "pass123")
    await user.click(screen.getByRole("button", { name: "Sign In" }))

    await waitFor(() => {
      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "a@b.com",
        password: "pass123",
      })
    })
  })

  it("shows error message on failed login", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "Invalid login credentials" },
    })

    const { user } = renderAuthPage()
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText("Email"), "bad@b.com")
    await user.type(screen.getByLabelText("Password"), "wrong")
    await user.click(screen.getByRole("button", { name: "Sign In" }))

    await waitFor(() => {
      expect(screen.getByText("Invalid login credentials")).toBeInTheDocument()
    })
  })

  it("calls signUp on sign up mode submit", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "new@b.com" }, session: null },
      error: null,
    })

    const { user } = renderAuthPage()
    await waitFor(() => {
      expect(screen.getByText("Sign in to your account")).toBeInTheDocument()
    })

    await user.click(screen.getByRole("button", { name: "Sign up" }))
    await user.type(screen.getByLabelText("Email"), "new@b.com")
    await user.type(screen.getByLabelText("Password"), "pass123")
    await user.click(screen.getByRole("button", { name: "Sign Up" }))

    await waitFor(() => {
      expect(mockSupabase.auth.signUp).toHaveBeenCalledWith({
        email: "new@b.com",
        password: "pass123",
      })
    })
  })
})
