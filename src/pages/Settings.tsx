import { useState } from 'react'
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
import { useAuth } from '@/auth/auth'
import { supabase } from '@/supabase/client'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'CAD', 'AUD', 'CHF', 'INR', 'BRL']

// Table names as used in Supabase (snake_case)
const TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'exchange_rates',
  'investment_plans',
] as const

export default function Settings() {
  const { baseCurrency, theme, setBaseCurrency, setTheme } = useSettingsStore()
  const { user, signOut } = useAuth()
  const [importDialog, setImportDialog] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importMsg, setImportMsg] = useState('')

  async function handleExport() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {
      version: 2,
      exportedAt: new Date().toISOString(),
    }

    for (const table of TABLES) {
      const { data: rows, error } = await supabase.from(table).select('*')
      if (error) throw error
      data[table] = rows ?? []
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `abacus-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    try {
      setImportStatus('idle')
      const text = await file.text()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(text) as Record<string, any>

      if (!data.accounts || !data.transactions) {
        throw new Error('Invalid export format')
      }

      // Delete all existing rows from each table
      for (const table of TABLES) {
        const { error } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
        if (error) throw error
      }

      // Import data from each table
      for (const table of TABLES) {
        const rows = data[table]
        if (rows?.length) {
          const { error } = await supabase.from(table).insert(rows)
          if (error) throw error
        }
      }

      await Promise.all([
        useAccountsStore.getState().load(),
        useCategoriesStore.getState().load(),
        useTransactionsStore.getState().load(),
        useBudgetsStore.getState().load(),
        useInvestmentPlansStore.getState().load(),
      ])
      setImportStatus('success')
      setImportMsg(
        `Imported ${data.accounts?.length ?? 0} accounts, ${data.transactions?.length ?? 0} transactions.`,
      )
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
            All reports and summaries will use this currency.
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
        </div>

        {/* Account */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <Button variant="outline" size="sm" onClick={() => signOut()}>
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
              <p className="text-emerald-600 font-medium">Import successful</p>
              <p className="text-sm text-muted-foreground mt-1">{importMsg}</p>
              <Button className="mt-4" onClick={() => setImportDialog(false)}>
                Done
              </Button>
            </div>
          )}
          {importStatus === 'error' && (
            <div className="py-4 text-center">
              <p className="text-rose-600 font-medium">Import failed</p>
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
