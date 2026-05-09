import { beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"
import { mockSupabase, resetAllTables } from "./supabase-mock"

vi.mock("@/supabase/client", () => ({
  supabase: mockSupabase,
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

beforeEach(() => {
  resetAllTables()
  vi.clearAllMocks()
})
