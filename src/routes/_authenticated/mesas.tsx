import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Move, Settings2, Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mesas")({
  head: () => ({ meta: [{ title: "Mesas — GastroPOS" }] }),
  component: MesasPage,
});

type Table = {
  id: string;
  number: number;
  seats: number;
  shape: "square" | "round" | "rectangle";
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  status: "free" | "occupied" | "reserved" | "cleaning";
};

const STATUS_LABEL: Record<Table["status"], string> = {
  free: "Libre",
  occupied: "Ocupada",
  reserved: "Reservada",
  cleaning: "Limpieza",
};

function MesasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Table | null>(null);

  const { data: tables = [] } = useQuery({
    queryKey: ["tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .order("number");
      if (error) throw error;
      return data as Table[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("tables-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_tables" },
        () => qc.invalidateQueries({ queryKey: ["tables"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  async function updateTable(id: string, patch: Partial<Table>) {
    const { error } = await supabase.from("restaurant_tables").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function createTable() {
    const nextNumber = (tables.reduce((m, t) => Math.max(m, t.number), 0) || 0) + 1;
    const { error } = await supabase.from("restaurant_tables").insert({
      number: nextNumber,
      seats: 4,
      shape: "square",
      pos_x: 40,
      pos_y: 40,
      width: 90,
      height: 90,
    });
    if (error) toast.error(error.message);
    else toast.success(`Mesa ${nextNumber} creada`);
  }

  async function deleteTable(id: string) {
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Mesa eliminada");
    setEditing(null);
  }

  async function openOrder(t: Table) {
    // Buscar orden abierta o crear
    const { data: existing } = await supabase
      .from("orders")
      .select("id")
      .eq("table_id", t.id)
      .in("status", ["open", "sent"])
      .maybeSingle();

    if (existing) {
      navigate({ to: "/pedidos/$tableId", params: { tableId: t.id } });
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("orders").insert({
      table_id: t.id,
      waiter_id: u.user?.id,
      type: "dine_in",
      status: "open",
    });
    if (error) return toast.error(error.message);
    await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", t.id);
    navigate({ to: "/pedidos/$tableId", params: { tableId: t.id } });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Salón</h1>
          <p className="text-muted-foreground text-sm">
            {editMode
              ? "Modo edición: arrastrá para mover, esquina inferior derecha para redimensionar."
              : "Tocá una mesa para abrir su pedido."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            onClick={() => setEditMode((v) => !v)}
          >
            <Settings2 className="w-4 h-4" />
            {editMode ? "Salir edición" : "Editar plano"}
          </Button>
          {editMode && (
            <Button onClick={createTable}>
              <Plus className="w-4 h-4" />
              Nueva mesa
            </Button>
          )}
        </div>
      </div>

      <Legend />

      <div className="surface-card relative overflow-auto min-h-[560px]">
        <div
          className="relative"
          style={{
            width: 1200,
            height: 700,
            backgroundImage:
              "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            backgroundColor: "color-mix(in oklab, var(--color-background) 60%, transparent)",
          }}
        >
          {tables.map((t) => (
            <TableNode
              key={t.id}
              table={t}
              editMode={editMode}
              onCommit={(patch) => updateTable(t.id, patch)}
              onOpen={() => openOrder(t)}
              onEdit={() => setEditing(t)}
            />
          ))}
        </div>
      </div>

      <EditTableDialog
        table={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => editing && updateTable(editing.id, patch)}
        onDelete={() => editing && deleteTable(editing.id)}
      />
    </div>
  );
}

function Legend() {
  const items: { label: string; color: string }[] = [
    { label: "Libre", color: "var(--color-table-free)" },
    { label: "Ocupada", color: "var(--color-table-occupied)" },
    { label: "Reservada", color: "var(--color-table-reserved)" },
    { label: "Limpieza", color: "var(--color-table-cleaning)" },
  ];
  return (
    <div className="flex gap-4 text-xs">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: i.color, boxShadow: `0 0 12px ${i.color}` }}
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}

function TableNode({
  table,
  editMode,
  onCommit,
  onOpen,
  onEdit,
}: {
  table: Table;
  editMode: boolean;
  onCommit: (patch: Partial<Table>) => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: table.pos_x, y: table.pos_y });
  const [size, setSize] = useState({ w: table.width, h: table.height });

  useEffect(() => {
    setPos({ x: Number(table.pos_x), y: Number(table.pos_y) });
    setSize({ w: Number(table.width), h: Number(table.height) });
  }, [table.pos_x, table.pos_y, table.width, table.height]);

  const bg =
    table.status === "free"
      ? "var(--color-table-free)"
      : table.status === "occupied"
      ? "var(--color-table-occupied)"
      : table.status === "reserved"
      ? "var(--color-table-reserved)"
      : "var(--color-table-cleaning)";

  function startDrag(e: React.MouseEvent) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...pos };
    const move = (ev: MouseEvent) => {
      setPos({
        x: Math.max(0, origin.x + ev.clientX - startX),
        y: Math.max(0, origin.y + ev.clientY - startY),
      });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const finalPos = {
        x: Math.max(0, origin.x + ev.clientX - startX),
        y: Math.max(0, origin.y + ev.clientY - startY),
      };
      onCommit({ pos_x: finalPos.x, pos_y: finalPos.y });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...size };
    const move = (ev: MouseEvent) => {
      setSize({
        w: Math.max(50, origin.w + ev.clientX - startX),
        h: Math.max(50, origin.h + ev.clientY - startY),
      });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const finalSize = {
        w: Math.max(50, origin.w + ev.clientX - startX),
        h: Math.max(50, origin.h + ev.clientY - startY),
      };
      onCommit({ width: finalSize.w, height: finalSize.h });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  const shapeStyle: React.CSSProperties =
    table.shape === "round"
      ? { borderRadius: "50%" }
      : { borderRadius: table.shape === "rectangle" ? 12 : 10 };

  return (
    <div
      ref={ref}
      onClick={() => (editMode ? onEdit() : onOpen())}
      onMouseDown={startDrag}
      className="absolute flex flex-col items-center justify-center text-primary-foreground font-semibold cursor-pointer transition-shadow select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        background: bg,
        boxShadow: `0 0 20px -4px ${bg}`,
        border: "2px solid color-mix(in oklab, white 20%, transparent)",
        ...shapeStyle,
      }}
    >
      <div className="text-xl leading-none">{table.number}</div>
      <div className="text-[10px] opacity-90">{table.seats} pers.</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80">
        {STATUS_LABEL[table.status]}
      </div>
      {editMode && (
        <>
          <span className="absolute top-1 left-1 opacity-70">
            <Move className="w-3 h-3" />
          </span>
          <span
            onMouseDown={startResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize bg-black/40"
            style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
          />
        </>
      )}
    </div>
  );
}

function EditTableDialog({
  table,
  onClose,
  onSave,
  onDelete,
}: {
  table: Table | null;
  onClose: () => void;
  onSave: (patch: Partial<Table>) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<Table | null>(table);
  useEffect(() => setForm(table), [table]);

  if (!table || !form) return null;

  return (
    <Dialog open={!!table} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar mesa #{table.number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Número</Label>
              <Input
                type="number"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Personas</Label>
              <Input
                type="number"
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma</Label>
              <Select
                value={form.shape}
                onValueChange={(v) => setForm({ ...form, shape: v as Table["shape"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="square">Cuadrada</SelectItem>
                  <SelectItem value="round">Redonda</SelectItem>
                  <SelectItem value="rectangle">Rectangular</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as Table["status"] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Libre</SelectItem>
                  <SelectItem value="occupied">Ocupada</SelectItem>
                  <SelectItem value="reserved">Reservada</SelectItem>
                  <SelectItem value="cleaning">En limpieza</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ancho</Label>
              <Input
                type="number"
                value={form.width}
                onChange={(e) => setForm({ ...form, width: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alto</Label>
              <Input
                type="number"
                value={form.height}
                onChange={(e) => setForm({ ...form, height: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
            Eliminar
          </Button>
          <Button
            onClick={() => {
              onSave({
                number: form.number,
                seats: form.seats,
                shape: form.shape,
                status: form.status,
                width: form.width,
                height: form.height,
              });
              onClose();
            }}
          >
            <Edit3 className="w-4 h-4" />
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// silence lint for unused import in this file
export const _DialogTrigger = DialogTrigger;
