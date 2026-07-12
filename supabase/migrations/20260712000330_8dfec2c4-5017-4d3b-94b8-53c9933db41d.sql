
-- Movimientos de stock (historial)
CREATE TYPE public.stock_movement_type AS ENUM ('sale', 'purchase', 'adjustment', 'return');

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  movement_type public.stock_movement_type NOT NULL,
  qty NUMERIC NOT NULL, -- en la unidad base del ingrediente. Positivo=entrada, negativo=salida
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view stock_movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff insert stock_movements" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_stock_movements_ingredient ON public.stock_movements(ingredient_id, created_at DESC);
CREATE INDEX idx_stock_movements_order_item ON public.stock_movements(order_item_id);

-- Conversor de unidades: retorna la cantidad convertida a la unidad destino, o NULL si son incompatibles
CREATE OR REPLACE FUNCTION public.convert_unit(_qty NUMERIC, _from public.ingredient_unit, _to public.ingredient_unit)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _from = _to THEN RETURN _qty; END IF;
  -- peso
  IF _from = 'g'  AND _to = 'kg' THEN RETURN _qty / 1000.0; END IF;
  IF _from = 'kg' AND _to = 'g'  THEN RETURN _qty * 1000.0; END IF;
  -- volumen
  IF _from = 'ml' AND _to = 'l'  THEN RETURN _qty / 1000.0; END IF;
  IF _from = 'l'  AND _to = 'ml' THEN RETURN _qty * 1000.0; END IF;
  RETURN NULL; -- incompatibles
END; $$;

-- Aplica el descuento (o devolución) del stock según la receta del producto
CREATE OR REPLACE FUNCTION public.apply_stock_for_item(_item_id UUID, _qty NUMERIC, _reverse BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  _converted NUMERIC;
  _delta NUMERIC;
  _mov_type public.stock_movement_type;
BEGIN
  _mov_type := CASE WHEN _reverse THEN 'return'::public.stock_movement_type ELSE 'sale'::public.stock_movement_type END;

  FOR r IN
    SELECT pi.ingredient_id, pi.qty AS recipe_qty, pi.unit AS recipe_unit,
           i.unit AS ing_unit, i.name AS ing_name
    FROM public.order_items oi
    JOIN public.product_ingredients pi ON pi.product_id = oi.product_id
    JOIN public.ingredients i ON i.id = pi.ingredient_id
    WHERE oi.id = _item_id AND COALESCE(pi.optional, false) = false
  LOOP
    _converted := public.convert_unit(r.recipe_qty * _qty, r.recipe_unit, r.ing_unit);
    IF _converted IS NULL THEN
      RAISE NOTICE 'Unidades incompatibles para ingrediente % (receta % vs stock %)', r.ing_name, r.recipe_unit, r.ing_unit;
      CONTINUE;
    END IF;

    _delta := CASE WHEN _reverse THEN _converted ELSE -_converted END;

    UPDATE public.ingredients
      SET stock = COALESCE(stock, 0) + _delta
      WHERE id = r.ingredient_id;

    INSERT INTO public.stock_movements(ingredient_id, movement_type, qty, order_item_id, note)
    VALUES (r.ingredient_id, _mov_type, _delta, _item_id,
            CASE WHEN _reverse THEN 'Devolución por cancelación' ELSE 'Consumo por venta' END);
  END LOOP;
END; $$;

-- Trigger sobre order_items: descuenta al entregar; devuelve si se cancela un entregado
CREATE OR REPLACE FUNCTION public.handle_stock_on_item_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- transición hacia delivered => descuento
    IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
      PERFORM public.apply_stock_for_item(NEW.id, NEW.qty, false);
    -- cancelar algo que ya se había entregado => devolución
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'delivered' THEN
      PERFORM public.apply_stock_for_item(NEW.id, OLD.qty, true);
    -- cambio de cantidad tras haber sido entregado => ajustar diferencia
    ELSIF NEW.status = 'delivered' AND OLD.status = 'delivered' AND NEW.qty <> OLD.qty THEN
      PERFORM public.apply_stock_for_item(NEW.id, (NEW.qty - OLD.qty), false);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'delivered' THEN
      PERFORM public.apply_stock_for_item(OLD.id, OLD.qty, true);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_stock_on_item_status ON public.order_items;
CREATE TRIGGER trg_stock_on_item_status
  AFTER UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_stock_on_item_status();
