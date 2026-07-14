import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money, dateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => ({ meta: [{ title: "Inventario — GastroPOS" }] }),
  component: InventarioPage,
});

function InventarioPage() {
  const [search, setSearch] = useState("");

  const { data: ingredients = [] } = useQuery({
    queryKey: ["inv-ing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingredients")
        .select("id,name,unit,stock,min_stock,cost,suppliers(name)")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["inv-mov"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id,ingredient_id,movement_type,qty,note,created_at,ingredients(name,unit)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const filtered = useMemo(
    () => ingredients.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())),
    [ingredients, search],
  );

  const totalValue = ingredients.reduce((s, i) => s + Number(i.stock ?? 0) * Number(i.cost ?? 0), 0);
  const belowMin = ingredients.filter((i) => Number(i.stock ?? 0) < Number(i.min_stock ?? 0));
  const totalItems = ingredients.length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventario valorizado</h1>
        <p className="text-sm text-muted-foreground">Stock actual y movimientos recientes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Valor total del stock</div>
            <div className="text-xl font-bold">{money(totalValue)}</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Ingredientes en catálogo</div>
          <div className="text-xl font-bold">{totalItems}</div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Bajo stock</div>
            <div className="text-xl font-bold">{belowMin.length}</div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Stock actual valorizado</h3>
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Ingrediente</th>
                <th>Proveedor</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Mín</th>
                <th className="text-right">Costo unit.</th>
                <th className="text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const stock = Number(i.stock ?? 0);
                const min = Number(i.min_stock ?? 0);
                const value = stock * Number(i.cost ?? 0);
                const low = stock < min;
                return (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{i.name}</td>
                    <td className="text-muted-foreground">{i.suppliers?.name ?? "—"}</td>
                    <td className={`text-right tabular-nums ${low ? "text-destructive font-semibold" : ""}`}>
                      {stock} {i.unit} {low && <Badge variant="destructive" className="ml-1">bajo</Badge>}
                    </td>
                    <td className="text-right tabular-nums text-muted-foreground">{min} {i.unit}</td>
                    <td className="text-right tabular-nums">{money(i.cost)}</td>
                    <td className="text-right tabular-nums font-semibold">{money(value)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin ingredientes</td></tr>
              )}
            </tbody>
            <tfoot className="border-t">
              <tr>
                <td colSpan={5} className="py-2 text-right font-semibold">Total</td>
                <td className="py-2 text-right font-bold">{money(totalValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Movimientos recientes (últimos 200)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Fecha</th>
                <th>Ingrediente</th>
                <th>Tipo</th>
                <th className="text-right">Cantidad</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{dateTime(m.created_at)}</td>
                  <td>{m.ingredients?.name ?? "—"}</td>
                  <td><Badge variant="outline">{m.movement_type}</Badge></td>
                  <td className={`text-right tabular-nums ${Number(m.qty) < 0 ? "text-destructive" : "text-primary"}`}>
                    {Number(m.qty) > 0 ? "+" : ""}{m.qty} {m.ingredients?.unit ?? ""}
                  </td>
                  <td className="text-muted-foreground text-xs">{m.note ?? "—"}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
