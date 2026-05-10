import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useCategoriesStore } from '@/stores/categoriesStore'
import type { Category, CategoryKind } from '@/types'
import { ICON_MAP } from '@/lib/icons'
import { CategoryDialog, type CategoryFormData } from '@/pages/categories/CategoryDialog'

const emptyForm: CategoryFormData = {
  name: '',
  type: 'expense',
  color: '#16a34a',
  parentId: '',
  icon: '',
}

export default function Categories() {
  const categories = useCategoriesStore((s) => s.categories)
  const load = useCategoriesStore((s) => s.load)
  const add = useCategoriesStore((s) => s.add)
  const update = useCategoriesStore((s) => s.update)
  const remove = useCategoriesStore((s) => s.remove)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormData>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [activeTab, setActiveTab] = useState('expense')

  useEffect(() => {
    load()
  }, [load])

  function openAdd(type: CategoryKind, parentId = '') {
    setEditing(null)
    setForm({ ...emptyForm, type, parentId })
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setForm({
      name: cat.name,
      type: cat.type,
      color: cat.color,
      parentId: cat.parentId ?? '',
      icon: cat.icon ?? '',
    })
    setDialogOpen(true)
  }

  function confirmDelete(cat: Category) {
    setDeleteTarget(cat)
  }

  async function handleSave() {
    try {
      const data = {
        name: form.name.trim(),
        type: form.type,
        color: form.color,
        icon: form.icon || undefined,
        ...(form.parentId ? { parentId: form.parentId } : {}),
      }

      if (!data.name) return

      if (editing) {
        await update(editing.id, data)
      } else {
        await add(data)
      }

      setActiveTab(data.type)
      setDialogOpen(false)
      setEditing(null)
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  async function handleDelete() {
    try {
      if (!deleteTarget) return
      await remove(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error is already in the store → GlobalErrorBanner will display it
    }
  }

  function CategoryItem({ cat, level = 0 }: { cat: Category; level?: number }) {
    const children = categories.filter((c) => c.parentId === cat.id)
    const CatIcon = ICON_MAP[cat.icon ?? '']
    return (
      <div>
        <div
          className="flex items-center justify-between rounded-lg py-2 px-3 hover:bg-muted/50"
          style={{ paddingLeft: `${12 + level * 20}px` }}
        >
          <div className="flex items-center gap-3">
            {CatIcon ? (
              <CatIcon className="size-4 shrink-0" style={{ color: cat.color }} />
            ) : (
              <span
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: cat.color }}
              />
            )}
            <span className="font-medium text-sm">{cat.name}</span>
            {cat.parentId && <span className="text-xs text-muted-foreground">Subcategory</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => openEdit(cat)}>
              <Pencil className="size-3" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => confirmDelete(cat)}>
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
        {children.map((child) => (
          <CategoryItem key={child.id} cat={child} level={level + 1} />
        ))}
      </div>
    )
  }

  function CategoryList({ type }: { type: CategoryKind }) {
    const roots = categories.filter((c) => c.type === type && !c.parentId)
    if (roots.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-sm">No categories yet. Add one to get started.</p>
        </div>
      )
    }
    return (
      <div className="divide-y">
        {roots.map((cat) => (
          <CategoryItem key={cat.id} cat={cat} />
        ))}
      </div>
    )
  }

  const parentOptions = editing
    ? categories.filter((c) => c.type === form.type && !c.parentId && c.id !== editing.id)
    : categories.filter((c) => c.type === form.type && !c.parentId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Organize your income and expense categories.</p>
        </div>
        <Button onClick={() => openAdd(activeTab as CategoryKind)}>
          <Plus className="size-4" />
          Add Category
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
        </TabsList>
        <TabsContent value="expense">
          <div className="rounded-xl border mt-4">
            <CategoryList type="expense" />
          </div>
        </TabsContent>
        <TabsContent value="income">
          <div className="rounded-xl border mt-4">
            <CategoryList type="income" />
          </div>
        </TabsContent>
      </Tabs>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
        parentOptions={parentOptions}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
