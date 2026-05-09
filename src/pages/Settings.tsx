import { useState } from "react"
import { Download, Upload, Sun, Moon, Monitor, RefreshCw, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useSettingsStore } from "@/stores/settingsStore"
import { db } from "@/db"
import { loadSyncConfig, saveSyncConfig, writeToSyncHandle, pickSyncLocation, syncFromFile, downloadSyncFile, type SyncConfig } from "@/lib/sync"

const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "JPY", "CAD", "AUD", "CHF", "INR", "BRL"]

export default function Settings() {
  const { baseCurrency, theme, setBaseCurrency, setTheme } = useSettingsStore()
  const [importDialog, setImportDialog] = useState(false)
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle")
  const [importMsg, setImportMsg] = useState("")
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(loadSyncConfig)
  const [syncPassphrase, setSyncPassphrase] = useState(syncConfig.passphrase)
  const [syncStatus, setSyncStatus] = useState("")

  async function handleExport() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      budgets: await db.budgets.toArray(),
      exchangeRates: await db.exchangeRates.toArray(),
      investmentPlans: await db.investmentPlans.toArray(),
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `abacus-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    try {
      setImportStatus("idle")
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.version || !data.accounts || !data.transactions) {
        throw new Error("Invalid export format")
      }

      // Clear existing data
      await db.accounts.clear()
      await db.categories.clear()
      await db.transactions.clear()
      await db.budgets.clear()
      await db.exchangeRates.clear()
      await db.investmentPlans.clear()

      // Import
      if (data.accounts.length) await db.accounts.bulkAdd(data.accounts)
      if (data.categories?.length) await db.categories.bulkAdd(data.categories)
      if (data.transactions.length) await db.transactions.bulkAdd(data.transactions)
      if (data.budgets?.length) await db.budgets.bulkAdd(data.budgets)
      if (data.exchangeRates?.length) await db.exchangeRates.bulkAdd(data.exchangeRates)
      if (data.investmentPlans?.length) await db.investmentPlans.bulkAdd(data.investmentPlans)

      setImportStatus("success")
      setImportMsg(`Imported ${data.accounts.length} accounts, ${data.transactions.length} transactions.`)
    } catch (e) {
      setImportStatus("error")
      setImportMsg(e instanceof Error ? e.message : "Failed to import")
    }
  }

  function handleSyncToggle(enabled: boolean) {
    const config = loadSyncConfig()
    config.enabled = enabled
    if (enabled) config.passphrase = syncPassphrase
    saveSyncConfig(config)
    setSyncConfig(config)
    if (!enabled) setSyncStatus("Auto-sync disabled")
  }

  async function handleSetSyncLocation() {
    setSyncStatus("Picking location...")
    const result = await pickSyncLocation(setSyncStatus)
    setSyncStatus(result.message)
    if (result.success) {
      setSyncConfig(loadSyncConfig())
    }
  }

  async function handleSyncNow() {
    setSyncStatus("Syncing...")
    const result = await writeToSyncHandle(syncPassphrase, setSyncStatus)
    setSyncStatus(result.message)
  }

  async function handleSyncExport() {
    setSyncStatus("Downloading...")
    const result = await downloadSyncFile(syncPassphrase, setSyncStatus)
    setSyncStatus(result.message)
  }

  async function handleSyncImport() {
    setSyncStatus("Importing...")
    const result = await syncFromFile(syncPassphrase, setSyncStatus)
    setSyncStatus(result.message)
    if (result.success) {
      setTimeout(() => window.location.reload(), 500)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure your preferences.</p>
      </div>

      <div className="grid gap-6 max-w-xl">
        {/* Base Currency */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Base Currency</h2>
          <p className="text-sm text-muted-foreground">All reports and summaries will use this currency.</p>
          <Select value={baseCurrency} onValueChange={(v: string | null) => setBaseCurrency(v ?? "USD")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Theme */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Theme</h2>
          <p className="text-sm text-muted-foreground">Choose your preferred appearance.</p>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <Button
                key={t}
                variant={theme === t ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme(t)}
                className="gap-2"
              >
                {t === "light" ? <Sun className="size-4" /> : t === "dark" ? <Moon className="size-4" /> : <Monitor className="size-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Data Management */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Data Management</h2>
          <p className="text-sm text-muted-foreground">Export or import your financial data as JSON.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Export Data
            </Button>
            <Button variant="outline" onClick={() => { setImportDialog(true); setImportStatus("idle") }}>
              <Upload className="size-4" />
              Import Data
            </Button>
          </div>
        </div>

        {/* Cross-Device Sync */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <RefreshCw className="size-4" />
            Cross-Device Sync
          </h2>
          <p className="text-sm text-muted-foreground">
            Pick a sync file in your cloud drive folder (Dropbox, iCloud, Google Drive). Changes auto-sync to it. On another device, import from the same file.
          </p>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Auto-sync on changes</Label>
              <button
                type="button"
                role="switch"
                aria-checked={syncConfig.enabled}
                onClick={() => handleSyncToggle(!syncConfig.enabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${syncConfig.enabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block size-3.5 rounded-full bg-background transition-transform ${syncConfig.enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sync-passphrase" className="flex items-center gap-1.5">
                <Shield className="size-3" />
                Encryption Passphrase
              </Label>
              <Input
                id="sync-passphrase"
                type="password"
                value={syncPassphrase}
                onChange={(e) => setSyncPassphrase(e.target.value)}
                placeholder="Same passphrase on all devices"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">AES-256-GCM encrypted. Your data never leaves your device unencrypted.</p>
            </div>

            {syncConfig.fileName && (
              <p className="text-xs text-muted-foreground">
                Sync file: <span className="font-medium">{syncConfig.fileName}</span>
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleSetSyncLocation}>
                <RefreshCw className="size-3.5" />
                Set Sync Location
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={!syncPassphrase}>
                <Upload className="size-3.5" />
                Sync Now
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncImport} disabled={!syncPassphrase}>
                <Download className="size-3.5" />
                Import Sync
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSyncExport} disabled={!syncPassphrase}>
                Download .enc
              </Button>
            </div>

            {syncStatus && (
              <p className={`text-xs ${syncStatus.toLowerCase().includes("fail") || syncStatus.toLowerCase().includes("wrong") || syncStatus.toLowerCase().includes("cancel") ? "text-rose-600" : syncStatus.toLowerCase().includes("sync") || syncStatus.toLowerCase().includes("complete") || syncStatus.toLowerCase().includes("import") ? "text-emerald-600" : "text-muted-foreground"}`}>
                {syncStatus}
              </p>
            )}

            {syncConfig.lastSyncedAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(syncConfig.lastSyncedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* About */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">About Abacus</h2>
          <p className="text-sm text-muted-foreground">Personal Finance Tracker v0.1.0</p>
        </div>
      </div>

      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Data</DialogTitle>
          </DialogHeader>
          {importStatus === "idle" && (
            <div className="py-4">
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select a JSON export file</p>
                <p className="text-xs text-muted-foreground">This will replace all existing data.</p>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImport(file)
                  }}
                />
              </label>
            </div>
          )}
          {importStatus === "success" && (
            <div className="py-4 text-center">
              <p className="text-emerald-600 font-medium">Import successful</p>
              <p className="text-sm text-muted-foreground mt-1">{importMsg}</p>
              <Button className="mt-4" onClick={() => setImportDialog(false)}>Done</Button>
            </div>
          )}
          {importStatus === "error" && (
            <div className="py-4 text-center">
              <p className="text-rose-600 font-medium">Import failed</p>
              <p className="text-sm text-muted-foreground mt-1">{importMsg}</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => setImportDialog(false)}>Cancel</Button>
                <Button variant="outline" onClick={() => setImportStatus("idle")}>Try Again</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
