import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ICON_MAP, ICON_NAMES } from '@/lib/icons'
import type { Category, CategoryKind } from '@/types'

const COLORS = [
  '#16a34a',
  '#22c55e',
  '#10b981',
  '#34d399',
  '#6ee7b7',
  '#dc2626',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#14b8a6',
  '#06b6d4',
  '#64748b',
]

export interface CategoryFormData {
  name: string
  type: CategoryKind
  color: string
  parentId: string
  icon: string
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Category | null
  form: CategoryFormData
  onFormChange: (form: CategoryFormData) => void
  onSave: () => void
  parentOptions: Category[]
}

export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSave,
  parentOptions,
}: CategoryDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder="e.g. Groceries"
            />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                onFormChange({ ...form, type: v as CategoryKind, parentId: '' })
              }
              items={[
                { value: 'expense', label: 'Expense' },
                { value: 'income', label: 'Income' },
              ]}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense" label="Expense">
                  Expense
                </SelectItem>
                <SelectItem value="income" label="Income">
                  Income
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {parentOptions.length > 0 && (
            <div className="grid gap-2">
              <Label>Parent Category</Label>
              <Select
                value={form.parentId}
                onValueChange={(v) => onFormChange({ ...form, parentId: v ?? '' })}
                items={[
                  { value: '', label: 'None (root category)' },
                  ...parentOptions.map((c) => ({ value: c.id, label: c.name })),
                ]}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (root category)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" label="None (root category)">
                    None (root category)
                  </SelectItem>
                  {parentOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id} label={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`size-7 rounded-full border-2 transition-all ${form.color === color ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => onFormChange({ ...form, color })}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto rounded-lg border p-2">
              {ICON_NAMES.map((iconName) => {
                const Icon = ICON_MAP[iconName]
                return (
                  <button
                    key={iconName}
                    type="button"
                    title={iconName}
                    className={`flex items-center justify-center size-9 rounded-lg transition-colors ${
                      form.icon === iconName
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    onClick={() =>
                      onFormChange({ ...form, icon: form.icon === iconName ? '' : iconName })
                    }
                  >
                    <Icon className="size-4" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!form.name.trim()}>
            {editing ? 'Save' : 'Add Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
