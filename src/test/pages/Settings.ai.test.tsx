import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Settings from '@/pages/Settings'
import { useSettingsStore } from '@/stores/settingsStore'

const testAiConnection = vi.fn<(s: unknown) => Promise<string | null>>()

vi.mock('@/services/llm', () => ({
  testAiConnection: (s: unknown) => testAiConnection(s),
}))

vi.mock('@/auth/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/auth/auth')
  return {
    ...actual,
    useAuth: () => ({ user: { email: 'test@example.com' }, signOut: vi.fn() }),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  )
}

describe('Settings AI extraction card', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
    testAiConnection.mockReset()
  })

  it('saves AI fields to the settings store on blur', async () => {
    const user = userEvent.setup()
    renderPage()

    const key = screen.getByTestId('ai-api-key')
    await user.type(key, 'sk-test-123')
    key.blur()

    expect(useSettingsStore.getState().aiApiKey).toBe('sk-test-123')
    expect(JSON.parse(localStorage.getItem('abacus-settings') ?? '{}').aiApiKey).toBe('sk-test-123')
  })

  it('test connection saves the draft first and reports success', async () => {
    testAiConnection.mockResolvedValue(null)
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByTestId('ai-api-key'), 'sk-test-123')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText('Connection OK')).toBeInTheDocument()
    expect(testAiConnection).toHaveBeenCalledWith(
      expect.objectContaining({ aiApiKey: 'sk-test-123' }),
    )
    // Saving before testing means the key persists even if the user leaves.
    expect(useSettingsStore.getState().aiApiKey).toBe('sk-test-123')
  })

  it('test connection reports the failure message', async () => {
    testAiConnection.mockResolvedValue('Invalid API key — check the AI settings.')
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByTestId('ai-api-key'), 'sk-bad')
    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    expect(await screen.findByText(/Invalid API key/)).toBeInTheDocument()
    expect(screen.queryByText('Connection OK')).not.toBeInTheDocument()
  })
})
