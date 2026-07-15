-- Client fix — allow MULTIPLE trade-in items in one sale (phones and/or accessories).
-- Supersedes 20260707_accessory_trade_in. checkout now reads payload.trade_ins (an array); a lone
-- payload.trade_in still works (wrapped into a 1-element array). Net payable = total_revenue − Σ
-- valuations. Each trade-in is ingested into stock (phone revive/create OR accessory add) and gets its
-- own exchanges row. Bill numbering unchanged (plain digits). Staging first, then production.

CREATE OR REPLACE FUNCTION public.checkout(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_role text := public.auth_role();
  v_uid uuid := auth.uid();
  v_store uuid;
  v_sale_id text; v_bill_id text; v_seq bigint;
  v_item jsonb; v_items_out jsonb := '[]'::jsonb;
  v_phone_id text; v_cost int;
  v_qty int; v_have int; v_acost int;
  v_tis jsonb; v_ti jsonb;
  v_ti_type text; v_acc_sku text; v_ti_qty int; v_item_val numeric;
  v_exchange_id text; v_ingested_id text; v_trade_val numeric := 0;
  v_old_cost int; v_revived boolean := false;
  v_total_rev int := coalesce((payload->>'total_revenue')::int, 0);
  v_total_disc int := coalesce((payload->>'total_discount')::int, 0);
  v_cust jsonb := payload->'customer';
  v_customer_id uuid := (payload->>'customer_id')::uuid;
  v_notes text := nullif(payload->>'notes','');
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'checkout: not authorized (role=%)', coalesce(v_role,'none'); END IF;
  v_store := coalesce((payload->>'store_id')::uuid, (SELECT store_id FROM profiles WHERE id=v_uid),
                      'a0000000-0000-4000-8000-000000000001'::uuid);

  IF v_customer_id IS NULL AND v_cust IS NOT NULL AND v_cust <> 'null'::jsonb
     AND (coalesce(v_cust->>'name','')<>'' OR coalesce(v_cust->>'nic','')<>'' OR coalesce(v_cust->>'whatsapp','')<>'') THEN
    IF coalesce(v_cust->>'nic','')<>'' THEN
      SELECT id INTO v_customer_id FROM customers WHERE nic = v_cust->>'nic' LIMIT 1;
    END IF;
    IF v_customer_id IS NULL AND coalesce(v_cust->>'whatsapp','')<>'' THEN
      SELECT id INTO v_customer_id FROM customers WHERE whatsapp = v_cust->>'whatsapp' LIMIT 1;
    END IF;
    IF v_customer_id IS NULL THEN
      v_customer_id := gen_random_uuid();
      INSERT INTO customers (id,name,nic,whatsapp)
        VALUES (v_customer_id, nullif(v_cust->>'name',''), nullif(v_cust->>'nic',''), nullif(v_cust->>'whatsapp',''));
    ELSE
      UPDATE customers SET
        name     = coalesce(nullif(v_cust->>'name',''), name),
        nic      = coalesce(nullif(v_cust->>'nic',''), nic),
        whatsapp = coalesce(nullif(v_cust->>'whatsapp',''), whatsapp)
      WHERE id = v_customer_id;
    END IF;
  END IF;

  -- Sell the cart items (phones out / accessory qty down), snapshotting cost into the items JSON.
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

  -- Collect trade-ins (new array form, or a single legacy trade_in) and pre-sum their valuations.
  v_tis := coalesce(payload->'trade_ins',
    CASE WHEN payload->'trade_in' IS NOT NULL AND payload->'trade_in' <> 'null'::jsonb
         THEN jsonb_build_array(payload->'trade_in') ELSE '[]'::jsonb END);
  SELECT coalesce(sum((e->>'valuation')::numeric),0) INTO v_trade_val FROM jsonb_array_elements(v_tis) e;

  v_sale_id := 's_'||replace(gen_random_uuid()::text,'-','');
  -- Sequential per-store invoice number when configured (atomic; no gap on rollback), else legacy id.
  UPDATE stores SET next_bill_no = next_bill_no + 1
    WHERE id = v_store AND next_bill_no IS NOT NULL
    RETURNING next_bill_no - 1 INTO v_seq;
  IF v_seq IS NOT NULL THEN
    v_bill_id := v_seq::text;
  ELSE
    v_bill_id := 'CZ-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,6));
  END IF;

  INSERT INTO sales (id,bill_id,customer_whatsapp,items,total_revenue,total_discount,date,time,is_deleted,
      local_updated_at,payment_method,store_id,sold_by,customer_id,trade_in_value,net_payable,notes)
  VALUES (v_sale_id, v_bill_id, payload->>'customer_whatsapp', v_items_out, v_total_rev, v_total_disc,
      to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYYY-MM-DD'), to_char((now() AT TIME ZONE 'Asia/Colombo'),'HH24:MI'),
      false, now()::text, coalesce(payload->>'payment_method','cash'), v_store, v_uid,
      v_customer_id, v_trade_val, v_total_rev - v_trade_val, v_notes);

  -- Process each trade-in: add it to stock (phone revive/create OR accessory) + one exchange row.
  FOR v_ti IN SELECT e FROM jsonb_array_elements(v_tis) e LOOP
    v_ti_type := coalesce(v_ti->>'type','phone');
    v_item_val := coalesce((v_ti->>'valuation')::numeric, 0);
    v_ingested_id := null; v_acc_sku := null; v_revived := false;

    IF v_ti_type = 'accessory' THEN
      v_ti_qty := greatest(coalesce((v_ti->>'quantity')::int,1),1);
      v_acc_sku := nullif(v_ti->>'sku','');
      IF v_acc_sku IS NOT NULL AND EXISTS (SELECT 1 FROM accessories WHERE sku=v_acc_sku AND is_deleted=false) THEN
        UPDATE accessories SET quantity = quantity + v_ti_qty, local_updated_at=now()::text WHERE sku=v_acc_sku;
      ELSE
        IF v_acc_sku IS NULL THEN v_acc_sku := 'TRADEIN-'||upper(substr(md5(gen_random_uuid()::text),1,8)); END IF;
        INSERT INTO accessories (sku,name,quantity,cost_price,sale_price,store_id,is_deleted,local_updated_at)
          VALUES (v_acc_sku, coalesce(nullif(v_ti->>'model',''),'Trade-in accessory'), v_ti_qty,
              round(v_item_val/v_ti_qty)::int, 0, v_store, false, now()::text);
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM phones WHERE imei = v_ti->>'imei' AND is_deleted=false AND status='in-stock') THEN
        RAISE EXCEPTION 'Trade-in IMEI % is currently active in stock', v_ti->>'imei';
      END IF;
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
        INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_item_val)::int)
          ON CONFLICT (phone_id) DO UPDATE SET cost_price=EXCLUDED.cost_price;
        IF v_old_cost IS DISTINCT FROM round(v_item_val)::int THEN
          INSERT INTO audit_log (actor,action,entity,detail)
          VALUES (v_uid,'phone_costs.update',v_ingested_id,
            jsonb_build_object('reason','checkout trade-in revive','old_cost',v_old_cost,'new_cost',round(v_item_val)::int,'imei',v_ti->>'imei'));
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
        INSERT INTO phone_costs (phone_id,cost_price) VALUES (v_ingested_id, round(v_item_val)::int)
          ON CONFLICT (phone_id) DO UPDATE SET cost_price=EXCLUDED.cost_price;
      END IF;
    END IF;

    v_exchange_id := 'e_'||replace(gen_random_uuid()::text,'-','');
    IF v_ti_type = 'accessory' THEN
      INSERT INTO exchanges (id,sale_id,exchange_type,trade_in_imei,trade_in_model,trade_in_valuation,
          trade_in_condition,trade_in_notes,ingested_phone_id,customer_name,customer_nic,customer_whatsapp,store_id,is_deleted)
      VALUES (v_exchange_id, v_sale_id, 'accessory-trade-in', v_acc_sku, coalesce(v_ti->>'model','Accessory'),
          v_item_val, v_ti->>'condition', v_ti->>'notes', null, v_ti->>'customer_name', v_ti->>'customer_nic',
          v_ti->>'customer_whatsapp', v_store, false);
    ELSE
      INSERT INTO exchanges (id,sale_id,exchange_type,trade_in_imei,trade_in_model,trade_in_valuation,
          trade_in_condition,trade_in_battery_health,trade_in_notes,ingested_phone_id,customer_name,customer_nic,
          customer_whatsapp,store_id,is_deleted)
      VALUES (v_exchange_id, v_sale_id, 'trade-in', v_ti->>'imei', v_ti->>'model', v_item_val, v_ti->>'condition',
          (v_ti->>'battery_health')::int, v_ti->>'notes', v_ingested_id, v_ti->>'customer_name', v_ti->>'customer_nic',
          v_ti->>'customer_whatsapp', v_store, false);
    END IF;
  END LOOP;

  IF v_exchange_id IS NOT NULL THEN
    UPDATE sales SET exchange_id=v_exchange_id WHERE id=v_sale_id;
  END IF;

  RETURN jsonb_build_object('sale_id',v_sale_id,'bill_id',v_bill_id,'ingested_phone_id',v_ingested_id,
      'exchange_id',v_exchange_id,'trade_in_revived',v_revived,'customer_id',v_customer_id,
      'trade_in_count', jsonb_array_length(v_tis));
END $function$;
