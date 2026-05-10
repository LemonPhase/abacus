import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { applyMapping, type ColumnMapping } from '@/lib/csv'
import type { Account, Category } from '@/types'

type CsvStep = 'upload' | 'map' | 'preview'

export interface CsvMappedRow {
  date: string
  description: string
  amount: string
  type?: 'income' | 'expense'
}

interface CsvImportDialogProps {
  open: boolean
  step: CsvStep
  headers: string[]
  rawRows: Record<string, string>[]
  mapping: ColumnMapping
  mappedRows: CsvMappedRow[]
  accountId: string
  categoryId: string
  accounts: Account[]
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onFileSelected: (file: File) => void
  onStepChange: (step: CsvStep) => void
  onMappingChange: (mapping: ColumnMapping) => void
  onMappedRowsChange: (rows: CsvMappedRow[]) => void
  onAccountChange: (accountId: string) => void
  onCategoryChange: (categoryId: string) => void
  onImport: () => void
}

export function CsvImportDialog({
  open,
  step,
  headers,
  rawRows,
  mapping,
  mappedRows,
  accountId,
  categoryId,
  accounts,
  categories,
  onOpenChange,
  onFileSelected,
  onStepChange,
  onMappingChange,
  onMappedRowsChange,
  onAccountChange,
  onCategoryChange,
  onImport,
}: CsvImportDialogProps) {
  function handleRemap() {
    const mapped = applyMapping(rawRows, mapping)
    onMappedRowsChange(mapped)
    onStepChange('preview')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import CSV'}
            {step === 'map' && 'Map Columns'}
            {step === 'preview' && 'Preview Import'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-8">
            <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 p-8 cursor-pointer hover:border-muted-foreground/50 transition-colors">
              <Upload className="size-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bank exports, spreadsheets, etc.
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onFileSelected(file)
                }}
              />
            </label>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Match CSV columns to transaction fields. Auto-detected where possible.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date column</Label>
                <Select
                  value={mapping.date}
                  onValueChange={(v: string | null) =>
                    onMappingChange({ ...mapping, date: v ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Amount column</Label>
                <Select
                  value={mapping.amount}
                  onValueChange={(v: string | null) =>
                    onMappingChange({ ...mapping, amount: v ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Description column</Label>
                <Select
                  value={mapping.description}
                  onValueChange={(v: string | null) =>
                    onMappingChange({ ...mapping, description: v ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Type column (optional)</Label>
                <Select
                  value={mapping.type}
                  onValueChange={(v: string | null) =>
                    onMappingChange({ ...mapping, type: v ?? '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auto-detect" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Auto-detect</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onStepChange('upload')}>
                Back
              </Button>
              <Button onClick={handleRemap} disabled={!mapping.date || !mapping.amount}>
                Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Account</Label>
                <Select
                  value={accountId}
                  onValueChange={(v: string | null) => onAccountChange(v ?? '')}
                  items={accounts.map((a) => ({ value: a.id, label: a.name }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} label={a.name}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Default Category</Label>
                <Select
                  value={categoryId}
                  onValueChange={(v: string | null) => onCategoryChange(v ?? '')}
                  items={categories.map((c) => ({ value: c.id, label: c.name }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} label={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {mappedRows.length} transactions will be imported.
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedRows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{row.date}</TableCell>
                      <TableCell className="text-xs max-w-40 truncate">{row.description}</TableCell>
                      <TableCell className="text-xs text-right">{row.amount}</TableCell>
                      <TableCell className="text-xs">{row.type ?? 'auto'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onStepChange('map')}>
                Back
              </Button>
              <Button
                onClick={onImport}
                disabled={!accountId || !categoryId || mappedRows.length === 0}
              >
                Import {mappedRows.length} Transactions
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
