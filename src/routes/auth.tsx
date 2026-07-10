import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UtensilsCrossed, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingresar — GastroPOS" },
      { name: "description", content: "Accedé a tu panel del restaurante." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("¡Bienvenido!");
    navigate({ to: "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/dashboard",
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Cuenta creada. Revisá tu email si es necesario.");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel visual */}
      <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden bg-sidebar">
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative z-10 max-w-md text-sidebar-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center glow-primary">
              <UtensilsCrossed className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold">GastroPOS</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            La operación de tu restaurante,{" "}
            <span className="text-primary">en tiempo real</span>.
          </h1>
          <p className="text-muted-foreground text-lg">
            Mesas, pedidos, cocina y carta. Todo en un único panel diseñado
            para la velocidad del servicio.
          </p>
          <ul className="mt-8 space-y-2 text-sm text-sidebar-foreground/80">
            <li>• Plano de salón editable con drag &amp; drop</li>
            <li>• Kitchen Display sincronizado en vivo</li>
            <li>• Carta con imágenes, IVA y disponibilidad</li>
            <li>• Auditoría automática de cada operación</li>
          </ul>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold">GastroPOS</span>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Ingresar</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input
                    id="si-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@restaurante.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pass">Contraseña</Label>
                  <Input
                    id="si-pass"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Ingresar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Nombre completo</Label>
                  <Input
                    id="su-name"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input
                    id="su-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pass">Contraseña</Label>
                  <Input
                    id="su-pass"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear cuenta
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  El primer usuario registrado será el administrador.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
