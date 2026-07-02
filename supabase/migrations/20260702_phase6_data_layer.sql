-- ===================================================================
-- ClickZone Phase 6 — data-layer DB helpers. Target: STAGING ttaexrsipmwxhciisufc.
-- Owner listing views (with cost) + upsert_phone RPC (phones + phone_costs atomic).
-- Replayable at cutover. NOTE: v_sales_profit is DROP+CREATE (column set changed),
-- so its grant is re-applied below.
-- ===================================================================
BEGIN;

-- Owner phone view: active only, with cost + expected profit
CREATE OR REPLACE VIEW public.v_phones_full AS
SELECT p.*, c.cost_price, (p.target_sale_price - c.cost_price) AS expected_profit
FROM public.phones p LEFT JOIN public.phone_costs c ON c.phone_id = p.id
WHERE public.auth_role() = 'owner' AND p.is_deleted = false;

-- Owner accessories view (WITH cost) — keeps ALL listings on views
CREATE OR REPLACE VIEW public.v_accessories_full AS
SELECT a.*
FROM public.accessories a
WHERE public.auth_role() = 'owner' AND a.is_deleted = false;

-- Owner sales view: ALL columns (items retain costPrice) + cogs / gross_profit
DROP VIEW IF EXISTS public.v_sales_profit;
CREATE VIEW public.v_sales_profit AS
SELECT s.*,
  COALESCE((SELECT sum((e->>'costPrice')::numeric * COALESCE((e->>'quantity')::numeric,1))
            FROM jsonb_array_elements(s.items) e),0) AS cogs,
  s.total_revenue - COALESCE((SELECT sum((e->>'costPrice')::numeric * COALESCE((e->>'quantity')::numeric,1))
            FROM jsonb_array_elements(s.items) e),0) AS gross_profit
FROM public.sales s
WHERE public.auth_role() = 'owner' AND s.is_deleted = false;

REVOKE ALL ON public.v_accessories_full, public.v_sales_profit FROM anon;
GRANT SELECT ON public.v_accessories_full, public.v_sales_profit TO authenticated;

-- upsert_phone: owner-only atomic write to phones + phone_costs
CREATE OR REPLACE FUNCTION public.upsert_phone(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id text := payload->>'id'; v_store uuid; v_exists boolean;
BEGIN
  IF public.auth_role() <> 'owner' THEN RAISE EXCEPTION 'upsert_phone: owner only'; END IF;
  IF v_id IS NULL OR v_id = '' THEN v_id := 'p' || (extract(epoch from now())*1000)::bigint::text; END IF;
  v_store := coalesce((payload->>'store_id')::uuid, (SELECT store_id FROM profiles WHERE id=auth.uid()),
                      'a0000000-0000-4000-8000-000000000001'::uuid);
  SELECT EXISTS(SELECT 1 FROM phones WHERE id = v_id) INTO v_exists;
  IF v_exists THEN
    UPDATE phones SET
      imei              = payload->>'imei',
      serial_number     = payload->>'serial_number',
      model             = coalesce(payload->>'model', model),
      storage           = coalesce(payload->>'storage', storage),
      color             = coalesce(payload->>'color', color),
      condition         = coalesce(payload->>'condition', condition),
      battery_health    = coalesce((payload->>'battery_health')::int, battery_health),
      icloud_status     = coalesce(payload->>'icloud_status', icloud_status),
      target_sale_price = coalesce((payload->>'target_sale_price')::int, target_sale_price),
      status            = coalesce(payload->>'status', status),
      source            = coalesce(payload->>'source', source),
      local_updated_at  = now()::text
    WHERE id = v_id;
  ELSE
    INSERT INTO phones (id,imei,serial_number,model,storage,color,condition,battery_health,icloud_status,
        target_sale_price,status,date_added,is_deleted,local_updated_at,source,device_type,store_id)
    VALUES (v_id, payload->>'imei', payload->>'serial_number', payload->>'model', coalesce(payload->>'storage',''),
        coalesce(payload->>'color',''), coalesce(payload->>'condition','a'), coalesce((payload->>'battery_health')::int,100),
        coalesce(payload->>'icloud_status','clean'), coalesce((payload->>'target_sale_price')::int,0),
        coalesce(payload->>'status','in-stock'),
        coalesce(payload->>'date_added', to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYYY-MM-DD')),
        false, now()::text, coalesce(payload->>'source','purchased'), coalesce(payload->>'device_type','phone'), v_store);
  END IF;
  INSERT INTO phone_costs (phone_id, cost_price) VALUES (v_id, coalesce((payload->>'cost_price')::int,0))
    ON CONFLICT (phone_id) DO UPDATE SET cost_price = EXCLUDED.cost_price;
  RETURN jsonb_build_object('id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.upsert_phone(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_phone(jsonb) TO authenticated;

COMMIT;
