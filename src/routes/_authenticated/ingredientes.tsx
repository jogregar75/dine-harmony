import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, AlertTriangle, Truck } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/ingredientes")({
  head: () => ({ meta: [{ title: "Ingredientes — GastroPOS" }] }),
  component: IngredientesPage,
});

type Unit = "g" | "kg" | "ml" | "l" | "u";
type Supplier = { id: string; name: string; phone: string | null; email: string | null; notes: string | null };
type Ingredient = {
  id: string;
  name: string;
  unit: Unit;
  stock: number;
  min_stock: number;
  cost: number;
  supplier_id: string | null;
  notes: string | null;
};

const UNITS: { value: Unit; label: string }[] = [
  { value: "g", label: "Gramos (g)" },
  { value: "kg", label: "Kilos (kg)" },
  { value: "ml", label: "Mililitros (ml)" },
  { value: "l", label: "Litros (l)" },
  { value: "u", label: "Unidad (u)" },
];

function IngredientesPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ingredientes" | "proveedores">("ingredientes");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: async () => {
      const { data } = await supabase.from("ingredients").select("*").order("name");
      return (data ?? []) as Ingredient[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      return (data ?? []) as Supplier[];
    },
  });

  const filtered = useMemo(
    () => ingredients.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [ingredients, search]
  );
  const lowStock = useMemo(
    () => ingredients.filter((i) => Number(i.stock) <= Number(i.min_stock)),
    [ingredients]
  );

  async function saveIngredient(i: Partial<Ingredient>) {
    if (!i.name?.trim()) return toast.error("Nombre requerido");
    const payload = {
      name: i.name.trim(),
      unit: (i.unit ?? "u") as Unit,
      stock: Number(i.stock ?? 0),
      min_stock: Number(i.min_stock ?? 0),
      cost: Number(i.cost ?? 0),
      supplier_id: i.supplier_id || null,
      notes: i.notes ?? null,
    };
    const res = i.id
      ? await supabase.from("ingredients").update(payload).eq("id", i.id)
      : await supabase.from("ingredients").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Ingrediente guardado");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["ingredients"] });
  }

  async function deleteIngredient(id: string) {
    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ingrediente eliminado");
    qc.invalidateQueries({ queryKey: ["ingredients"] });
  }

  async function saveSupplier(s: Partial<Supplier>) {
    if (!s.name?.trim()) return toast.error("Nombre requerido");
    const payload = {
      name: s.name.trim(),
      phone: s.phone ?? null,
      email: s.email ?? null,
      notes: s.notes ?? null,
    };
    const res = s.id
      ? await supabase.from("suppliers").update(payload).eq("id", s.id)
      : await supabase.from("suppliers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Proveedor guardado");
    setEditingSupplier(null);
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  async function deleteSupplier(id: string) {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Proveedor eliminado");
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Ingredientes</h1>
          <p className="text-muted-foreground text-sm">
            Stock, costos y proveedores. Los ingredientes se vinculan a los productos desde la Carta.
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "ingredientes" ? (
            <Button
              onClick={() =>
                setEditing({ name: "", unit: "u", stock: 0, min_stock: 0, cost: 0 })
              }
            >
              <Plus className="w-4 h-4" /> Nuevo ingrediente
            </Button>
          ) : (
            <Button onClick={() => setEditingSupplier({ name: "" })}>
              <Plus className="w-4 h-4" /> Nuevo proveedor
            </Button>
          )}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="surface-card p-3 flex items-center gap-2 border border-amber-500/40 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm">
            <strong>{lowStock.length}</strong> ingrediente(s) por debajo del stock mínimo:{" "}
            <span className="text-muted-foreground">
              {lowStock.slice(0, 5).map((i) => i.name).join(", ")}
              {lowStock.length > 5 ? "…" : ""}
            </span>
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant={tab === "ingredientes" ? "default" : "outline"} onClick={() => setTab("ingredientes")}>
          Ingredientes
        </Button>
        <Button size="sm" variant={tab === "proveedores" ? "default" : "outline"} onClick={() => setTab("proveedores")}>
          <Truck className="w-3.5 h-3.5" /> Proveedores
        </Button>
      </div>

      {tab === "ingredientes" && (
        <>
          <Input
            placeholder="Buscar ingrediente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="surface-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Nombre</th>
                  <th className="text-left p-3">Unidad</th>
                  <th className="text-right p-3">Stock</th>
                  <th className="text-right p-3">Mínimo</th>
                  <th className="text-right p-3">Costo</th>
                  <th className="text-left p-3">Proveedor</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const low = Number(i.stock) <= Number(i.min_stock);
                  const sup = suppliers.find((s) => s.id === i.supplier_id);
                  return (
                    <tr key={i.id} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="p-3 font-medium">{i.name}</td>
                      <td className="p-3 text-muted-foreground">{i.unit}</td>
                      <td className={`p-3 text-right font-mono ${low ? "text-amber-500 font-semibold" : ""}`}>
                        {Number(i.stock).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {Number(i.min_stock).toLocaleString()}
                      </td>
                      <td className="p-3 text-right font-mono">{money(Number(i.cost))}</td>
                      <td className="p-3 text-muted-foreground">{sup?.name ?? "—"}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => setEditing(i)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteIngredient(i.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay ingredientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "proveedores" && (
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Nombre</th>
                <th className="text-left p-3">Teléfono</th>
                <th className="text-left p-3">Email</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-border/40 hover:bg-muted/20">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.phone ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{s.email ?? "—"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setEditingSupplier(s)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteSupplier(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-muted-foreground py-8">
                    No hay proveedores.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Diálogo Ingrediente */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar ingrediente" : "Nuevo ingrediente"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nombre</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Unidad</Label>
                <Select
                  value={editing.unit ?? "u"}
                  onValueChange={(v) => setEditing({ ...editing, unit: v as Unit })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Costo por unidad</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editing.cost ?? 0}
                  onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Stock actual</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={editing.stock ?? 0}
                  onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Stock mínimo</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={editing.min_stock ?? 0}
                  onChange={(e) => setEditing({ ...editing, min_stock: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <Label>Proveedor</Label>
                <Select
                  value={editing.supplier_id ?? "none"}
                  onValueChange={(v) => setEditing({ ...editing, supplier_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin proveedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin proveedor</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notas</Label>
                <Textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editing && saveIngredient(editing)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Proveedor */}
      <Dialog open={!!editingSupplier} onOpenChange={(o) => !o && setEditingSupplier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier?.id ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          </DialogHeader>
          {editingSupplier && (
            <div className="space-y-3">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={editingSupplier.name ?? ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={editingSupplier.phone ?? ""}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={editingSupplier.email ?? ""}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={editingSupplier.notes ?? ""}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editingSupplier && saveSupplier(editingSupplier)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
