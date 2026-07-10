import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/carta")({
  head: () => ({ meta: [{ title: "Carta — GastroPOS" }] }),
  component: CartaPage,
});

type Category = { id: string; name: string; color: string | null; sort_order: number };
type Product = {
  id: string;
  category_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  tax_rate: number;
  prep_time_minutes: number;
  available: boolean;
};

function CartaPage() {
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [catName, setCatName] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
      return (data ?? []) as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return (data ?? []) as Product[];
    },
  });

  const filtered = activeCat === "all" ? products : products.filter((p) => p.category_id === activeCat);

  async function createCategory() {
    if (!catName.trim()) return;
    const { error } = await supabase
      .from("categories")
      .insert({ name: catName.trim(), sort_order: categories.length });
    if (error) return toast.error(error.message);
    toast.success("Categoría creada");
    setCatName("");
    setNewCatOpen(false);
    qc.invalidateQueries({ queryKey: ["categories"] });
  }

  async function saveProduct(p: Partial<Product>) {
    const payload = {
      category_id: p.category_id ?? null,
      code: p.code ?? null,
      name: p.name ?? "",
      description: p.description ?? null,
      image_url: p.image_url ?? null,
      price: Number(p.price ?? 0),
      tax_rate: Number(p.tax_rate ?? 21),
      prep_time_minutes: Number(p.prep_time_minutes ?? 10),
      available: p.available ?? true,
    };
    if (p.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", p.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Producto guardado");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function deleteProduct(id: string) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Producto eliminado");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function toggleAvailable(p: Product) {
    await supabase.from("products").update({ available: !p.available }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function uploadImage(file: File): Promise<string | null> {
    const path = `${crypto.randomUUID()}-${file.name}`;
    const up = await supabase.storage.from("products").upload(path, file, { upsert: true });
    if (up.error) {
      toast.error(up.error.message);
      return null;
    }
    const { data } = await supabase.storage.from("products").createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? null;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Carta</h1>
          <p className="text-muted-foreground text-sm">Administrá categorías y productos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setNewCatOpen(true)}>
            <Plus className="w-4 h-4" />
            Categoría
          </Button>
          <Button
            onClick={() =>
              setEditing({
                name: "",
                price: 0,
                tax_rate: 21,
                prep_time_minutes: 10,
                available: true,
                category_id: categories[0]?.id,
              })
            }
          >
            <Plus className="w-4 h-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={activeCat === "all" ? "default" : "outline"}
          onClick={() => setActiveCat("all")}
        >
          Todas
        </Button>
        {categories.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={activeCat === c.id ? "default" : "outline"}
            onClick={() => setActiveCat(c.id)}
            style={
              activeCat === c.id && c.color
                ? { background: c.color, color: "var(--color-primary-foreground)" }
                : undefined
            }
          >
            {c.name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((p) => (
          <div key={p.id} className="surface-card p-4 flex gap-3 group">
            <div
              className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0"
              style={{
                background: p.image_url ? undefined : "var(--gradient-primary)",
              }}
            >
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-6 h-6 text-primary-foreground opacity-60" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.code} · {p.prep_time_minutes}min
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-primary">{money(p.price)}</div>
                  <div className="text-[10px] text-muted-foreground">IVA {p.tax_rate}%</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={p.available} onCheckedChange={() => toggleAvailable(p)} />
                  <span className="text-xs text-muted-foreground">
                    {p.available ? "Disponible" : "Agotado"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(p)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteProduct(p.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No hay productos en esta categoría.
          </div>
        )}
      </div>

      {/* Diálogo Categoría */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva categoría</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nombre</Label>
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={createCategory}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Producto */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nombre</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Código</Label>
                  <Input
                    value={editing.code ?? ""}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select
                    value={editing.category_id ?? undefined}
                    onValueChange={(v) => setEditing({ ...editing, category_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Precio</Label>
                  <Input
                    type="number"
                    value={editing.price ?? 0}
                    onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>IVA %</Label>
                  <Input
                    type="number"
                    value={editing.tax_rate ?? 21}
                    onChange={(e) => setEditing({ ...editing, tax_rate: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Descripción</Label>
                  <Textarea
                    value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Tiempo prep (min)</Label>
                  <Input
                    type="number"
                    value={editing.prep_time_minutes ?? 10}
                    onChange={(e) =>
                      setEditing({ ...editing, prep_time_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    checked={editing.available ?? true}
                    onCheckedChange={(v) => setEditing({ ...editing, available: v })}
                  />
                  <Label>Disponible</Label>
                </div>
                <div className="col-span-2">
                  <Label>Imagen</Label>
                  <div className="flex items-center gap-3">
                    {editing.image_url && (
                      <img
                        src={editing.image_url}
                        alt="preview"
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const url = await uploadImage(f);
                        if (url) setEditing({ ...editing, image_url: url });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => editing && saveProduct(editing)}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
