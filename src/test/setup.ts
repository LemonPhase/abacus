import { beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { mockSupabase, resetAllTables } from './supabase-mock'

vi.mock('@/supabase/client', () => ({
  supabase: mockSupabase,
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

beforeEach(() => {
  resetAllTables()
  vi.clearAllMocks()
})
