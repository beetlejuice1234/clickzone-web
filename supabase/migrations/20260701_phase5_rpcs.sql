-- ===================================================================
-- ClickZone Phase 5 — atomic RPC functions. Target: STAGING ttaexrsipmwxhciisufc.
-- Replayable at cutover. All functions SECURITY DEFINER + search_path=public,
-- gated internally by auth_role(), granted to authenticated only.
-- ===================================================================
BEGIN;

-- Support: per-store override PIN hash (for verify_override_pin). Default 4321 (owner changes later).
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS override_pin_hash text;
UPDATE public.stores
   SET override_pin_hash = extensions.crypt('4321', extensions.gen_salt('bf'))
 WHERE id = 'a0000000-0000-4000-8000-000000000001' AND override_pin_hash IS NULL;

-- ---------------- checkout(payload jsonb) --------------------------
CREATE OR REPLACE FUNCTION public.checkout(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role();
  v_uid uuid := auth.uid();
  v_store uuid;
  v_sale_id text; v_bill_id text;
  v_item jsonb; v_items_out jsonb := '[]'::jsonb;
  v_phone_id text; v_cost int;
  v_qty int; v_have int; v_acost int;
  v_ti jsonb := payload->'trade_in';
  v_exchange_id text; v_ingested_id text; v_trade_val numeric := 0;
  v_total_rev int := coalesce((payload->>'total_revenue')::int, 0);
  v_total_disc int := coalesce((payload->>'total_discount')::int, 0);
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'checkout: not authorized (role=%)', coalesce(v_role,'none'); END IF;
  v_store := coalesce((payload->>'store_id')::uuid, (SELECT store_id FROM profiles WHERE id=v_uid),
                      'a0000000-0000-4000-8000-000000000001'::uuid);

  FOR v_item IN SELECT e FROM jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) AS e LOOP
    IF (v_item->>'type')='phone' THEN
      SELECT id INTO v_phone_id FROM phones
        WHERE imei=(v_item->>'identifier') AND is_deleted=false AND status='in-stock' FOR UPDATE;  -- race guard
      IF v_phone_id IS NULL THEN RAISE EXCEPTION 'Phone % is not available (already sold or removed)', (v_item->>'identifier'); END IF;
      SELECT cost_price INTO v_cost FROM phone_costs WHERE phone_id=v_phone_id;
      UPDATE phones SET status='sold', local_updated_at=now()::text WHERE id=v_phone_id;
      v_items_out := v_items_out || jsonb_build_array((v_item - 'costPrice') || jsonb_build_object('costPrice', coalesce(v_cost,0)));
    ELSIF (v_item->>'type')='accessory' THEN
      v_qty := coalesce((v_item->>'quantity')::int,1);
      SELECT quantity, cost_price INTO v_have, v_acost FROM accessories
        WHERE sku=(v_item->>'identifier') AND is_deleted=false FOR UPDATE;
      IF v_have IS NULL THEN RAISE EXCEPTION 'Accessory % not found', (v_item->>'identifier'); END IF;
      IF v_have < v_qty THEN RAISE EXCEPTION 'Accessory % insufficient stock (have %, need %)', (v_item->>'identifier'), v_have, v_qty; END IF;
      UPDATE accessories SET quantity=quantity-v_qty, local_updated_at=now()::text WHERE sku=(v_item->>'identifier');
      v_items_out := v_items_out || jsonb_build_array((v_item - 'costPrice') || jsonb_build_object('costPrice', coalesce(v_acost,0)));
    ELSE
      RAISE EXCEPTION 'Unknown item type: %', (v_item->>'type');
    END IF;
  END LOOP;

  -- Trade-in: ingest phone; cost goes to phone_costs (NOT phones)
  IF v_ti IS NOT NULL AND v_ti <> 'null'::jsonb THEN
    v_trade_val := coalesce((v_ti->>'valuation')::numeric,0);
    v_ingested_id := 'p_'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO phones (id,imei,model,storage,color,condition,battery_health,icloud_status,target_sale_price,
        status,date_added,is_deleted,local_updated_at,source,device_type,store_id)
    VALUES (v_ingested_id, v_ti->>'imei', coalesce(v_ti->>'model','Trade-in'), coalesce(v_ti->>'storage',''),
        coalesce(v_ti->>'color',''), coalesce(v_ti->>'condition','used-good'), coalesce((v_ti->>'battery_health')::int,0),
        'clean', coalesce((v_ti->>'resale_price')::int,0), 'in-stock',
        to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYYY-MM-DD'), false, now()::text, 'trade-in','phone', v_store);
    INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_trade_val)::int)
      ON CONFLICT (phone_id) DO UPDATE SET cost_price=EXCLUDED.cost_price;
  END IF;

  v_sale_id := 's_'||replace(gen_random_uuid()::text,'-','');
  v_bill_id := 'CZ-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,6));
  INSERT INTO sales (id,bill_id,customer_whatsapp,items,total_revenue,total_discount,date,time,is_deleted,
      local_updated_at,payment_method,store_id,sold_by,customer_id,trade_in_value,net_payable)
  VALUES (v_sale_id, v_bill_id, payload->>'customer_whatsapp', v_items_out, v_total_rev, v_total_disc,
      to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYYY-MM-DD'), to_char((now() AT TIME ZONE 'Asia/Colombo'),'HH24:MI'),
      false, now()::text, coalesce(payload->>'payment_method','cash'), v_store, v_uid,
      (payload->>'customer_id')::uuid, v_trade_val, v_total_rev - v_trade_val);

  IF v_ti IS NOT NULL AND v_ti <> 'null'::jsonb THEN
    v_exchange_id := 'e_'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO exchanges (id,sale_id,exchange_type,trade_in_imei,trade_in_model,trade_in_valuation,
        trade_in_condition,trade_in_battery_health,trade_in_notes,ingested_phone_id,customer_name,customer_nic,
        customer_whatsapp,store_id,is_deleted)
    VALUES (v_exchange_id, v_sale_id, 'trade-in', v_ti->>'imei', v_ti->>'model', v_trade_val, v_ti->>'condition',
        (v_ti->>'battery_health')::int, v_ti->>'notes', v_ingested_id, v_ti->>'customer_name', v_ti->>'customer_nic',
        v_ti->>'customer_whatsapp', v_store, false);
    UPDATE sales SET exchange_id=v_exchange_id WHERE id=v_sale_id;
  END IF;

  RETURN jsonb_build_object('sale_id',v_sale_id,'bill_id',v_bill_id,'ingested_phone_id',v_ingested_id,'exchange_id',v_exchange_id);
END $$;

-- ---------------- return_item(payload jsonb) -----------------------
CREATE OR REPLACE FUNCTION public.return_item(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role(); v_uid uuid := auth.uid();
  v_sale sales%rowtype; v_store uuid;
  v_rid text; v_return_id text; v_exchange_id text;
  v_type text := coalesce(payload->>'return_type','return');
  v_dir text := payload->>'difference_direction';
  v_restock boolean := coalesce((payload->>'restock')::boolean, true);
  v_qty int := coalesce((payload->>'quantity')::int,1);
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'return_item: not authorized'; END IF;
  SELECT * INTO v_sale FROM sales WHERE id=payload->>'original_sale_id' AND is_deleted=false FOR UPDATE;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Original sale % not found', payload->>'original_sale_id'; END IF;
  v_store := coalesce((payload->>'store_id')::uuid, v_sale.store_id);

  IF v_type='trade-in-return' AND (v_dir IS NULL OR v_dir NOT IN ('refunded','store-credit','customer-paid','zeroed')) THEN
    RAISE EXCEPTION 'trade-in-return requires difference_direction in (refunded, store-credit, customer-paid, zeroed)';
  END IF;

  IF (payload->>'item_type')='phone' AND v_restock THEN
    UPDATE phones SET status='in-stock', is_deleted=false, local_updated_at=now()::text WHERE imei=payload->>'identifier';
  ELSIF (payload->>'item_type')='accessory' AND v_restock THEN
    UPDATE accessories SET quantity=quantity+v_qty, local_updated_at=now()::text WHERE sku=payload->>'identifier';
  END IF;

  v_rid := 'r_'||replace(gen_random_uuid()::text,'-','');
  v_return_id := 'RET-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
  INSERT INTO returns (id,return_id,original_sale_id,original_bill_id,item_type,imei,sku,quantity,refund_amount,
      reason,reason_notes,condition_on_return,refund_method,customer_whatsapp,store_id,processed_by,return_date,restocked,notes,is_deleted)
  VALUES (v_rid, v_return_id, v_sale.id, v_sale.bill_id, payload->>'item_type',
      CASE WHEN payload->>'item_type'='phone' THEN payload->>'identifier' END,
      CASE WHEN payload->>'item_type'='accessory' THEN payload->>'identifier' END,
      v_qty, coalesce((payload->>'refund_amount')::real,0), payload->>'reason', payload->>'reason_notes',
      payload->>'condition_on_return', payload->>'refund_method', payload->>'customer_whatsapp', v_store, v_uid, now(), v_restock,
      coalesce(payload->>'notes','') || CASE WHEN v_type='trade-in-return'
        THEN ' [trade-in-return dir='||v_dir||' delta='||coalesce(payload->>'price_delta','0')||']' ELSE '' END,
      false);

  UPDATE sales SET return_status='returned',
      total_refunded = coalesce(total_refunded,0) + coalesce((payload->>'refund_amount')::real,0),
      local_updated_at=now()::text
    WHERE id=v_sale.id;

  IF v_type='trade-in-return' THEN     -- record the delta to the chosen category
    v_exchange_id := 'e_'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO exchanges (id,sale_id,exchange_type,cash_difference,difference_direction,store_id,is_deleted,trade_in_notes)
    VALUES (v_exchange_id, v_sale.id, 'trade-in-return', coalesce((payload->>'price_delta')::real,0), v_dir, v_store, false, 'return='||v_return_id);
  END IF;

  RETURN jsonb_build_object('return_id',v_return_id,'exchange_id',v_exchange_id,'difference_direction',v_dir);
END $$;

-- ---------------- phone_swap(payload jsonb) ------------------------
CREATE OR REPLACE FUNCTION public.phone_swap(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role(); v_uid uuid := auth.uid();
  v_out phones%rowtype; v_existing phones%rowtype; v_store uuid;
  v_inc jsonb := payload->'incoming';
  v_val numeric := coalesce((payload->'incoming'->>'valuation')::numeric,0);
  v_imei text := payload->'incoming'->>'imei';
  v_ingested_id text; v_old_cost int; v_exchange_id text; v_revived boolean := false;
BEGIN
  IF v_role <> 'owner' THEN RAISE EXCEPTION 'phone_swap: owner only (role=%)', coalesce(v_role,'none'); END IF;

  SELECT * INTO v_out FROM phones WHERE id=payload->>'outgoing_phone_id' AND is_deleted=false AND status='in-stock' FOR UPDATE;
  IF v_out.id IS NULL THEN RAISE EXCEPTION 'Outgoing phone % not available', payload->>'outgoing_phone_id'; END IF;
  v_store := coalesce((payload->>'store_id')::uuid, v_out.store_id);
  UPDATE phones SET status='sold', local_updated_at=now()::text WHERE id=v_out.id;
  -- DELIBERATELY leave phone_costs for the outgoing phone untouched (keeps original cost).

  SELECT * INTO v_existing FROM phones WHERE imei=v_imei AND (is_deleted=true OR status<>'in-stock')
     ORDER BY local_updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN                      -- previously-sold unit returning: revive + reset cost + log
    v_revived := true; v_ingested_id := v_existing.id;
    SELECT cost_price INTO v_old_cost FROM phone_costs WHERE phone_id=v_ingested_id;
    UPDATE phones SET status='in-stock', is_deleted=false, source='swap',
        condition=coalesce(v_inc->>'condition',condition), battery_health=coalesce((v_inc->>'battery_health')::int,battery_health),
        store_id=v_store, local_updated_at=now()::text WHERE id=v_ingested_id;
    INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_val)::int)
        ON CONFLICT (phone_id) DO UPDATE SET cost_price=EXCLUDED.cost_price;
    INSERT INTO audit_log (actor,action,entity,detail)
    VALUES (v_uid,'phone_costs.update',v_ingested_id, jsonb_build_object('reason','phone_swap revive','old_cost',v_old_cost,'new_cost',round(v_val)::int,'imei',v_imei));
  ELSE
    IF EXISTS (SELECT 1 FROM phones WHERE imei=v_imei AND is_deleted=false AND status='in-stock') THEN
      RAISE EXCEPTION 'Incoming imei % already active in stock', v_imei;
    END IF;
    v_ingested_id := 'p_'||replace(gen_random_uuid()::text,'-','');
    INSERT INTO phones (id,imei,model,storage,color,condition,battery_health,icloud_status,target_sale_price,
        status,date_added,is_deleted,local_updated_at,source,device_type,store_id)
    VALUES (v_ingested_id, v_imei, coalesce(v_inc->>'model','Swap-in'), coalesce(v_inc->>'storage',''),
        coalesce(v_inc->>'color',''), coalesce(v_inc->>'condition','used-good'), coalesce((v_inc->>'battery_health')::int,0),
        'clean', coalesce((v_inc->>'resale_price')::int,0), 'in-stock',
        to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYYY-MM-DD'), false, now()::text, 'swap','phone', v_store);
    INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_val)::int);
  END IF;

  v_exchange_id := 'e_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO exchanges (id,sale_id,exchange_type,trade_in_imei,trade_in_model,trade_in_valuation,trade_in_condition,
      trade_in_battery_health,trade_in_notes,outgoing_phone_id,ingested_phone_id,cash_difference,difference_direction,
      customer_name,customer_nic,customer_whatsapp,store_id,is_deleted)
  VALUES (v_exchange_id, NULL, 'phone-swap', v_imei, v_inc->>'model', v_val, v_inc->>'condition',
      (v_inc->>'battery_health')::int, v_inc->>'notes', v_out.id, v_ingested_id,
      coalesce((payload->>'cash_difference')::real,0), payload->>'difference_direction',
      payload->>'customer_name', payload->>'customer_nic', payload->>'customer_whatsapp', v_store, false);

  RETURN jsonb_build_object('exchange_id',v_exchange_id,'outgoing_phone_id',v_out.id,'ingested_phone_id',v_ingested_id,
      'revived',v_revived,'outgoing_cost_untouched',true);
END $$;

-- ---------------- verify_override_pin(pin text) --------------------
CREATE OR REPLACE FUNCTION public.verify_override_pin(pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_store uuid; v_hash text; v_ok boolean := false;
BEGIN
  IF public.auth_role() IS NULL THEN RAISE EXCEPTION 'verify_override_pin: not authenticated'; END IF;
  v_store := (SELECT store_id FROM profiles WHERE id=v_uid);
  SELECT override_pin_hash INTO v_hash FROM stores WHERE id=v_store;
  IF v_hash IS NOT NULL AND extensions.crypt(pin, v_hash)=v_hash THEN v_ok := true; END IF;
  INSERT INTO audit_log (actor,action,entity,detail)
  VALUES (v_uid,'pin.override', coalesce(v_store::text,'(no store)'), jsonb_build_object('granted',v_ok,'at',now()));
  IF v_ok THEN
    RETURN jsonb_build_object('granted',true,'capability','stock_override','expires_at',(now()+interval '15 minutes'));
  ELSE
    RETURN jsonb_build_object('granted',false);
  END IF;
END $$;

-- ---------------- daily_revenue(store uuid, day date) --------------
CREATE OR REPLACE FUNCTION public.daily_revenue(store uuid, day date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total numeric;
BEGIN
  IF public.auth_role() IS NULL THEN RAISE EXCEPTION 'daily_revenue: not authenticated'; END IF;
  SELECT coalesce(sum(total_revenue),0) INTO v_total FROM sales
   WHERE store_id=store AND is_deleted=false AND date=to_char(day,'YYYY-MM-DD');
  RETURN v_total;   -- single number, no row-level cost
END $$;

-- ---------------- grants: authenticated only -----------------------
REVOKE ALL ON FUNCTION public.checkout(jsonb), public.return_item(jsonb), public.phone_swap(jsonb),
                        public.verify_override_pin(text), public.daily_revenue(uuid,date) FROM public;
GRANT EXECUTE ON FUNCTION public.checkout(jsonb), public.return_item(jsonb), public.phone_swap(jsonb),
                          public.verify_override_pin(text), public.daily_revenue(uuid,date) TO authenticated;

COMMIT;
