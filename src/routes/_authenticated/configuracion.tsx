import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { dateTime } from "@/lib/format";
import { Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({ meta: [{ title: "Configuración — GastroPOS" }] }),
  component: ConfigPage,
});

type Settings = {
  restaurant_name: string;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  currency: string;
  default_tax_rate: number;
  tip_suggestion: number;
  logo_url: string | null;
};

function ConfigPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (settings) setForm(settings as any); }, [settings]);

  const save = async () => {
    if (!form) return;
    const { error } = await supabase.from("app_settings").update(form).eq("id", true);
    if (error) return toast.error(error.message);
    toast.success("Configuración guardada");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos del restaurante y auditoría del sistema</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="audit">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="p-6 space-y-4 max-w-2xl">
            {!form ? (
              <div className="text-muted-foreground">Cargando...</div>
            ) : (
              <>
                <Field label="Nombre del restaurante">
                  <Input value={form.restaurant_name} onChange={(e) => setForm({ ...form, restaurant_name: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Dirección">
                    <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  </Field>
                  <Field label="Teléfono">
                    <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="CUIT / Tax ID">
                    <Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                  </Field>
                  <Field label="Moneda">
                    <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ARS">ARS - Peso argentino</SelectItem>
                        <SelectItem value="USD">USD - Dólar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="CLP">CLP - Peso chileno</SelectItem>
                        <SelectItem value="MXN">MXN - Peso mexicano</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="IVA por defecto (%)">
                    <Input type="number" step="0.01" value={form.default_tax_rate}
                      onChange={(e) => setForm({ ...form, default_tax_rate: Number(e.target.value) })} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Sugerencia de propina (%)">
                    <Input type="number" step="0.01" value={form.tip_suggestion}
                      onChange={(e) => setForm({ ...form, tip_suggestion: Number(e.target.value) })} />
                  </Field>
                  <Field label="Logo (URL)">
                    <Input value={form.logo_url ?? ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
                  </Field>
                </div>
                <div className="pt-2">
                  <Button onClick={save}><Save className="w-4 h-4 mr-2" />Guardar cambios</Button>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>;
}

function AuditPanel() {
  const [table, setTable] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: logs = [] } = useQuery({
    queryKey: ["audit", table, action],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("id,user_id,action,table_name,record_id,created_at,profiles:user_id(full_name,email)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (table !== "all") q = q.eq("table_name", table);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const tables = useMemo(() => Array.from(new Set(logs.map((l) => l.table_name))).sort(), [logs]);
  const filtered = logs.filter((l) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      l.table_name?.toLowerCase().includes(s) ||
      l.action?.toLowerCase().includes(s) ||
      l.profiles?.full_name?.toLowerCase().includes(s) ||
      l.profiles?.email?.toLowerCase().includes(s) ||
      l.record_id?.toLowerCase().includes(s)
    );
  });

  const actionColor = (a: string) =>
    a === "INSERT" ? "default" : a === "UPDATE" ? "secondary" : "destructive";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label>Tabla</Label>
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Acción</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="INSERT">INSERT</SelectItem>
              <SelectItem value="UPDATE">UPDATE</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label>Buscar</Label>
          <Input placeholder="Usuario, tabla, id..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2">Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Tabla</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">{dateTime(l.created_at)}</td>
                <td>{l.profiles?.full_name ?? l.profiles?.email ?? l.user_id?.slice(0, 8) ?? "sistema"}</td>
                <td><Badge variant={actionColor(l.action) as any}>{l.action}</Badge></td>
                <td className="font-mono text-xs">{l.table_name}</td>
                <td className="font-mono text-xs text-muted-foreground">{l.record_id?.slice(0, 8)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
