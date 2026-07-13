import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Users, Plus, Star, Trash2, Edit3, Search } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — GastroPOS" }] }),
  component: ClientesPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  points: number;
  total_spent: number;
  visits: number;
  active: boolean;
};

function ClientesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*").order("name");
      return (data ?? []) as Customer[];
    },
  });

  const filtered = customers.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  async function remove(id: string) {
    if (!confirm("¿Eliminar cliente?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Cliente eliminado");
      qc.invalidateQueries({ queryKey: ["customers"] });
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 text-primary" /> Clientes
          </h1>
          <p className="text-muted-foreground text-sm">
            Gestión de clientes y programa de fidelidad (1 punto cada $100).
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" /> Nuevo cliente
        </Button>
      </div>

      <div className="surface-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, teléfono o email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border-0 focus-visible:ring-0"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((c) => (
          <div key={c.id} className="surface-card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.phone ?? "—"} · {c.email ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-1 text-accent font-semibold text-sm">
                <Star className="w-4 h-4" />
                {c.points}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
              <Stat label="Visitas" value={String(c.visits)} />
              <Stat label="Gastado" value={money(Number(c.total_spent))} />
              <Stat label="Doc" value={c.document ?? "—"} />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full surface-card p-12 text-center text-muted-foreground">
            No hay clientes.
          </div>
        )}
      </div>

      <CustomerDialog
        open={creating}
        onClose={() => setCreating(false)}
        initial={null}
      />
      <CustomerDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
      />
      {/* silence unused */}
      <DialogTrigger asChild><span className="hidden" /></DialogTrigger>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-semibold text-xs truncate">{value}</div>
    </div>
  );
}

function CustomerDialog({
  open, onClose, initial,
}: { open: boolean; onClose: () => void; initial: Customer | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    document: initial?.document ?? "",
    notes: initial?.notes ?? "",
  });

  // reset on open change
  if (open && initial && form.name === "" && initial.name) {
    setForm({
      name: initial.name,
      phone: initial.phone ?? "",
      email: initial.email ?? "",
      document: initial.document ?? "",
      notes: initial.notes ?? "",
    });
  }

  async function save() {
    if (!form.name.trim()) return toast.error("El nombre es obligatorio");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      document: form.document.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error } = initial
      ? await supabase.from("customers").update(payload).eq("id", initial.id)
      : await supabase.from("customers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(initial ? "Cliente actualizado" : "Cliente creado");
    qc.invalidateQueries({ queryKey: ["customers"] });
    setForm({ name: "", phone: "", email: "", document: "", notes: "" });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Documento</Label>
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
