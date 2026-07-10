import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import {
  DollarSign,
  Users,
  Grid3x3,
  Clock,
  ChefHat,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — GastroPOS" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        qc.invalidateQueries({ queryKey: ["dash"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables" }, () =>
        qc.invalidateQueries({ queryKey: ["dash"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () =>
        qc.invalidateQueries({ queryKey: ["dash"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const { data } = useQuery({
    queryKey: ["dash"],
    queryFn: async () => {
      const startDay = new Date();
      startDay.setHours(0, 0, 0, 0);
      const startMonth = new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);

      const [daySales, monthSales, tables, pending, kitchen, orders7d] = await Promise.all([
        supabase
          .from("orders")
          .select("total")
          .eq("status", "paid")
          .gte("closed_at", startDay.toISOString()),
        supabase
          .from("orders")
          .select("total")
          .eq("status", "paid")
          .gte("closed_at", startMonth.toISOString()),
        supabase.from("restaurant_tables").select("status"),
        supabase.from("order_items").select("id").eq("status", "pending"),
        supabase.from("order_items").select("id").in("status", ["pending", "preparing"]),
        supabase
          .from("orders")
          .select("total, closed_at")
          .eq("status", "paid")
          .gte("closed_at", new Date(Date.now() - 6 * 86400000).toISOString()),
      ]);

      const sum = (rows?: { total: number | string | null }[] | null) =>
        (rows ?? []).reduce((a, r) => a + Number(r.total || 0), 0);

      const statuses = (tables.data ?? []).reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      }, {});

      // 7 días
      const byDay: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const k = d.toISOString().slice(0, 10);
        byDay[k] = 0;
      }
      (orders7d.data ?? []).forEach((o) => {
        if (!o.closed_at) return;
        const k = o.closed_at.slice(0, 10);
        if (k in byDay) byDay[k] += Number(o.total || 0);
      });
      const chart = Object.entries(byDay).map(([d, total]) => ({
        d: new Date(d).toLocaleDateString("es-AR", { weekday: "short" }),
        total,
      }));

      return {
        daySales: sum(daySales.data),
        monthSales: sum(monthSales.data),
        free: statuses.free ?? 0,
        occupied: statuses.occupied ?? 0,
        reserved: statuses.reserved ?? 0,
        pending: pending.data?.length ?? 0,
        kitchen: kitchen.data?.length ?? 0,
        chart,
      };
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Panorama operativo del restaurante en tiempo real.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Ventas del día"
          value={money(data?.daySales)}
          accent="primary"
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Ventas del mes"
          value={money(data?.monthSales)}
          accent="accent"
        />
        <KpiCard
          icon={<Grid3x3 className="w-4 h-4" />}
          label="Mesas ocupadas"
          value={String(data?.occupied ?? 0)}
          accent="destructive"
        />
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          label="Mesas libres"
          value={String(data?.free ?? 0)}
          accent="success"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="Pedidos pendientes"
          value={String(data?.pending ?? 0)}
          accent="warning"
        />
        <KpiCard
          icon={<ChefHat className="w-4 h-4" />}
          label="En cocina"
          value={String(data?.kitchen ?? 0)}
          accent="info"
        />
      </div>

      <div className="surface-card p-6">
        <h2 className="font-semibold mb-4">Ventas — últimos 7 días</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={data?.chart ?? []}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
              <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
                formatter={(v: number) => money(v)}
              />
              <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "primary" | "accent" | "destructive" | "success" | "warning" | "info";
}) {
  const bg: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
  };
  return (
    <div className="surface-card p-4 transition hover:border-primary/40">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg[accent]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
    </div>
  );
}
