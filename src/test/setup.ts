import { beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"
import { mockSupabase, resetAllTables } from "./supabase-mock"

vi.mock("@/supabase/client", () => ({
  supabase: mockSupabase,
}))

beforeEach(() => {
  resetAllTables()
  vi.clearAllMocks()
})
