import { create } from "zustand"
import type { UserSettings, ThemeMode } from "@/types"

const SETTINGS_KEY = "abacus-settings"

const defaultSettings: UserSettings = {
  baseCurrency: "USD",
  theme: "system",
  onboarded: false,
}

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) }
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaultSettings }
}

function saveSettings(settings: UserSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

interface SettingsState extends UserSettings {
  load: () => void
  setBaseCurrency: (currency: string) => void
  setTheme: (theme: ThemeMode) => void
  setOnboarded: (value: boolean) => void
  reset: () => void
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...loadSettings(),

  load: () => {
    const settings = loadSettings()
    set(settings)
  },

  setBaseCurrency: (currency) => {
    const updated = { ...get(), baseCurrency: currency }
    saveSettings(updated)
    set({ baseCurrency: currency })
  },

  setTheme: (theme) => {
    const updated = { ...get(), theme }
    saveSettings(updated)
    set({ theme })
  },

  setOnboarded: (value) => {
    const updated = { ...get(), onboarded: value }
    saveSettings(updated)
    set({ onboarded: value })
  },

  reset: () => {
    saveSettings(defaultSettings)
    set(defaultSettings)
  },
}))
