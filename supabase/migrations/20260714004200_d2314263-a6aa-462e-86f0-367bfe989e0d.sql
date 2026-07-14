-- Fase 4: Configuración del restaurante
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  restaurant_name TEXT NOT NULL DEFAULT 'Mi Restaurante',
  address TEXT,
  phone TEXT,
  tax_id TEXT,
  currency TEXT NOT NULL DEFAULT 'ARS',
  default_tax_rate NUMERIC NOT NULL DEFAULT 21,
  tip_suggestion NUMERIC NOT NULL DEFAULT 10,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "admin manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Permitir a admins leer el audit_log completo (la policy actual solo permite ver los propios)
DROP POLICY IF EXISTS "admin read audit" ON public.audit_log;
CREATE POLICY "admin read audit" ON public.audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));