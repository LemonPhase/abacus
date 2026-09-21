import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '@/stores/settingsStore'

describe('settingsStore AI settings', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.getState().reset()
  })

  it('has AI defaults', () => {
    const state = useSettingsStore.getState()
    expect(state.aiModel).toBe('gpt-4o-mini')
    expect(state.aiBaseUrl).toBe('')
    expect(state.aiApiKey).toBeUndefined()
  })

  it('persists setAiSettings to localStorage', () => {
    useSettingsStore.getState().setAiSettings({ aiApiKey: 'sk-abc', aiBaseUrl: 'https://x/v1' })

    const state = useSettingsStore.getState()
    expect(state.aiApiKey).toBe('sk-abc')
    expect(state.aiBaseUrl).toBe('https://x/v1')
    expect(state.aiModel).toBe('gpt-4o-mini') // untouched default survives

    const raw = JSON.parse(localStorage.getItem('abacus-settings') ?? '{}')
    expect(raw.aiApiKey).toBe('sk-abc')
  })

  it('reload merges stored AI settings with defaults', () => {
    useSettingsStore.getState().setAiSettings({ aiApiKey: 'sk-abc' })
    useSettingsStore.getState().load()
    expect(useSettingsStore.getState().aiApiKey).toBe('sk-abc')
  })

  it('reset clears AI settings', () => {
    useSettingsStore.getState().setAiSettings({ aiApiKey: 'sk-abc' })
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().aiApiKey).toBeUndefined()
    const raw = JSON.parse(localStorage.getItem('abacus-settings') ?? '{}')
    expect(raw.aiApiKey).toBeUndefined()
  })

  it('setAiSettings accepts a partial patch with a model override', () => {
    useSettingsStore.getState().setAiSettings({ aiModel: 'llama3' })
    expect(useSettingsStore.getState().aiModel).toBe('llama3')
  })
})
