-- ===================================================================
-- ClickZone Phase 8b — duplicate-IMEI re-entry / revive-vs-new (Issue #4 pt.2 +
-- Phase-5 follow-up #1). Target: STAGING ttaexrsipmwxhciisufc. Replayable at cutover.
--   1) find_phone_by_identifier(text)  — owner-only lookup by imei/serial across all rows
--   2) upsert_phone: UPDATE path now sets is_deleted (so revive un-deletes)
--   3) checkout trade-in: revive a prior sold/soft-deleted unit instead of inserting a dup
-- Cost always lives in phone_costs; never written onto phones.
-- ===================================================================
BEGIN;

-- 1) Lookup: is this identifier active (true dup), a prior non-active unit (revive), or new?
CREATE OR REPLACE FUNCTION public.find_phone_by_identifier(identifier text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row phones%rowtype;
BEGIN
  IF public.auth_role() <> 'owner' THEN RAISE EXCEPTION 'find_phone_by_identifier: owner only'; END IF;
  IF identifier IS NULL OR btrim(identifier) = '' THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO v_row FROM phones
    WHERE (imei = identifier OR serial_number = identifier) AND is_deleted = false AND status = 'in-stock'
    LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('found',true,'active',true,'id',v_row.id,'status',v_row.status,
      'is_deleted',v_row.is_deleted,'date_added',v_row.date_added,'model',v_row.model,'device_type',v_row.device_type);
  END IF;

  SELECT * INTO v_row FROM phones
    WHERE (imei = identifier OR serial_number = identifier) AND (is_deleted = true OR status <> 'in-stock')
    ORDER BY local_updated_at DESC NULLS LAST LIMIT 1;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('found',true,'active',false,'id',v_row.id,'status',v_row.status,
      'is_deleted',v_row.is_deleted,'date_added',v_row.date_added,'model',v_row.model,'device_type',v_row.device_type);
  END IF;

  RETURN jsonb_build_object('found', false);
END $$;
REVOKE ALL ON FUNCTION public.find_phone_by_identifier(text) FROM public;
GRANT EXECUTE ON FUNCTION public.find_phone_by_identifier(text) TO authenticated;

-- 2) upsert_phone: allow revive (un-delete) via is_deleted in the UPDATE path.
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
      device_type       = coalesce(payload->>'device_type', device_type),
      is_deleted        = coalesce((payload->>'is_deleted')::boolean, is_deleted),
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

-- 3) checkout: trade-in revives a prior sold/soft-deleted unit (no duplicate row).
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
  v_old_cost int; v_revived boolean := false;
  v_total_rev int := coalesce((payload->>'total_revenue')::int, 0);
  v_total_disc int := coalesce((payload->>'total_discount')::int, 0);
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'checkout: not authorized (role=%)', coalesce(v_role,'none'); END IF;
  v_store := coalesce((payload->>'store_id')::uuid, (SELECT store_id FROM profiles WHERE id=v_uid),
                      'a0000000-0000-4000-8000-000000000001'::uuid);

  FOR v_item IN SELECT e FROM jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) AS e LOOP
    IF (v_item->>'type')='phone' THEN
      SELECT id INTO v_phone_id FROM phones
        WHERE imei=(v_item->>'identifier') AND is_deleted=false AND status='in-stock' FOR UPDATE;
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

  IF v_ti IS NOT NULL AND v_ti <> 'null'::jsonb THEN
    v_trade_val := coalesce((v_ti->>'valuation')::numeric,0);
    IF EXISTS (SELECT 1 FROM phones WHERE imei = v_ti->>'imei' AND is_deleted=false AND status='in-stock') THEN
      RAISE EXCEPTION 'Trade-in IMEI % is currently active in stock', v_ti->>'imei';
    END IF;
    -- Revive a prior sold/soft-deleted unit with this IMEI (no duplicate).
    SELECT id INTO v_ingested_id FROM phones
      WHERE imei = v_ti->>'imei' AND (is_deleted = true OR status <> 'in-stock')
      ORDER BY local_updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
    IF v_ingested_id IS NOT NULL THEN
      SELECT cost_price INTO v_old_cost FROM phone_costs WHERE phone_id = v_ingested_id;
      UPDATE phones SET status='in-stock', is_deleted=false, source='trade-in',
        model = coalesce(v_ti->>'model', model),
        condition = coalesce(v_ti->>'condition', condition),
        battery_health = coalesce((v_ti->>'battery_health')::int, battery_health),
        target_sale_price = coalesce((v_ti->>'resale_price')::int, target_sale_price),
        store_id = v_store, local_updated_at = now()::text
        WHERE id = v_ingested_id;
      INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_trade_val)::int)
        ON CONFLICT (phone_id) DO UPDATE SET cost_price=EXCLUDED.cost_price;
      IF v_old_cost IS DISTINCT FROM round(v_trade_val)::int THEN
        INSERT INTO audit_log (actor,action,entity,detail)
        VALUES (v_uid,'phone_costs.update',v_ingested_id,
          jsonb_build_object('reason','checkout trade-in revive','old_cost',v_old_cost,'new_cost',round(v_trade_val)::int,'imei',v_ti->>'imei'));
      END IF;
      v_revived := true;
    ELSE
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

  RETURN jsonb_build_object('sale_id',v_sale_id,'bill_id',v_bill_id,'ingested_phone_id',v_ingested_id,
      'exchange_id',v_exchange_id,'trade_in_revived',v_revived);
END $$;

COMMIT;