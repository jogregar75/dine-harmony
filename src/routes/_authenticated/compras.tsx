import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck, Plus, Trash2 } from "lucide-react";
import { money } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/compras")({
  head: () => ({ meta: [{ title: "Compras — GastroPOS" }] }),
  component: ComprasPage,
});

type Unit = "g" | "kg" | "ml" | "l" | "u";
type Ing = { id: string; name: string; unit: Unit; cost: number };
type Sup = { id: string; name: string };
type PurchaseRow = {
  id: string;
  purchase_date: string;
  total: number;
  notes: string | null;
  status: "draft" | "received" | "cancelled";
  suppliers: { name: string } | null;
};
type PurchaseItemDraft = {
  ingredient_id: string;
  qty: string;
  unit: Unit;
  unit_cost: string;
};

function ComprasPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: purchases = [] } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("purchases")
        .select("id, purchase_date, total, notes, status, suppliers(name)")
        .order("purchase_date", { ascending: false })
        .limit(100);
      return (data ?? []) as PurchaseRow[];
    },
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ings-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ingredients")
        .select("id, name, unit, cost")
        .order("name");
      return (data ?? []) as Ing[];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-min"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").order("name");
      return (data ?? []) as Sup[];
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Truck className="w-7 h-7 text-primary" />
            Compras a proveedores
          </h1>
          <p className="text-muted-foreground text-sm">
            Cada compra recibida suma stock y actualiza el costo promedio del ingrediente.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />
              Nueva compra
            </Button>
          </DialogTrigger>
          <NewPurchaseDialog
            ingredients={ingredients}
            suppliers={suppliers}
            onDone={() => {
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["purchases"] });
              qc.invalidateQueries({ queryKey: ["ingredients"] });
              qc.invalidateQueries({ queryKey: ["low-stock"] });
            }}
          />
        </Dialog>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Proveedor</th>
              <th className="text-left px-4 py-3">Notas</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-right px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {purchases.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-8">
                  Todavía no hay compras registradas.
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {new Date(p.purchase_date).toLocaleDateString("es-AR")}
                </td>
                <td className="px-4 py-3">{p.suppliers?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">
                  {p.notes ?? ""}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded bg-muted/60 uppercase">
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{money(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewPurchaseDialog({
  ingredients,
  suppliers,
  onDone,
}: {
  ingredients: Ing[];
  suppliers: Sup[];
  onDone: () => void;
}) {
  const [supplierId, setSupplierId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItemDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const total = items.reduce(
    (a, i) => a + (Number(i.qty) || 0) * (Number(i.unit_cost) || 0),
    0,
  );

  function addRow() {
    if (!ingredients.length) return toast.error("Primero cargá ingredientes");
    const first = ingredients[0];
    setItems([...items, { ingredient_id: first.id, qty: "1", unit: first.unit, unit_cost: String(first.cost || 0) }]);
  }
  function updateRow(idx: number, patch: Partial<PurchaseItemDraft>) {
    setItems(items.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!items.length) return toast.error("Agregá al menos un ítem");
    setSaving(true);
    try {
      const { data: purchase, error } = await (supabase as any)
        .from("purchases")
        .insert({
          supplier_id: supplierId || null,
          purchase_date: date,
          notes: notes || null,
          status: "received",
        })
        .select()
        .single();
      if (error) throw error;

      const rows = items.map((i) => ({
        purchase_id: purchase.id,
        ingredient_id: i.ingredient_id,
        qty: Number(i.qty),
        unit: i.unit,
        unit_cost: Number(i.unit_cost),
      }));
      const { error: err2 } = await (supabase as any).from("purchase_items").insert(rows);
      if (err2) throw err2;

      toast.success("Compra registrada y stock actualizado");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const UNITS: Unit[] = ["g", "kg", "ml", "l", "u"];

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>Nueva compra</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase text-muted-foreground">Proveedor</label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Sin proveedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs uppercase text-muted-foreground">Fecha</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs uppercase text-muted-foreground">Ítems</label>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="w-3 h-3" />
            Agregar
          </Button>
        </div>
        <div className="space-y-2 max-h-72 overflow-auto">
          {items.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-5">
                <Select
                  value={row.ingredient_id}
                  onValueChange={(v) => {
                    const ing = ingredients.find((i) => i.id === v);
                    updateRow(idx, {
                      ingredient_id: v,
                      unit: ing?.unit ?? row.unit,
                      unit_cost: ing ? String(ing.cost || row.unit_cost) : row.unit_cost,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                className="col-span-2"
                type="number"
                step="0.001"
                placeholder="Cant."
                value={row.qty}
                onChange={(e) => updateRow(idx, { qty: e.target.value })}
              />
              <Select
                value={row.unit}
                onValueChange={(v) => updateRow(idx, { unit: v as Unit })}
              >
                <SelectTrigger className="col-span-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="col-span-2"
                type="number"
                step="0.01"
                placeholder="$ unit."
                value={row.unit_cost}
                onChange={(e) => updateRow(idx, { unit_cost: e.target.value })}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeRow(idx)}
                className="col-span-1"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              Sin ítems. Agregá el primero.
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="text-xs uppercase text-muted-foreground">Notas</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <DialogFooter className="items-center">
        <div className="mr-auto text-lg font-bold">Total: {money(total)}</div>
        <Button onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Registrar compra"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
