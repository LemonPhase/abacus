import { describe, it, expect, vi, beforeEach } from "vitest"
import { useAccountsStore } from "@/stores/accountsStore"
import { supabase } from "@/supabase/client"

describe("Store Error Handling", () => {
  const originalFrom = supabase.from;

  beforeEach(() => {
    supabase.from = originalFrom;
    useAccountsStore.setState({ error: null })
  })

  it("sets error on load failure", async () => {
    // Override from to return an error
    supabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: "Test load error" } })
    })

    const store = useAccountsStore.getState()
    await expect(store.load()).rejects.toThrow()
    
    expect(useAccountsStore.getState().error).toBe("Test load error")
  })

  it("clears error with clearError()", () => {
    useAccountsStore.setState({ error: "Some error" })
    expect(useAccountsStore.getState().error).toBe("Some error")
    
    useAccountsStore.getState().clearError()
    expect(useAccountsStore.getState().error).toBeNull()
  })

  it("clears error before adding", async () => {
    useAccountsStore.setState({ error: "Previous error" })
    
    // Override from to return an error
    supabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "Add failed" } })
        })
      })
    })

    const store = useAccountsStore.getState()
    await expect(store.add({ name: "A", type: "checking", currency: "USD", balance: 0 })).rejects.toThrow()
    
    expect(useAccountsStore.getState().error).toBe("Add failed")
  })
})
