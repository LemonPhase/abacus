import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import ThemeProvider from '@/components/providers/ThemeProvider'
import { useSettingsStore } from '@/stores/settingsStore'

describe('ThemeProvider', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'system' })
    document.documentElement.classList.remove('dark')
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  function renderProvider() {
    return render(
      <ThemeProvider>
        <div data-testid="child">Hello</div>
      </ThemeProvider>,
    )
  }

  it('renders children', () => {
    useSettingsStore.setState({ theme: 'light' })
    const { container } = renderProvider()
    expect(container.textContent).toBe('Hello')
  })

  it('adds dark class when theme is dark', () => {
    useSettingsStore.setState({ theme: 'dark' })
    renderProvider()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class when theme is light', () => {
    document.documentElement.classList.add('dark')
    useSettingsStore.setState({ theme: 'light' })
    renderProvider()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('uses matchMedia when theme is system', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    useSettingsStore.setState({ theme: 'system' })
    renderProvider()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
