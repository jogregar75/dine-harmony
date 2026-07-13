import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Wallet, Play, Square, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import { money, dateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/caja")({
  head: () => ({ meta: [{ title: "Caja — GastroPOS" }] }),
  component: CajaPage,
});

type Register = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  status: "open" | "closed";
  notes: string | null;
};
type Movement = {
  id: string;
  register_id: string;
  direction: "in" | "out";
  amount: number;
  reason: string | null;
  created_at: string;
};
type Payment = {
  id: string;
  register_id: string | null;
  method: "cash" | "debit" | "credit" | "transfer" | "mp_qr" | "other";
  amount: number;
  order_id: string;
  reference: string | null;
  created_at: string;
};

const METHOD_LABEL: Record<Payment["method"], string> = {
  cash: "Efectivo", debit: "Débito", credit: "Crédito",
  transfer: "Transferencia", mp_qr: "MP / QR", other: "Otro",
};

function CajaPage() {
  const qc = useQueryClient();
  const [openDlg, setOpenDlg] = useState(false);
  const [closeDlg, setCloseDlg] = useState(false);
  const [movDlg, setMovDlg] = useState<null | "in" | "out">(null);

  const { data: current } = useQuery({
    queryKey: ["current-register"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_registers").select("*").eq("status", "open")
        .maybeSingle();
      return (data as Register | null) ?? null;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["registers-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_registers").select("*")
        .order("opened_at", { ascending: false }).limit(20);
      return (data ?? []) as Register[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["movements", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_movements").select("*")
        .eq("register_id", current!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Movement[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments").select("*")
        .eq("register_id", current!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Payment[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("caja")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_registers" },
        () => { qc.invalidateQueries({ queryKey: ["current-register"] }); qc.invalidateQueries({ queryKey: ["registers-history"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" },
        () => qc.invalidateQueries({ queryKey: ["movements"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },
        () => qc.invalidateQueries({ queryKey: ["payments"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Totales por método
  const totals = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount);
    return acc;
  }, {});
  const salesTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const cashSales = totals.cash ?? 0;
  const movIn = movements.filter((m) => m.direction === "in").reduce((s, m) => s + Number(m.amount), 0);
  const movOut = movements.filter((m) => m.direction === "out").reduce((s, m) => s + Number(m.amount), 0);
  const expected = Number(current?.opening_amount ?? 0) + cashSales + movIn - movOut;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" /> Caja
          </h1>
          <p className="text-muted-foreground text-sm">
            Apertura, movimientos, pagos del turno y arqueo al cierre.
          </p>
        </div>
        {current ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMovDlg("in")}>
              <ArrowDownRight className="w-4 h-4 text-success" /> Ingreso
            </Button>
            <Button variant="outline" onClick={() => setMovDlg("out")}>
              <ArrowUpRight className="w-4 h-4 text-destructive" /> Retiro / Gasto
            </Button>
            <Button variant="destructive" onClick={() => setCloseDlg(true)}>
              <Square className="w-4 h-4" /> Cerrar caja
            </Button>
          </div>
        ) : (
          <Button onClick={() => setOpenDlg(true)}>
            <Play className="w-4 h-4" /> Abrir caja
          </Button>
        )}
      </div>

      {current ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Apertura" value={money(Number(current.opening_amount))} />
            <KPI label="Ventas del turno" value={money(salesTotal)} highlight />
            <KPI label="Movimientos +/-" value={`${money(movIn)} / ${money(movOut)}`} />
            <KPI label="Efectivo esperado" value={money(expected)} highlight />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(Object.keys(METHOD_LABEL) as Payment["method"][]).map((m) => (
              <div key={m} className="surface-card p-3 text-center">
                <div className="text-[10px] uppercase text-muted-foreground">
                  {METHOD_LABEL[m]}
                </div>
                <div className="font-bold text-sm">{money(totals[m] ?? 0)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title={`Movimientos (${movements.length})`}>
              {movements.length === 0 && <Empty text="Sin movimientos manuales." />}
              {movements.map((m) => (
                <Row key={m.id}
                  left={
                    <div className="flex items-center gap-2">
                      {m.direction === "in"
                        ? <ArrowDownRight className="w-4 h-4 text-success" />
                        : <ArrowUpRight className="w-4 h-4 text-destructive" />}
                      <span className="text-sm">{m.reason ?? "—"}</span>
                    </div>
                  }
                  right={
                    <div className="text-right">
                      <div className={"font-semibold text-sm " + (m.direction === "in" ? "text-success" : "text-destructive")}>
                        {m.direction === "in" ? "+" : "-"}{money(Number(m.amount))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{dateTime(m.created_at)}</div>
                    </div>
                  } />
              ))}
            </Panel>

            <Panel title={`Pagos (${payments.length})`}>
              {payments.length === 0 && <Empty text="Sin cobros aún." />}
              {payments.map((p) => (
                <Row key={p.id}
                  left={
                    <div>
                      <div className="text-sm font-medium">{METHOD_LABEL[p.method]}</div>
                      <div className="text-[10px] text-muted-foreground">{dateTime(p.created_at)}</div>
                    </div>
                  }
                  right={<div className="font-semibold text-sm">{money(Number(p.amount))}</div>} />
              ))}
            </Panel>
          </div>
        </>
      ) : (
        <div className="surface-card p-8 text-center text-muted-foreground">
          No hay caja abierta. Abrí una para empezar a cobrar.
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-2">Historial de turnos</h2>
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-2">Apertura</th>
                <th className="text-left p-2">Cierre</th>
                <th className="text-right p-2">Inicial</th>
                <th className="text-right p-2">Esperado</th>
                <th className="text-right p-2">Contado</th>
                <th className="text-right p-2">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2">{dateTime(r.opened_at)}</td>
                  <td className="p-2">{r.closed_at ? dateTime(r.closed_at) : "— (abierta)"}</td>
                  <td className="p-2 text-right">{money(Number(r.opening_amount))}</td>
                  <td className="p-2 text-right">{r.expected_amount != null ? money(Number(r.expected_amount)) : "—"}</td>
                  <td className="p-2 text-right">{r.closing_amount != null ? money(Number(r.closing_amount)) : "—"}</td>
                  <td className={"p-2 text-right font-semibold " +
                    (r.difference == null ? "" : Number(r.difference) < 0 ? "text-destructive" : Number(r.difference) > 0 ? "text-success" : "")}>
                    {r.difference != null ? money(Number(r.difference)) : "—"}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin historial.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <OpenDialog open={openDlg} onClose={() => setOpenDlg(false)} />
      <CloseDialog open={closeDlg} onClose={() => setCloseDlg(false)} register={current ?? null} expected={expected} />
      <MovementDialog dir={movDlg} onClose={() => setMovDlg(null)} registerId={current?.id ?? null} />
    </div>
  );
}

function KPI({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={"surface-card p-3 " + (highlight ? "border-primary/40" : "")}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-bold text-lg">{value}</div>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card">
      <div className="p-3 border-b border-border font-semibold text-sm">{title}</div>
      <div className="max-h-[360px] overflow-auto divide-y divide-border">{children}</div>
    </div>
  );
}
function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="p-3 flex items-center justify-between gap-2">{left}{right}</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-muted-foreground text-sm">{text}</div>;
}

function OpenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");
  async function submit() {
    const opening = Number(amount);
    if (isNaN(opening) || opening < 0) return toast.error("Monto inválido");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("cash_registers").insert({
      opening_amount: opening, opened_by: u.user?.id, notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Caja abierta");
    qc.invalidateQueries({ queryKey: ["current-register"] });
    setAmount("0"); setNotes(""); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Abrir caja</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Monto inicial en efectivo</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}><Play className="w-4 h-4" /> Abrir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  open, onClose, register, expected,
}: { open: boolean; onClose: () => void; register: Register | null; expected: number }) {
  const qc = useQueryClient();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => { if (open) { setCounted(expected.toFixed(2)); setNotes(""); } }, [open, expected]);
  async function submit() {
    if (!register) return;
    const closing = Number(counted);
    if (isNaN(closing) || closing < 0) return toast.error("Monto inválido");
    const { error } = await supabase.rpc("close_cash_register", {
      _id: register.id, _closing: closing, _notes: notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Caja cerrada");
    qc.invalidateQueries({ queryKey: ["current-register"] });
    qc.invalidateQueries({ queryKey: ["registers-history"] });
    onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cerrar caja / arqueo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="surface-card p-3">
            <div className="text-xs text-muted-foreground">Efectivo esperado</div>
            <div className="text-2xl font-bold">{money(expected)}</div>
          </div>
          <div><Label>Efectivo contado</Label>
            <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} /></div>
          <div><Label>Notas del cierre</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}><Square className="w-4 h-4" /> Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({
  dir, onClose, registerId,
}: { dir: null | "in" | "out"; onClose: () => void; registerId: string | null }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  async function submit() {
    if (!registerId || !dir) return;
    const a = Number(amount);
    if (isNaN(a) || a <= 0) return toast.error("Monto inválido");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("cash_movements").insert({
      register_id: registerId, direction: dir, amount: a,
      reason: reason || null, created_by: u.user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Movimiento registrado");
    qc.invalidateQueries({ queryKey: ["movements"] });
    setAmount(""); setReason(""); onClose();
  }
  return (
    <Dialog open={!!dir} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dir === "in" ? "Ingreso a caja" : "Retiro / gasto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Monto</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Motivo</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={dir === "in" ? "Ej: aporte del dueño" : "Ej: pago proveedor"} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}><Plus className="w-4 h-4" /> Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Utilizado sólo para tipado — evita import no usado en algunos entornos
export const _Select = Select;
export const _SelectContent = SelectContent;
export const _SelectItem = SelectItem;
export const _SelectTrigger = SelectTrigger;
export const _SelectValue = SelectValue;
