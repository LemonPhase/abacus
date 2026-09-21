import { useEffect, useState } from 'react'
import { FileText, KeyRound, Loader2, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Account } from '@/types'

interface UploadStepProps {
  accounts: Account[]
  hasKey: boolean
  file: File | null
  onFile: (file: File | null) => void
  accountId: string
  onAccountChange: (id: string) => void
  onProcess: () => void
  error: string | null
}

export function UploadStep({
  accounts,
  hasKey,
  file,
  onFile,
  accountId,
  onAccountChange,
  onProcess,
  error,
}: UploadStepProps) {
  const navigate = useNavigate()
  const [dragActive, setDragActive] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)

  // Dropping outside the dropzone must not make the browser open the PDF.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setDragError(null)
      onFile(file)
    } else {
      setDragError('Only PDF files are supported')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Statement PDF</h1>
        <p className="text-muted-foreground">
          Upload a bank statement PDF, review the extracted transactions, then import them.
        </p>
      </div>

      {!hasKey && (
        <div className="rounded-xl border border-border/30 bg-card text-card-foreground p-card space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <KeyRound className="size-4" />
            AI extraction not configured
          </h2>
          <p className="text-sm text-muted-foreground">
            This feature needs an OpenAI-compatible API key to read the statement.
          </p>
          <Button variant="outline" onClick={() => navigate('/app/settings')}>
            Open Settings
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border/30 bg-card text-card-foreground p-card space-y-4">
        <h2 className="font-semibold">Statement</h2>
        <label
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary/60 bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(e) => {
            // Child elements fire dragleave — only clear when actually leaving the box.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false)
          }}
          onDrop={handleDrop}
        >
          <FileText className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {file ? file.name : 'Click to select or drag & drop a bank statement PDF'}
          </p>
          <p className="text-xs text-muted-foreground">PDF only, up to 40 pages</p>
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            data-testid="statement-file-input"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {dragError && <p className="text-sm text-cinnabar">{dragError}</p>}

        <div className="space-y-2">
          <p className="text-sm font-medium">Account</p>
          <Select
            value={accountId || null}
            onValueChange={(v: string | null) => onAccountChange(v ?? '')}
            items={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
          >
            <SelectTrigger className="w-64" data-testid="account-select">
              <SelectValue placeholder="Choose the account for this statement" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          One-time note: the statement text is sent to the AI endpoint configured in Settings. The
          PDF itself is never stored.
        </p>

        {error && <p className="text-sm text-cinnabar">{error}</p>}

        <Button onClick={onProcess} disabled={!file || !accountId || !hasKey}>
          <Upload className="size-4" />
          Process statement
        </Button>
      </div>

      {file && !hasKey && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Waiting for an API key — set one in Settings to continue.
        </p>
      )}
    </div>
  )
}
