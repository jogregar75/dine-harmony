import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, CheckCheck } from "lucide-react";
import { timeShort } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cocina")({
  head: () => ({ meta: [{ title: "Cocina — GastroPOS" }] }),
  component: CocinaPage,
});

type KItem = {
  id: string;
  order_id: string;
  product_name: string;
  qty: number;
  notes: string | null;
  status: "pending" | "preparing" | "ready" | "delivered" | "cancelled";
  sent_at: string | null;
  created_at: string;
  orders: { code: number; table_id: string | null; restaurant_tables: { number: number } | null } | null;
};

function CocinaPage() {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("kds")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () =>
        qc.invalidateQueries({ queryKey: ["kds"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const { data: items = [] } = useQuery({
    queryKey: ["kds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select(
          "id, order_id, product_name, qty, notes, status, sent_at, created_at, orders!inner(code, table_id, restaurant_tables(number))",
        )
        .in("status", ["preparing", "ready"])
        .order("sent_at", { ascending: true });
      return (data ?? []) as unknown as KItem[];
    },
  });

  // Agrupar por orden
  const byOrder = items.reduce<Record<string, KItem[]>>((acc, i) => {
    (acc[i.order_id] ||= []).push(i);
    return acc;
  }, {});

  async function updateStatus(id: string, status: KItem["status"]) {
    const patch: Record<string, unknown> = { status };
    if (status === "ready") patch.ready_at = new Date().toISOString();
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    await supabase.from("order_items").update(patch).eq("id", id);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ChefHat className="w-7 h-7 text-primary" />
          Cocina en vivo
        </h1>
        <p className="text-muted-foreground text-sm">
          Pedidos activos ordenados por hora de envío.
        </p>
      </div>

      {Object.keys(byOrder).length === 0 && (
        <div className="surface-card p-12 text-center text-muted-foreground">
          <ChefHat className="w-10 h-10 mx-auto mb-3 opacity-50" />
          No hay pedidos activos en este momento.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Object.entries(byOrder).map(([orderId, its]) => {
          const first = its[0];
          const tableN = first.orders?.restaurant_tables?.number;
          const oldest = its.reduce(
            (m, i) => (new Date(i.sent_at || i.created_at) < new Date(m) ? i.sent_at || i.created_at : m),
            its[0].sent_at || its[0].created_at,
          );
          const mins = Math.max(0, Math.round((Date.now() - new Date(oldest).getTime()) / 60000));
          const hot = mins >= 15;

          return (
            <div
              key={orderId}
              className={
                "surface-card p-4 transition " +
                (hot ? "border-destructive/60 glow-primary" : "")
              }
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Pedido #{first.orders?.code}
                  </div>
                  <div className="text-xl font-bold">
                    {tableN ? `Mesa ${tableN}` : "Take away"}
                  </div>
                </div>
                <div
                  className={
                    "text-sm font-semibold flex items-center gap-1 " +
                    (hot ? "text-destructive" : "text-muted-foreground")
                  }
                >
                  <Clock className="w-3.5 h-3.5" />
                  {mins}m
                </div>
              </div>

              <div className="space-y-2">
                {its.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/40"
                  >
                    <div className="w-8 h-8 rounded-md bg-primary/20 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                      {Number(i.qty)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{i.product_name}</div>
                      {i.notes && (
                        <div className="text-[11px] text-warning truncate">{i.notes}</div>
                      )}
                      <div className="text-[10px] uppercase text-muted-foreground">
                        {i.status === "preparing" ? "Preparando" : "Listo"} ·{" "}
                        {i.sent_at ? timeShort(i.sent_at) : "—"}
                      </div>
                    </div>
                    {i.status === "preparing" ? (
                      <Button size="sm" onClick={() => updateStatus(i.id, "ready")}>
                        <CheckCheck className="w-3.5 h-3.5" />
                        Listo
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(i.id, "delivered")}
                      >
                        Entregado
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
