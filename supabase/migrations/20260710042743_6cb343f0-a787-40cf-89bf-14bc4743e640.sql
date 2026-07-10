
CREATE TYPE public.app_role AS ENUM ('admin','encargado','mozo','caja','cocina');
CREATE TYPE public.table_shape AS ENUM ('square','round','rectangle');
CREATE TYPE public.table_status AS ENUM ('free','occupied','reserved','cleaning');
CREATE TYPE public.order_type AS ENUM ('dine_in','takeaway','delivery');
CREATE TYPE public.order_status AS ENUM ('open','sent','paid','cancelled');
CREATE TYPE public.item_status AS ENUM ('pending','preparing','ready','delivered','cancelled');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT, email TEXT, avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id,email,full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id);
$$;
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.assign_first_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'mozo') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_profile_created_assign_role AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_first_admin();

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT DEFAULT '#22d3ee',
  icon TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read" ON public.categories FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "categories_write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21,
  prep_time_minutes INT NOT NULL DEFAULT 10,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read" ON public.products FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "products_write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_category ON public.products(category_id);

CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL UNIQUE,
  seats INT NOT NULL DEFAULT 4,
  shape public.table_shape NOT NULL DEFAULT 'square',
  pos_x NUMERIC NOT NULL DEFAULT 40,
  pos_y NUMERIC NOT NULL DEFAULT 40,
  width NUMERIC NOT NULL DEFAULT 90,
  height NUMERIC NOT NULL DEFAULT 90,
  status public.table_status NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;
GRANT ALL ON public.restaurant_tables TO service_role;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_read" ON public.restaurant_tables FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "tables_write" ON public.restaurant_tables FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_tables_updated BEFORE UPDATE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code SERIAL,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  waiter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type public.order_type NOT NULL DEFAULT 'dine_in',
  status public.order_status NOT NULL DEFAULT 'open',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_read" ON public.orders FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "orders_write" ON public.orders FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_orders_table ON public.orders(table_id);
CREATE INDEX idx_orders_status ON public.orders(status);
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  qty NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 21,
  status public.item_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  sent_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_read" ON public.order_items FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "items_write" ON public.order_items FOR ALL TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_items_order ON public.order_items(order_id);
CREATE INDEX idx_items_status ON public.order_items(status);
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.recalc_order_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _oid UUID; _sub NUMERIC; _tax NUMERIC;
BEGIN
  _oid := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(qty*unit_price),0),
         COALESCE(SUM(qty*unit_price*tax_rate/100),0)
    INTO _sub, _tax FROM public.order_items WHERE order_id=_oid AND status<>'cancelled';
  UPDATE public.orders SET subtotal=_sub, tax=_tax, total=_sub+_tax WHERE id=_oid;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_order_totals();

CREATE TABLE public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'encargado'));

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(user_id, action, table_name, record_id, data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME,
          COALESCE((NEW).id::text, (OLD).id::text),
          to_jsonb(COALESCE(NEW, OLD)));
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_audit();
CREATE TRIGGER audit_tables AFTER INSERT OR UPDATE OR DELETE ON public.restaurant_tables FOR EACH ROW EXECUTE FUNCTION public.log_audit();
