
-- ============================================================
-- 1) MODIFICADORES POR ITEM
-- ============================================================
CREATE TYPE public.modifier_action AS ENUM ('exclude', 'extra');

CREATE TABLE public.order_item_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  action public.modifier_action NOT NULL,
  qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit public.ingredient_unit,
  price_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_modifiers TO authenticated;
GRANT ALL ON public.order_item_modifiers TO service_role;

ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage modifiers"
ON public.order_item_modifiers FOR ALL
TO authenticated
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_oim_updated BEFORE UPDATE ON public.order_item_modifiers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_oim_item ON public.order_item_modifiers(order_item_id);

-- ============================================================
-- 2) RECALCULO DE TOTALES CON MODIFICADORES
-- ============================================================
-- Añadir columna modifiers_total al order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS modifiers_total NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Función que recalcula el modifiers_total de un item
CREATE OR REPLACE FUNCTION public.recalc_item_modifiers_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _iid UUID; _sum NUMERIC;
BEGIN
  _iid := COALESCE(NEW.order_item_id, OLD.order_item_id);
  SELECT COALESCE(SUM(price_delta),0) INTO _sum
    FROM public.order_item_modifiers WHERE order_item_id = _iid;
  UPDATE public.order_items SET modifiers_total = _sum WHERE id = _iid;
  RETURN NULL;
END; $$;

CREATE TRIGGER trg_oim_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.order_item_modifiers
FOR EACH ROW EXECUTE FUNCTION public.recalc_item_modifiers_total();

-- Reemplazar recalc_order_totals para incluir modifiers_total
CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _oid UUID; _sub NUMERIC; _tax NUMERIC;
BEGIN
  _oid := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(qty*unit_price + COALESCE(modifiers_total,0)),0),
         COALESCE(SUM((qty*unit_price + COALESCE(modifiers_total,0))*tax_rate/100),0)
    INTO _sub, _tax
    FROM public.order_items
    WHERE order_id=_oid AND status<>'cancelled';
  UPDATE public.orders SET subtotal=_sub, tax=_tax, total=_sub+_tax WHERE id=_oid;
  RETURN NULL;
END; $$;

-- ============================================================
-- 3) DESCUENTO DE STOCK RESPETANDO MODIFICADORES
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stock_for_item(_item_id uuid, _qty numeric, _reverse boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  _converted NUMERIC;
  _delta NUMERIC;
  _mov_type public.stock_movement_type;
  _excluded BOOLEAN;
BEGIN
  _mov_type := CASE WHEN _reverse THEN 'return'::public.stock_movement_type ELSE 'sale'::public.stock_movement_type END;

  -- 1) Ingredientes de la receta (no opcionales, no excluidos por modificador)
  FOR r IN
    SELECT pi.ingredient_id, pi.qty AS recipe_qty, pi.unit AS recipe_unit,
           i.unit AS ing_unit, i.name AS ing_name
    FROM public.order_items oi
    JOIN public.product_ingredients pi ON pi.product_id = oi.product_id
    JOIN public.ingredients i ON i.id = pi.ingredient_id
    WHERE oi.id = _item_id AND COALESCE(pi.optional, false) = false
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.order_item_modifiers m
      WHERE m.order_item_id = _item_id
        AND m.ingredient_id = r.ingredient_id
        AND m.action = 'exclude'
    ) INTO _excluded;
    IF _excluded THEN CONTINUE; END IF;

    _converted := public.convert_unit(r.recipe_qty * _qty, r.recipe_unit, r.ing_unit);
    IF _converted IS NULL THEN
      RAISE NOTICE 'Unidades incompatibles para ingrediente %', r.ing_name;
      CONTINUE;
    END IF;
    _delta := CASE WHEN _reverse THEN _converted ELSE -_converted END;

    UPDATE public.ingredients SET stock = COALESCE(stock,0) + _delta WHERE id = r.ingredient_id;
    INSERT INTO public.stock_movements(ingredient_id, movement_type, qty, order_item_id, note)
    VALUES (r.ingredient_id, _mov_type, _delta, _item_id,
            CASE WHEN _reverse THEN 'Devolución por cancelación' ELSE 'Consumo por venta' END);
  END LOOP;

  -- 2) Extras agregados por modificador
  FOR r IN
    SELECT m.ingredient_id, m.qty AS mod_qty, m.unit AS mod_unit,
           i.unit AS ing_unit, i.name AS ing_name
    FROM public.order_item_modifiers m
    JOIN public.ingredients i ON i.id = m.ingredient_id
    WHERE m.order_item_id = _item_id AND m.action = 'extra' AND m.qty > 0
  LOOP
    _converted := public.convert_unit(r.mod_qty * _qty, COALESCE(r.mod_unit, r.ing_unit), r.ing_unit);
    IF _converted IS NULL THEN CONTINUE; END IF;
    _delta := CASE WHEN _reverse THEN _converted ELSE -_converted END;
    UPDATE public.ingredients SET stock = COALESCE(stock,0) + _delta WHERE id = r.ingredient_id;
    INSERT INTO public.stock_movements(ingredient_id, movement_type, qty, order_item_id, note)
    VALUES (r.ingredient_id, _mov_type, _delta, _item_id,
            CASE WHEN _reverse THEN 'Devolución extra' ELSE 'Extra por modificador' END);
  END LOOP;
END; $$;

-- ============================================================
-- 4) COMPRAS A PROVEEDORES
-- ============================================================
CREATE TYPE public.purchase_status AS ENUM ('draft', 'received', 'cancelled');

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.purchase_status NOT NULL DEFAULT 'received',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage purchases" ON public.purchases FOR ALL
TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_purchases_updated BEFORE UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  unit public.ingredient_unit NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;

ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage purchase items" ON public.purchase_items FOR ALL
TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_pi_purchase ON public.purchase_items(purchase_id);
CREATE INDEX idx_pi_ingredient ON public.purchase_items(ingredient_id);

-- Trigger: al ingresar item de compra recibida => sumar stock, recalcular costo promedio ponderado, registrar movimiento
CREATE OR REPLACE FUNCTION public.apply_purchase_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status public.purchase_status;
  _ing RECORD;
  _added NUMERIC;       -- cantidad en la unidad del ingrediente
  _old_stock NUMERIC;
  _old_cost NUMERIC;
  _new_stock NUMERIC;
  _new_cost NUMERIC;
  _sub_total NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO _status FROM public.purchases WHERE id = NEW.purchase_id;
    IF _status <> 'received' THEN RETURN NEW; END IF;

    SELECT id, unit, COALESCE(stock,0) AS stock, COALESCE(cost,0) AS cost
      INTO _ing FROM public.ingredients WHERE id = NEW.ingredient_id;

    _added := public.convert_unit(NEW.qty, NEW.unit, _ing.unit);
    IF _added IS NULL THEN
      RAISE EXCEPTION 'Unidades incompatibles (compra en % vs ingrediente en %)', NEW.unit, _ing.unit;
    END IF;

    _old_stock := _ing.stock;
    _old_cost := _ing.cost;
    _new_stock := _old_stock + _added;

    -- Costo unitario en la unidad del ingrediente
    IF _added > 0 THEN
      DECLARE _cost_per_ing_unit NUMERIC;
      BEGIN
        _cost_per_ing_unit := (NEW.qty * NEW.unit_cost) / _added;
        IF _new_stock > 0 THEN
          _new_cost := ((_old_stock * _old_cost) + (_added * _cost_per_ing_unit)) / _new_stock;
        ELSE
          _new_cost := _cost_per_ing_unit;
        END IF;
      END;
    ELSE
      _new_cost := _old_cost;
    END IF;

    UPDATE public.ingredients
      SET stock = _new_stock,
          cost = _new_cost
      WHERE id = NEW.ingredient_id;

    INSERT INTO public.stock_movements(ingredient_id, movement_type, qty, note)
    VALUES (NEW.ingredient_id, 'purchase', _added,
            'Compra ' || NEW.purchase_id::text);

    -- Actualizar total de la compra
    _sub_total := NEW.qty * NEW.unit_cost;
    UPDATE public.purchases
      SET total = COALESCE(total,0) + _sub_total
      WHERE id = NEW.purchase_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_apply_purchase_item
AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_item();
