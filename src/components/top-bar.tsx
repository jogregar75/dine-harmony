import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function TopBar() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const qc = useQueryClient();

  const { data: role } = useQuery({
    queryKey: ["my-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data?.role ?? null;
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const now = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 flex items-center justify-between">
      <div className="text-sm text-muted-foreground capitalize hidden sm:block">{now}</div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium leading-tight">{user?.email}</div>
          {role && (
            <div className="text-[10px] uppercase tracking-wider text-primary">{role}</div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
