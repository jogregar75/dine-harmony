import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  X,
  SlidersHorizontal,
  UserPlus,
  Split,
  ArrowLeftRight,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/pedidos/$tableId")({
  head: () => ({ meta: [{ title: "Pedido — GastroPOS" }] }),
  component: PedidoPage,
});

type Product = {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
  category_id: string | null;
  image_url: string | null;
  available: boolean;
};
type Category = { id: string; name: string; color: string | null };
type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  tax_rate: number;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  notes: string | null;
  modifiers_total: number;
};
type Order = {
  id: string;
  code: number;
  table_id: string;
  status: "open" | "sent" | "paid" | "cancelled";
  subtotal: number;
  tax: number;
  total: number;
  customer_id: string | null;
};

function PedidoPage() {
  const { tableId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [modItem, setModItem] = useState<OrderItem | null>(null);
  const [payDlg, setPayDlg] = useState(false);
  const [customerDlg, setCustomerDlg] = useState(false);
  const [splitDlg, setSplitDlg] = useState(false);
  const [transferDlg, setTransferDlg] = useState(false);



  const { data: table } = useQuery({
    queryKey: ["table", tableId],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("id", tableId)
        .single();
      return data;
    },
  });

  const { data: order } = useQuery({
    queryKey: ["order-for-table", tableId],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("table_id", tableId)
        .in("status", ["open", "sent"])
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Order | null;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["order-items", order?.id],
    enabled: !!order?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order!.id)
        .order("created_at");
      return (data ?? []) as OrderItem[];
    },
  });

  useEffect(() => {
    if (!order?.id) return;
    const ch = supabase
      .channel("order-" + order.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` },
        () => qc.invalidateQueries({ queryKey: ["order-items", order.id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${order.id}` },
        () => qc.invalidateQueries({ queryKey: ["order-for-table", tableId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [order?.id, tableId, qc]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("sort_order");
      return (data ?? []) as Category[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", "available"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("available", true)
        .order("name");
      return (data ?? []) as Product[];
    },
  });

  const filtered = products.filter((p) => {
    if (activeCat !== "all" && p.category_id !== activeCat) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function addItem(p: Product) {
    if (!order) return;
    const existing = items.find(
      (i) => i.product_id === p.id && i.status === "pending",
    );
    if (existing) {
      await supabase
        .from("order_items")
        .update({ qty: Number(existing.qty) + 1 })
        .eq("id", existing.id);
    } else {
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: p.id,
        product_name: p.name,
        qty: 1,
        unit_price: p.price,
        tax_rate: p.tax_rate,
      });
    }
  }

  async function updateQty(i: OrderItem, delta: number) {
    const q = Number(i.qty) + delta;
    if (q <= 0) return supabase.from("order_items").delete().eq("id", i.id);
    await supabase.from("order_items").update({ qty: q }).eq("id", i.id);
  }
  async function removeItem(id: string) {
    await supabase.from("order_items").delete().eq("id", id);
  }

  async function sendToKitchen() {
    if (!order) return;
    const pending = items.filter((i) => i.status === "pending");
    if (!pending.length) return toast.info("No hay ítems nuevos para enviar");
    await supabase
      .from("order_items")
      .update({ status: "preparing", sent_at: new Date().toISOString() })
      .in("id", pending.map((i) => i.id));
    await supabase.from("orders").update({ status: "sent" }).eq("id", order.id);
    toast.success(`${pending.length} ítem(s) enviados a cocina`);
  }

  function openPay() {
    if (!order) return;
    if (Number(order.total ?? 0) <= 0) return toast.info("Nada para cobrar");
    setPayDlg(true);
  }


  async function cancelOrder() {
    if (!order) return;
    // Cancelar ítems activos para que salgan de cocina (y disparen devolución de stock si ya estaban entregados)
    await supabase
      .from("order_items")
      .update({ status: "cancelled" })
      .eq("order_id", order.id)
      .in("status", ["pending", "preparing", "ready", "delivered"]);
    await supabase
      .from("orders")
      .update({ status: "cancelled", closed_at: new Date().toISOString() })
      .eq("id", order.id);
    await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId);
    navigate({ to: "/mesas" });
  }

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-3.5rem)]">
      {/* Productos */}
      <div className="flex-1 flex flex-col p-4 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/mesas" })}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Mesa {table?.number}</h1>
              <p className="text-xs text-muted-foreground">
                Pedido #{order?.code} · {items.length} ítem(s)
              </p>
            </div>
          </div>
          <Input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <div className="flex gap-2 flex-wrap mb-3">
          <Button
            size="sm"
            variant={activeCat === "all" ? "default" : "outline"}
            onClick={() => setActiveCat("all")}
          >
            Todos
          </Button>
          {categories.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={activeCat === c.id ? "default" : "outline"}
              onClick={() => setActiveCat(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => addItem(p)}
                className="surface-card text-left p-3 hover:border-primary/60 transition active:scale-[0.98]"
              >
                <div
                  className="w-full aspect-video rounded-md mb-2 overflow-hidden"
                  style={
                    p.image_url ? undefined : { background: "var(--gradient-primary)" }
                  }
                >
                  {p.image_url && (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-primary font-bold">{money(p.price)}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cuenta */}
      <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-border bg-card/40 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Cuenta</div>
          <div className="text-lg font-semibold">Mesa {table?.number}</div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {items.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Todavía no hay ítems.
              </div>
            )}
            {items.map((i) => {
              const lineTotal =
                Number(i.qty) * Number(i.unit_price) + Number(i.modifiers_total ?? 0);
              return (
                <div
                  key={i.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{i.product_name}</div>
                    <div className="text-[11px] text-muted-foreground uppercase">
                      {i.status === "pending" ? "Nuevo" : i.status}
                      {Number(i.modifiers_total ?? 0) !== 0 &&
                        ` · mod ${money(i.modifiers_total)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => updateQty(i, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center font-semibold">{Number(i.qty)}</span>
                    <Button size="icon" variant="ghost" onClick={() => updateQty(i, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="w-20 text-right font-semibold text-sm">
                    {money(lineTotal)}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Modificadores"
                    onClick={() => setModItem(i)}
                  >
                    <SlidersHorizontal className="w-3 h-3 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => removeItem(i.id)}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="p-4 border-t border-border space-y-2">
          <Row label="Subtotal" value={money(order?.subtotal ?? 0)} />
          <Row label="IVA" value={money(order?.tax ?? 0)} />
          <Row label="Total" value={money(order?.total ?? 0)} strong />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={sendToKitchen}>
              <Send className="w-4 h-4" />
              Enviar
            </Button>
            <Button onClick={payAndClose}>
              <CreditCard className="w-4 h-4" />
              Cobrar
            </Button>
            <Button variant="ghost" className="col-span-2" onClick={cancelOrder}>
              <X className="w-4 h-4" />
              Cancelar pedido
            </Button>
          </div>
        </div>
      </aside>

      {modItem && (
        <ModifiersDialog
          item={modItem}
          onClose={() => setModItem(null)}
        />
      )}
    </div>
  );
}

type Unit = "g" | "kg" | "ml" | "l" | "u";
type RecipeIng = {
  ingredient_id: string;
  optional: boolean;
  ingredients: { id: string; name: string; unit: Unit } | null;
};
type ModRow = {
  id: string;
  ingredient_id: string;
  action: "exclude" | "extra";
  qty: number;
  unit: Unit | null;
  price_delta: number;
};

function ModifiersDialog({ item, onClose }: { item: OrderItem; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: recipe = [] } = useQuery({
    queryKey: ["recipe", item.product_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_ingredients")
        .select("ingredient_id, optional, ingredients(id, name, unit)")
        .eq("product_id", item.product_id);
      return (data ?? []) as unknown as RecipeIng[];
    },
  });

  const { data: allIngredients = [] } = useQuery({
    queryKey: ["ings-all"],
    queryFn: async () => {
      const { data } = await supabase.from("ingredients").select("id, name, unit").order("name");
      return (data ?? []) as { id: string; name: string; unit: Unit }[];
    },
  });

  const { data: mods = [], refetch } = useQuery({
    queryKey: ["mods", item.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("order_item_modifiers")
        .select("*")
        .eq("order_item_id", item.id);
      return (data ?? []) as ModRow[];
    },
  });

  const excluded = new Set(
    mods.filter((m) => m.action === "exclude").map((m) => m.ingredient_id),
  );
  const extras = mods.filter((m) => m.action === "extra");

  async function toggleExclude(ingredientId: string, checked: boolean) {
    if (checked) {
      // marcar como incluido => borrar exclusión
      await (supabase as any)
        .from("order_item_modifiers")
        .delete()
        .eq("order_item_id", item.id)
        .eq("ingredient_id", ingredientId)
        .eq("action", "exclude");
    } else {
      await (supabase as any).from("order_item_modifiers").insert({
        order_item_id: item.id,
        ingredient_id: ingredientId,
        action: "exclude",
        qty: 0,
        price_delta: 0,
      });
    }
    refetch();
    qc.invalidateQueries({ queryKey: ["order-items", item.order_id] });
  }

  async function addExtra() {
    if (!allIngredients.length) return;
    const ing = allIngredients[0];
    await (supabase as any).from("order_item_modifiers").insert({
      order_item_id: item.id,
      ingredient_id: ing.id,
      action: "extra",
      qty: 1,
      unit: ing.unit,
      price_delta: 0,
    });
    refetch();
    qc.invalidateQueries({ queryKey: ["order-items", item.order_id] });
  }

  async function updateExtra(id: string, patch: Partial<ModRow>) {
    await (supabase as any).from("order_item_modifiers").update(patch).eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["order-items", item.order_id] });
  }

  async function removeExtra(id: string) {
    await (supabase as any).from("order_item_modifiers").delete().eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["order-items", item.order_id] });
  }

  const UNITS: Unit[] = ["g", "kg", "ml", "l", "u"];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modificar «{item.product_name}»</DialogTitle>
        </DialogHeader>

        <div>
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Ingredientes de la receta
          </div>
          {recipe.length === 0 && (
            <div className="text-sm text-muted-foreground py-4">
              Este producto no tiene receta cargada.
            </div>
          )}
          <div className="space-y-1 max-h-56 overflow-auto">
            {recipe.map((r) => {
              if (!r.ingredients) return null;
              const included = !excluded.has(r.ingredient_id);
              return (
                <label
                  key={r.ingredient_id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    checked={included}
                    onCheckedChange={(v) => toggleExclude(r.ingredient_id, !!v)}
                  />
                  <span className={included ? "" : "line-through text-muted-foreground"}>
                    {r.ingredients.name}
                  </span>
                  {r.optional && (
                    <span className="text-[10px] text-muted-foreground uppercase">
                      opcional
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-muted-foreground">Extras</div>
            <Button size="sm" variant="outline" onClick={addExtra}>
              <Plus className="w-3 h-3" />
              Agregar
            </Button>
          </div>
          <div className="space-y-2 max-h-56 overflow-auto">
            {extras.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-3">
                Sin extras.
              </div>
            )}
            {extras.map((m) => (
              <div key={m.id} className="grid grid-cols-12 gap-2 items-center">
                <Select
                  value={m.ingredient_id}
                  onValueChange={(v) => {
                    const ing = allIngredients.find((i) => i.id === v);
                    updateExtra(m.id, {
                      ingredient_id: v,
                      unit: ing?.unit ?? m.unit,
                    });
                  }}
                >
                  <SelectTrigger className="col-span-5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allIngredients.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="col-span-2"
                  type="number"
                  step="0.001"
                  value={m.qty}
                  onChange={(e) => updateExtra(m.id, { qty: Number(e.target.value) })}
                />
                <Select
                  value={m.unit ?? "u"}
                  onValueChange={(v) => updateExtra(m.id, { unit: v as Unit })}
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
                  placeholder="$"
                  value={m.price_delta}
                  onChange={(e) =>
                    updateExtra(m.id, { price_delta: Number(e.target.value) })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeExtra(m.id)}
                  className="col-span-1"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        "flex items-center justify-between " +
        (strong ? "text-lg font-bold text-primary" : "text-sm text-muted-foreground")
      }
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
