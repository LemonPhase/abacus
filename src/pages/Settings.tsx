import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Download, Upload, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import { useAuth } from '@/auth/auth'
import { restoreUserData, currentUserId } from '@/services/restore'
import { exportAllData } from '@/services/export'
import CategoriesView from '@/pages/categories/CategoriesView'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'BRL']

export default function Settings() {
  const { pathname } = useLocation()
  const categoriesRef = useRef<HTMLDivElement>(null)
  const baseCurrency = useSettingsStore((s) => s.baseCurrency)
  const theme = useSettingsStore((s) => s.theme)
  const setBaseCurrency = useSettingsStore((s) => s.setBaseCurrency)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const { user, signOut } = useAuth()
  const [importDialog, setImportDialog] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importMsg, setImportMsg] = useState('')
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    if (pathname === '/app/categories') {
      categoriesRef.current?.scrollIntoView({ block: 'start' })
    }
  }, [pathname])

  async function handleExport() {
    try {
      setExportStatus('idle')
      setExportMsg('')

      // One service call: pages through every table (bounded by the API's
      // max_rows per request), aborts on identity change or any partial read
      // failure, and returns the v3 payload the restore path accepts.
      const data = await exportAllData()

      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `abacus-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportStatus('success')
      setExportMsg('Data exported successfully')
    } catch (e) {
      setExportStatus('error')
      setExportMsg(e instanceof Error ? e.message : 'Export failed')
    }
  }

  async function handleImport(file: File) {
    const abort = () => new Error('Signed-in user changed; import aborted')
    try {
      setImportStatus('idle')
      setImportMsg('')

      // One service call: validates the whole payload, then restores it in a
      // single database transaction (restore_user_data RPC) that rolls back
      // entirely on any error. Identity is captured once at the start and
      // re-verified inside the service after every await and before the RPC.
      const result = await restoreUserData(file)

      await Promise.all([
        useAccountsStore.getState().load(),
        useCategoriesStore.getState().load(),
        useTransactionsStore.getState().load(),
        useBudgetsStore.getState().load(),
        useInvestmentPlansStore.getState().load(),
        useRecurringTransactionsStore.getState().load(),
      ])
      if ((await currentUserId()) !== result.restoredFor) throw abort()
      setImportStatus('success')
      setImportMsg(`Imported ${result.accounts} accounts, ${result.transactions} transactions.`)
    } catch (e) {
      setImportStatus('error')
      setImportMsg(e instanceof Error ? e.message : 'Failed to import')
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
          <p className="text-sm text-muted-foreground">
            All reports and summaries will use this currency. Transactions keep the exchange rate
            they were saved with; totals include only amounts already converted to this currency.
          </p>
          <Select
            value={baseCurrency}
            onValueChange={(v: string | null) => setBaseCurrency(v ?? 'USD')}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Theme */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Theme</h2>
          <p className="text-sm text-muted-foreground">Choose your preferred appearance.</p>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <Button
                key={t}
                variant={theme === t ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme(t)}
                className="gap-2"
              >
                {t === 'light' ? (
                  <Sun className="size-4" />
                ) : t === 'dark' ? (
                  <Moon className="size-4" />
                ) : (
                  <Monitor className="size-4" />
                )}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div ref={categoriesRef} id="categories" className="scroll-mt-20">
          <CategoriesView />
        </div>

        {/* Data Management */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Data Management</h2>
          <p className="text-sm text-muted-foreground">
            Export or import your financial data as JSON.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Export Data
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialog(true)
                setImportStatus('idle')
              }}
            >
              <Upload className="size-4" />
              Import Data
            </Button>
          </div>
          {exportStatus === 'success' && <p className="text-xs text-jade">{exportMsg}</p>}
          {exportStatus === 'error' && <p className="text-xs text-cinnabar">{exportMsg}</p>}
        </div>

        {/* Account */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void signOut().catch((e: Error) => console.error('Sign-out failed:', e.message))
            }
          >
            Sign Out
          </Button>
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
          {importStatus === 'idle' && (
            <div className="py-4">
              <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors">
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select a JSON export file</p>
                <p className="text-xs text-muted-foreground">
                  This will replace all existing data.
                </p>
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
          {importStatus === 'success' && (
            <div className="py-4 text-center">
              <p className="text-jade font-medium">Import successful</p>
              <p className="text-sm text-muted-foreground mt-1">{importMsg}</p>
              <Button className="mt-4" onClick={() => setImportDialog(false)}>
                Done
              </Button>
            </div>
          )}
          {importStatus === 'error' && (
            <div className="py-4 text-center">
              <p className="text-cinnabar font-medium">Import failed</p>
              <p className="text-sm text-muted-foreground mt-1">{importMsg}</p>
              <div className="flex gap-2 justify-center mt-4">
                <Button variant="outline" onClick={() => setImportDialog(false)}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => setImportStatus('idle')}>
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
