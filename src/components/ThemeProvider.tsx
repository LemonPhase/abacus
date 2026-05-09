import { useEffect, useSyncExternalStore } from "react"
import { useSettingsStore } from "@/stores/settingsStore"

function resolveTheme(theme: string) {
  if (theme === "dark") return "dark"
  if (theme === "light") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function themeSnapshot() {
  return useSettingsStore.getState().theme
}

function subscribeToTheme(cb: () => void) {
  return useSettingsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) cb()
  })
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, themeSnapshot)

  useEffect(() => {
    const resolved = resolveTheme(theme)
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  return <>{children}</>
}
