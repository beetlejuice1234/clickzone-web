-- ===================================================================
-- ClickZone Phase 7 — multi-store scoping. Target: STAGING ttaexrsipmwxhciisufc.
-- Staff isolation enforced in the DB (staff-facing views + daily_revenue).
-- Owner sees/queries all stores (client-side switcher). Replayable at cutover.
-- ===================================================================
BEGIN;

-- Staff-facing views: only the caller's store (owner sees all).
CREATE OR REPLACE VIEW public.v_phones_public AS
SELECT id, imei, serial_number, device_type, model, storage, color, condition,
       battery_health, icloud_status, target_sale_price, status, date_added,
       is_deleted, store_id, source, ram, notes, exchange_id
FROM public.phones
WHERE is_deleted = false
  AND (store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
       OR public.auth_role() = 'owner');

CREATE OR REPLACE VIEW public.v_accessories_public AS
SELECT sku, name, quantity, sale_price, category, brand, variant, min_stock_level, store_id, is_deleted
FROM public.accessories
WHERE is_deleted = false
  AND (store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
       OR public.auth_role() = 'owner');

CREATE OR REPLACE VIEW public.v_sales_public AS
SELECT id, bill_id, customer_whatsapp,
       COALESCE((SELECT jsonb_agg(e.value - 'costPrice') FROM jsonb_array_elements(sales.items) e(value)), '[]'::jsonb) AS items,
       total_revenue, total_discount, date, "time", is_deleted,
       return_status, total_refunded, exchange_id, trade_in_value, net_payable,
       payment_method, store_id, customer_id, sold_by, notes
FROM public.sales
WHERE is_deleted = false
  AND (store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
       OR public.auth_role() = 'owner');

-- daily_revenue: staff forced to their own store (param ignored); owner may pass any store.
CREATE OR REPLACE FUNCTION public.daily_revenue(store uuid, day date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text := public.auth_role(); v_store uuid; v_total numeric;
BEGIN
  IF v_role IS NULL THEN RAISE EXCEPTION 'daily_revenue: not authenticated'; END IF;
  IF v_role = 'owner' THEN
    v_store := store;
  ELSE
    v_store := (SELECT store_id FROM profiles WHERE id = auth.uid());
  END IF;
  SELECT coalesce(sum(total_revenue),0) INTO v_total FROM sales
   WHERE store_id = v_store AND is_deleted = false AND date = to_char(day,'YYYY-MM-DD');
  RETURN v_total;
END $$;

-- Guard: a staff profile must always have a store_id (else it would see no stock).
-- Owner may have NULL store_id (= all stores). Fail-closed at insert/update.
CREATE OR REPLACE FUNCTION public.enforce_staff_store()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'staff' AND NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'profiles: a staff account must have a store_id (id=%)', NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_staff_store ON public.profiles;
CREATE TRIGGER trg_enforce_staff_store
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_store();

COMMIT;