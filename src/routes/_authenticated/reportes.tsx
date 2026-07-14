import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({ meta: [{ title: "Reportes — GastroPOS" }] }),
  component: ReportesPage,
});

const COLORS = ["#0891b2", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function ReportesPage() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));

  const fromTs = `${from}T00:00:00`;
  const toTs = `${to}T23:59:59`;

  const { data: paidOrders = [] } = useQuery({
    queryKey: ["rep-orders", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,total,closed_at,waiter_id,table_id")
        .eq("status", "paid")
        .gte("closed_at", fromTs)
        .lte("closed_at", toTs);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["rep-items", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_id,product_name,qty,unit_price,modifiers_total,status,order_id,orders!inner(status,closed_at)")
        .neq("status", "cancelled")
        .eq("orders.status", "paid")
        .gte("orders.closed_at", fromTs)
        .lte("orders.closed_at", toTs);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["rep-pay", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("method,amount,created_at")
        .gte("created_at", fromTs)
        .lte("created_at", toTs);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["rep-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name")).data ?? [],
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["rep-tables"],
    queryFn: async () => (await supabase.from("restaurant_tables").select("id,number")).data ?? [],
  });

  // Rentabilidad: costo estimado por producto
  const { data: productCosts = [] } = useQuery({
    queryKey: ["rep-costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_ingredients")
        .select("product_id,qty,unit,ingredients(cost,unit)");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data as any[]) ?? []) {
        const ing = row.ingredients;
        if (!ing) continue;
        // simple: same unit assumed; otherwise skip conversion factor
        const factor =
          row.unit === ing.unit
            ? 1
            : row.unit === "g" && ing.unit === "kg"
              ? 1 / 1000
              : row.unit === "kg" && ing.unit === "g"
                ? 1000
                : row.unit === "ml" && ing.unit === "l"
                  ? 1 / 1000
                  : row.unit === "l" && ing.unit === "ml"
                    ? 1000
                    : 1;
        map.set(row.product_id, (map.get(row.product_id) ?? 0) + row.qty * factor * (ing.cost ?? 0));
      }
      return Array.from(map.entries()).map(([product_id, cost]) => ({ product_id, cost }));
    },
  });
  const costByProduct = useMemo(
    () => new Map(productCosts.map((p) => [p.product_id, p.cost])),
    [productCosts],
  );

  // KPIs
  const totalSales = paidOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const orderCount = paidOrders.length;
  const avgTicket = orderCount ? totalSales / orderCount : 0;

  // Ventas por día
  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of paidOrders) {
      const d = (o.closed_at ?? "").slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + Number(o.total ?? 0));
    }
    return Array.from(m.entries()).sort().map(([date, total]) => ({ date: date.slice(5), total }));
  }, [paidOrders]);

  // Ventas por hora
  const byHour = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, total: 0 }));
    for (const o of paidOrders) {
      const h = new Date(o.closed_at as string).getHours();
      arr[h].total += Number(o.total ?? 0);
    }
    return arr;
  }, [paidOrders]);

  // Ventas por mozo
  const byWaiter = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of paidOrders) {
      const k = o.waiter_id ?? "—";
      m.set(k, (m.get(k) ?? 0) + Number(o.total ?? 0));
    }
    const names = new Map(profiles.map((p: any) => [p.id, p.full_name]));
    return Array.from(m.entries())
      .map(([id, total]) => ({ name: (names.get(id) as string) ?? "Sin asignar", total }))
      .sort((a, b) => b.total - a.total);
  }, [paidOrders, profiles]);

  // Ventas por mesa
  const byTable = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of paidOrders) {
      const k = o.table_id ?? "—";
      m.set(k, (m.get(k) ?? 0) + Number(o.total ?? 0));
    }
    const nums = new Map(tables.map((t: any) => [t.id, t.number]));
    return Array.from(m.entries())
      .map(([id, total]) => ({ name: `Mesa ${nums.get(id) ?? "-"}`, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [paidOrders, tables]);

  // Pagos por método
  const byMethod = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.method, (m.get(p.method) ?? 0) + Number(p.amount ?? 0));
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [payments]);

  // Productos: top/bottom + rentabilidad
  const productAgg = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    for (const it of items) {
      const key = it.product_id ?? it.product_name;
      const cur = m.get(key) ?? { name: it.product_name, qty: 0, revenue: 0, cost: 0 };
      const qty = Number(it.qty ?? 0);
      cur.qty += qty;
      cur.revenue += qty * Number(it.unit_price ?? 0) + Number(it.modifiers_total ?? 0);
      cur.cost += qty * (costByProduct.get(it.product_id) ?? 0);
      m.set(key, cur);
    }
    return Array.from(m.values()).map((r) => ({
      ...r,
      margin: r.revenue - r.cost,
      marginPct: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
    }));
  }, [items, costByProduct]);

  const topProducts = [...productAgg].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const bottomProducts = [...productAgg].filter((p) => p.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 10);
  const byMargin = [...productAgg].sort((a, b) => b.margin - a.margin).slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reportes de ventas</h1>
          <p className="text-sm text-muted-foreground">Análisis del período seleccionado</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => { setFrom(iso(monthAgo)); setTo(iso(today)); }}>Últimos 30d</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} label="Ventas totales" value={money(totalSales)} accent="text-primary" />
        <Kpi icon={Receipt} label="Pedidos cobrados" value={String(orderCount)} />
        <Kpi icon={TrendingUp} label="Ticket promedio" value={money(avgTicket)} />
        <Kpi icon={TrendingDown} label="Productos vendidos" value={String(productAgg.reduce((s, p) => s + p.qty, 0))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Ventas por día</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(v: number) => money(v)} />
              <Line type="monotone" dataKey="total" stroke="#0891b2" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Ventas por hora</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byHour}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="total" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Ventas por mozo</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byWaiter} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="total" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Pagos por método</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byMethod} dataKey="value" nameKey="name" outerRadius={90} label>
                {byMethod.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ProductTable title="Top productos (unidades)" rows={topProducts} />
        <ProductTable title="Menos vendidos" rows={bottomProducts} />
        <ProductTable title="Mayor margen" rows={byMargin} showMargin />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold mb-3">Top mesas</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={byTable}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(v: number) => money(v)} />
            <Bar dataKey="total" fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, accent }: any) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${accent ?? "text-primary"}`} />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function ProductTable({ title, rows, showMargin }: { title: string; rows: any[]; showMargin?: boolean }) {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-1 text-sm">
        {rows.length === 0 && <div className="text-muted-foreground text-xs">Sin datos</div>}
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between border-b py-1 last:border-0">
            <span className="truncate mr-2">{r.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {showMargin ? `${money(r.margin)} (${r.marginPct.toFixed(0)}%)` : `${r.qty} · ${money(r.revenue)}`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
