
-- Unidades de medida
CREATE TYPE public.ingredient_unit AS ENUM ('g','kg','ml','l','u');

-- Proveedores (simple, para asociar a ingredientes)
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Ingredientes
CREATE TABLE public.ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit public.ingredient_unit NOT NULL DEFAULT 'u',
  stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO authenticated;
GRANT ALL ON public.ingredients TO service_role;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read ingredients" ON public.ingredients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage ingredients" ON public.ingredients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));
CREATE TRIGGER trg_ingredients_updated BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ingredients_low_stock ON public.ingredients (stock) WHERE stock <= min_stock;

-- Receta: relación producto ↔ ingrediente con cantidad y unidad usada
CREATE TABLE public.product_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit public.ingredient_unit NOT NULL,
  optional BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, ingredient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_ingredients TO authenticated;
GRANT ALL ON public.product_ingredients TO service_role;
ALTER TABLE public.product_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read recipes" ON public.product_ingredients FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage recipes" ON public.product_ingredients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));
CREATE INDEX idx_product_ingredients_product ON public.product_ingredients (product_id);
CREATE INDEX idx_product_ingredients_ingredient ON public.product_ingredients (ingredient_id);
