import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useCategoriesStore } from "@/stores/categoriesStore"
import type { Category, CategoryKind } from "@/types"
import { ICON_MAP, ICON_NAMES } from "@/lib/icons"

const COLORS = [
  "#16a34a", "#22c55e", "#10b981", "#34d399", "#6ee7b7", // greens
  "#dc2626", "#ef4444", "#f97316", "#f59e0b", "#eab308", // reds/oranges
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", // blues/purples
  "#ec4899", "#f43f5e", "#14b8a6", "#06b6d4", "#64748b", // misc
]

interface FormData {
  name: string
  type: CategoryKind
  color: string
  parentId: string
  icon: string
}

const emptyForm: FormData = {
  name: "",
  type: "expense",
  color: COLORS[0],
  parentId: "",
  icon: "",
}

export default function Categories() {
  const { load, add, update, remove, getRootCategories, getChildren } = useCategoriesStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [activeTab, setActiveTab] = useState("expense")

  useEffect(() => {
    load()
  }, [load])

  function openAdd(type: CategoryKind, parentId = "") {
    setEditing(null)
    setForm({ ...emptyForm, type, parentId, color: COLORS[0] })
    setDialogOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setForm({
      name: cat.name,
      type: cat.type,
      color: cat.color,
      parentId: cat.parentId ?? "",
      icon: cat.icon ?? "",
    })
    setDialogOpen(true)
  }

  function confirmDelete(cat: Category) {
    setDeleteTarget(cat)
  }

  async function handleSave() {
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

    setDialogOpen(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await remove(deleteTarget.id)
    setDeleteTarget(null)
  }

  function CategoryItem({ cat, level = 0 }: { cat: Category; level?: number }) {
    const children = getChildren(cat.id)
    const CatIcon = ICON_MAP[cat.icon ?? ""]
    return (
      <div>
        <div className="flex items-center justify-between rounded-lg py-2 px-3 hover:bg-muted/50" style={{ paddingLeft: `${12 + level * 20}px` }}>
          <div className="flex items-center gap-3">
            {CatIcon ? (
              <CatIcon className="size-4 shrink-0" style={{ color: cat.color }} />
            ) : (
              <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
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
    const roots = getRootCategories(type)
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
    ? getRootCategories(form.type).filter((c) => c.id !== editing.id)
    : getRootCategories(form.type)

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

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Groceries"
              />
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CategoryKind, parentId: "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {parentOptions.length > 0 && (
              <div className="grid gap-2">
                <Label>Parent Category</Label>
                <Select value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: v ?? "" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="None (root category)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (root category)</SelectItem>
                    {parentOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
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
                    className={`size-7 rounded-full border-2 transition-all ${form.color === color ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm({ ...form, color })}
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
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      onClick={() => setForm({ ...form, icon: form.icon === iconName ? "" : iconName })}
                    >
                      <Icon className="size-4" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? "Save" : "Add Category"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
