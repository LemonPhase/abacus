import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Account, Category } from '@/types'

export interface TransactionFiltersValue {
  account: string
  category: string
  type: string
  dateFrom: string
  dateTo: string
}

interface TransactionFiltersProps {
  accounts: Account[]
  categories: Category[]
  value: TransactionFiltersValue
  onChange: (value: TransactionFiltersValue) => void
  onClear: () => void
}

export function TransactionFilters({
  accounts,
  categories,
  value,
  onChange,
  onClear,
}: TransactionFiltersProps) {
  const hasFilters =
    value.account !== 'all' ||
    value.category !== 'all' ||
    value.type !== 'all' ||
    value.dateFrom !== '' ||
    value.dateTo !== ''

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-1.5">
        <Label className="text-xs">Account</Label>
        <Select
          value={value.account}
          onValueChange={(v) => onChange({ ...value, account: v ?? 'all' })}
          items={[
            { value: 'all', label: 'All accounts' },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All accounts">
              All accounts
            </SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id} label={a.name}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Category</Label>
        <Select
          value={value.category}
          onValueChange={(v) => onChange({ ...value, category: v ?? 'all' })}
          items={[
            { value: 'all', label: 'All categories' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All categories">
              All categories
            </SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} label={c.name}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Type</Label>
        <Select
          value={value.type}
          onValueChange={(v) => onChange({ ...value, type: v ?? 'all' })}
          items={[
            { value: 'all', label: 'All' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" label="All">
              All
            </SelectItem>
            <SelectItem value="income" label="Income">
              Income
            </SelectItem>
            <SelectItem value="expense" label="Expense">
              Expense
            </SelectItem>
            <SelectItem value="transfer" label="Transfer">
              Transfer
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={value.dateFrom}
          onChange={(e) => onChange({ ...value, dateFrom: e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          className="h-8 w-36 text-xs"
          value={value.dateTo}
          onChange={(e) => onChange({ ...value, dateTo: e.target.value })}
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="xs" className="mb-0.5" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
