-- =========================================================================
-- ClickZone Phase 4 — RLS policies + auth_role() helper + owner/staff views
-- Target: STAGING ttaexrsipmwxhciisufc (replayable at cutover).
-- Security model = plan §3.2 Option A: base tables owner-only; staff read
-- cost-free views only. Single transaction.
-- (Test users are seeded separately — NOT in this file.)
-- =========================================================================
BEGIN;

-- 1) Role helper — SECURITY DEFINER so policies reading it don't recurse on profiles' RLS
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.auth_role() FROM public;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated, anon, service_role;

-- 2) RLS on every table
ALTER TABLE public.phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 3) Drop EVERY existing policy on public tables (name-agnostic clean slate)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 4) Owner = full CRUD everywhere
CREATE POLICY phones_owner_all      ON public.phones      FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY accessories_owner_all ON public.accessories FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY sales_owner_all       ON public.sales       FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY returns_owner_all     ON public.returns     FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY exchanges_owner_all   ON public.exchanges   FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY services_owner_all    ON public.services    FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY stores_owner_all      ON public.stores      FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY audit_owner_all       ON public.audit_log   FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');

-- 5) phone_costs + customers = OWNER ONLY (read + write)
CREATE POLICY phone_costs_owner_all ON public.phone_costs FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
CREATE POLICY customers_owner_all   ON public.customers   FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');

-- 6) Staff = INSERT on sales only (checkout). DELETE stays owner-only (sales_owner_all).
CREATE POLICY sales_staff_insert ON public.sales FOR INSERT TO authenticated WITH CHECK (public.auth_role()='staff');

-- 7) profiles: each user reads own row; owner manages all
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_owner_all ON public.profiles FOR ALL TO authenticated USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');

-- 8) Cost-free public views (staff + owner) ----------------------------------
CREATE OR REPLACE VIEW public.v_phones_public AS
SELECT id, imei, serial_number, device_type, model, storage, color, condition,
       battery_health, icloud_status, target_sale_price, status, date_added,
       is_deleted, store_id, source, ram, notes, exchange_id
FROM public.phones WHERE is_deleted = false;

CREATE OR REPLACE VIEW public.v_accessories_public AS
SELECT sku, name, quantity, sale_price, category, brand, variant, min_stock_level, store_id, is_deleted
FROM public.accessories WHERE is_deleted = false;

CREATE OR REPLACE VIEW public.v_sales_public AS
SELECT id, bill_id, customer_whatsapp,
       COALESCE((SELECT jsonb_agg(e - 'costPrice') FROM jsonb_array_elements(items) e),'[]'::jsonb) AS items,
       total_revenue, total_discount, date, time, is_deleted,
       return_status, total_refunded, exchange_id, trade_in_value, net_payable,
       payment_method, store_id, customer_id, sold_by, notes
FROM public.sales WHERE is_deleted = false;

-- 9) Owner-only views with cost/profit (self-gated by auth_role) --------------
CREATE OR REPLACE VIEW public.v_phones_full AS
SELECT p.*, c.cost_price, (p.target_sale_price - c.cost_price) AS expected_profit
FROM public.phones p LEFT JOIN public.phone_costs c ON c.phone_id = p.id
WHERE public.auth_role() = 'owner';

CREATE OR REPLACE VIEW public.v_sales_profit AS
SELECT s.id, s.bill_id, s.date, s.time, s.total_revenue, s.total_discount,
       s.trade_in_value, s.net_payable, s.payment_method, s.store_id, s.sold_by, s.items,
       COALESCE((SELECT sum((e->>'costPrice')::numeric * COALESCE((e->>'quantity')::numeric,1))
                 FROM jsonb_array_elements(s.items) e),0) AS cogs,
       s.total_revenue - COALESCE((SELECT sum((e->>'costPrice')::numeric * COALESCE((e->>'quantity')::numeric,1))
                 FROM jsonb_array_elements(s.items) e),0) AS gross_profit
FROM public.sales s
WHERE public.auth_role() = 'owner' AND s.is_deleted = false;

-- 10) View grants: authenticated only (no pre-login anon)
REVOKE ALL ON public.v_phones_public, public.v_accessories_public, public.v_sales_public,
              public.v_phones_full, public.v_sales_profit FROM anon;
GRANT SELECT ON public.v_phones_public, public.v_accessories_public, public.v_sales_public,
                public.v_phones_full, public.v_sales_profit TO authenticated;

COMMIT;
