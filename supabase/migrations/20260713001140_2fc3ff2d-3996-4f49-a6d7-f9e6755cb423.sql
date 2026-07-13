
-- ============ FASE 3: Caja, Pagos, Clientes ============

-- Medios de pago
CREATE TYPE public.payment_method AS ENUM ('cash','debit','credit','transfer','mp_qr','other');

-- Estado de caja
CREATE TYPE public.register_status AS ENUM ('open','closed');

-- ============ CLIENTES ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  document TEXT,
  notes TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read customers" ON public.customers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write customers" ON public.customers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Añadir customer_id a orders
ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- ============ CAJA ============
CREATE TABLE public.cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by UUID REFERENCES auth.users(id),
  closed_by UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_amount NUMERIC(12,2),
  expected_amount NUMERIC(12,2),
  difference NUMERIC(12,2),
  status public.register_status NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read registers" ON public.cash_registers FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write registers" ON public.cash_registers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_cash_registers_updated BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Solo una caja abierta a la vez
CREATE UNIQUE INDEX uq_one_open_register ON public.cash_registers ((1)) WHERE status = 'open';

-- Movimientos manuales de caja (retiros, gastos, aportes)
CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  register_id UUID NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read cashmov" ON public.cash_movements FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write cashmov" ON public.cash_movements FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- ============ PAGOS ============
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  register_id UUID REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  method public.payment_method NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read payments" ON public.payments FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff write payments" ON public.payments FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_payments_register ON public.payments(register_id);

-- ============ FUNCIONES ============

-- Devuelve la caja abierta (si existe)
CREATE OR REPLACE FUNCTION public.current_open_register()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.cash_registers WHERE status='open' LIMIT 1 $$;

-- Al insertar pago, actualiza fidelización y asigna la caja abierta si falta
CREATE OR REPLACE FUNCTION public.after_payment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _reg UUID; _cust UUID; _paid NUMERIC; _total NUMERIC;
BEGIN
  -- Asignar caja abierta si no vino
  IF NEW.register_id IS NULL THEN
    SELECT public.current_open_register() INTO _reg;
    IF _reg IS NOT NULL THEN
      UPDATE public.payments SET register_id = _reg WHERE id = NEW.id;
    END IF;
  END IF;

  -- Si la suma de pagos cubre el total, cerrar el pedido
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.payments WHERE order_id = NEW.order_id;
  SELECT total, customer_id INTO _total, _cust FROM public.orders WHERE id = NEW.order_id;

  IF _paid >= _total AND _total > 0 THEN
    UPDATE public.orders
      SET status='paid', closed_at = COALESCE(closed_at, now())
      WHERE id = NEW.order_id AND status <> 'paid';

    -- Fidelización: 1 punto cada $100, sumar visita y total gastado (una sola vez)
    IF _cust IS NOT NULL THEN
      UPDATE public.customers
        SET points = points + FLOOR(_total/100)::int,
            total_spent = total_spent + _total,
            visits = visits + 1
        WHERE id = _cust;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_after_payment_insert AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.after_payment_insert();

-- Calcular esperado en caja al cerrar
CREATE OR REPLACE FUNCTION public.close_cash_register(_id UUID, _closing NUMERIC, _notes TEXT DEFAULT NULL)
RETURNS public.cash_registers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _opening NUMERIC; _sales_cash NUMERIC; _mov_in NUMERIC; _mov_out NUMERIC; _expected NUMERIC; _rec public.cash_registers;
BEGIN
  SELECT opening_amount INTO _opening FROM public.cash_registers WHERE id=_id AND status='open';
  IF _opening IS NULL THEN RAISE EXCEPTION 'Caja no encontrada o ya cerrada'; END IF;

  SELECT COALESCE(SUM(amount),0) INTO _sales_cash FROM public.payments WHERE register_id=_id AND method='cash';
  SELECT COALESCE(SUM(amount),0) INTO _mov_in FROM public.cash_movements WHERE register_id=_id AND direction='in';
  SELECT COALESCE(SUM(amount),0) INTO _mov_out FROM public.cash_movements WHERE register_id=_id AND direction='out';
  _expected := _opening + _sales_cash + _mov_in - _mov_out;

  UPDATE public.cash_registers SET
    status='closed',
    closed_at=now(),
    closed_by=auth.uid(),
    closing_amount=_closing,
    expected_amount=_expected,
    difference=_closing - _expected,
    notes=COALESCE(_notes, notes)
  WHERE id=_id RETURNING * INTO _rec;
  RETURN _rec;
END $$;

-- Transferir todos los ítems de una mesa a otra (mueve el pedido abierto)
CREATE OR REPLACE FUNCTION public.transfer_order(_from_table UUID, _to_table UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src UUID; _dst UUID;
BEGIN
  IF _from_table = _to_table THEN RAISE EXCEPTION 'Mesa origen y destino iguales'; END IF;
  SELECT id INTO _src FROM public.orders WHERE table_id=_from_table AND status IN ('open','sent') ORDER BY opened_at DESC LIMIT 1;
  IF _src IS NULL THEN RAISE EXCEPTION 'La mesa origen no tiene pedido activo'; END IF;
  SELECT id INTO _dst FROM public.orders WHERE table_id=_to_table AND status IN ('open','sent') ORDER BY opened_at DESC LIMIT 1;

  IF _dst IS NULL THEN
    -- Simplemente reasignar el pedido
    UPDATE public.orders SET table_id=_to_table WHERE id=_src;
    UPDATE public.restaurant_tables SET status='occupied' WHERE id=_to_table;
    UPDATE public.restaurant_tables SET status='free' WHERE id=_from_table;
    RETURN _src;
  ELSE
    -- Unir: mover ítems y pagos al destino, cerrar origen
    UPDATE public.order_items SET order_id=_dst WHERE order_id=_src;
    UPDATE public.payments SET order_id=_dst WHERE order_id=_src;
    UPDATE public.orders SET status='cancelled', closed_at=now(), notes=COALESCE(notes,'')||' (unida a otra mesa)' WHERE id=_src;
    UPDATE public.restaurant_tables SET status='free' WHERE id=_from_table;
    RETURN _dst;
  END IF;
END $$;

-- Dividir cuenta: crea un nuevo pedido en la misma mesa con los ítems indicados
CREATE OR REPLACE FUNCTION public.split_order(_order_id UUID, _item_ids UUID[])
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new UUID; _table UUID; _waiter UUID;
BEGIN
  IF array_length(_item_ids,1) IS NULL THEN RAISE EXCEPTION 'Seleccioná al menos un ítem'; END IF;
  SELECT table_id, waiter_id INTO _table, _waiter FROM public.orders WHERE id=_order_id;
  INSERT INTO public.orders (table_id, waiter_id, status, type)
    VALUES (_table, _waiter, 'open', 'dine_in') RETURNING id INTO _new;
  UPDATE public.order_items SET order_id=_new WHERE id = ANY(_item_ids) AND order_id=_order_id;
  RETURN _new;
END $$;

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_registers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
