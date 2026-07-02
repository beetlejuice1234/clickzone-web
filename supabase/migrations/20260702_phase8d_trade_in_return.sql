-- Phase 8d — trade-in-return flow (Issue #3 / Phase-5 follow-up #3). STAGING ONLY.
--
-- Extends return_item so a `trade-in-return` is fully atomic:
--   * restock the returned phone (R -> in-stock),
--   * mark the chosen replacement phone sold (B -> sold),  <-- the follow-up #3 gap
--   * swap R -> B inside the original sale's cost/price snapshot so profit follows the
--     phone that actually left (cost stays in phone_costs; B's cost is only READ in,
--     R's cost is untouched for its future resale),
--   * record the return row + an exchange row carrying the delta and difference_direction.
--
-- Revenue recognition by difference_direction (delta = returned_value - replacement_value):
--   refunded / store-credit  -> total_revenue = old - p_ret + p_rep  (surplus goes back to customer)
--   zeroed (goodwill)        -> total_revenue = old                  (shop keeps surplus as margin)
--   customer-paid (B dearer) -> total_revenue = old - p_ret + p_rep  (= old + |delta|, extra cash in)
-- Money never disappears: it lands in total_revenue, returns.refund_amount, or
-- exchanges.cash_difference (+direction). Full rollback on any error (single txn / SECURITY DEFINER).
--
-- Straight `return` behaviour is unchanged.

CREATE OR REPLACE FUNCTION public.return_item(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := public.auth_role(); v_uid uuid := auth.uid();
  v_sale sales%rowtype; v_store uuid;
  v_rid text; v_return_id text; v_exchange_id text;
  v_type text := coalesce(payload->>'return_type','return');
  v_dir text := payload->>'difference_direction';
  v_restock boolean := coalesce((payload->>'restock')::boolean, true);
  v_qty int := coalesce((payload->>'quantity')::int,1);
  v_item_type text := payload->>'item_type';
  v_ret_id text := payload->>'identifier';                 -- returned item (imei / sku)
  -- trade-in-return specifics
  v_repl_imei text := payload->>'replacement_identifier';  -- phone the customer takes (B)
  v_bid text; v_bmodel text; v_bcond text; v_btarget int; v_bcost int;
  v_prep numeric; v_pret numeric := 0; v_delta numeric;
  v_ret_model text; v_new_items jsonb; v_new_total int; v_refund numeric := 0; v_refmethod text;
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'return_item: not authorized'; END IF;
  SELECT * INTO v_sale FROM sales WHERE id=payload->>'original_sale_id' AND is_deleted=false FOR UPDATE;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Original sale % not found', payload->>'original_sale_id'; END IF;
  v_store := coalesce((payload->>'store_id')::uuid, v_sale.store_id);

  --------------------------------------------------------------------- STRAIGHT RETURN (unchanged)
  IF v_type <> 'trade-in-return' THEN
    IF v_item_type='phone' AND v_restock THEN
      UPDATE phones SET status='in-stock', is_deleted=false, local_updated_at=now()::text WHERE imei=v_ret_id;
    ELSIF v_item_type='accessory' AND v_restock THEN
      UPDATE accessories SET quantity=quantity+v_qty, local_updated_at=now()::text WHERE sku=v_ret_id;
    END IF;

    v_rid := 'r_'||replace(gen_random_uuid()::text,'-','');
    v_return_id := 'RET-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
    INSERT INTO returns (id,return_id,original_sale_id,original_bill_id,item_type,imei,sku,quantity,refund_amount,
        reason,reason_notes,condition_on_return,refund_method,customer_whatsapp,store_id,processed_by,return_date,restocked,notes,is_deleted)
    VALUES (v_rid, v_return_id, v_sale.id, v_sale.bill_id, v_item_type,
        CASE WHEN v_item_type='phone' THEN v_ret_id END,
        CASE WHEN v_item_type='accessory' THEN v_ret_id END,
        v_qty, coalesce((payload->>'refund_amount')::real,0), payload->>'reason', payload->>'reason_notes',
        payload->>'condition_on_return', payload->>'refund_method', payload->>'customer_whatsapp', v_store, v_uid, now(), v_restock,
        payload->>'notes', false);

    UPDATE sales SET return_status='returned',
        total_refunded = coalesce(total_refunded,0) + coalesce((payload->>'refund_amount')::real,0),
        local_updated_at=now()::text
      WHERE id=v_sale.id;

    RETURN jsonb_build_object('return_id',v_return_id,'exchange_id',null,'difference_direction',null);
  END IF;

  --------------------------------------------------------------------- TRADE-IN RETURN (device swap)
  IF v_dir IS NULL OR v_dir NOT IN ('refunded','store-credit','customer-paid','zeroed') THEN
    RAISE EXCEPTION 'trade-in-return requires difference_direction in (refunded, store-credit, customer-paid, zeroed)';
  END IF;
  IF v_repl_imei IS NULL OR v_repl_imei = '' THEN
    RAISE EXCEPTION 'trade-in-return requires replacement_identifier (the phone the customer takes)';
  END IF;
  IF v_repl_imei = v_ret_id THEN
    RAISE EXCEPTION 'Replacement phone must differ from the returned phone';
  END IF;

  -- Lock + validate the replacement phone: it must be active, in-stock (abort before any write).
  SELECT id, model, condition, target_sale_price INTO v_bid, v_bmodel, v_bcond, v_btarget
    FROM phones WHERE imei=v_repl_imei AND is_deleted=false AND status='in-stock' FOR UPDATE;
  IF v_bid IS NULL THEN
    RAISE EXCEPTION 'Replacement phone % is not available in active stock', v_repl_imei;
  END IF;
  SELECT cost_price INTO v_bcost FROM phone_costs WHERE phone_id=v_bid;

  -- Value credited for the returned phone = its line price on the original sale (fallback: refund_amount).
  SELECT (elem->>'finalPrice')::numeric, elem->>'name'
    INTO v_pret, v_ret_model
    FROM jsonb_array_elements(coalesce(v_sale.items,'[]'::jsonb)) elem
    WHERE elem->>'identifier'=v_ret_id LIMIT 1;
  v_pret := coalesce(v_pret, (payload->>'refund_amount')::numeric, 0);
  v_prep := coalesce((payload->>'replacement_value')::numeric, v_btarget, 0);
  v_delta := v_pret - v_prep;                                  -- >0 customer owed; <0 customer owes

  -- Move the stock: returned phone back in, replacement phone out.
  UPDATE phones SET status='in-stock', is_deleted=false, source='returned', local_updated_at=now()::text WHERE imei=v_ret_id;
  UPDATE phones SET status='sold', local_updated_at=now()::text WHERE id=v_bid;

  -- Swap the returned line -> replacement line in the sale's cost/price snapshot (cost follows B).
  SELECT coalesce(jsonb_agg(
           CASE WHEN elem->>'identifier'=v_ret_id
             THEN jsonb_build_object('type','phone','name',v_bmodel,'identifier',v_repl_imei,
                    'costPrice',coalesce(v_bcost,0),'finalPrice',round(v_prep),'discount',0,
                    'condition',coalesce(v_bcond,'used-good'))
             ELSE elem END), '[]'::jsonb)
    INTO v_new_items
    FROM jsonb_array_elements(coalesce(v_sale.items,'[]'::jsonb)) elem;

  -- Revenue: replacement value replaces the returned value, except 'zeroed' (shop keeps surplus).
  IF v_dir='zeroed' THEN
    v_new_total := v_sale.total_revenue;
  ELSE
    v_new_total := round(v_sale.total_revenue - v_pret + v_prep);
  END IF;

  -- Cash/credit handed back to the customer (audit trail only; profit already reflected above).
  v_refund := CASE WHEN v_dir IN ('refunded','store-credit') THEN greatest(v_delta,0) ELSE 0 END;
  v_refmethod := CASE v_dir WHEN 'refunded' THEN 'cash' WHEN 'store-credit' THEN 'credit' ELSE 'none' END;

  v_rid := 'r_'||replace(gen_random_uuid()::text,'-','');
  v_return_id := 'RET-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
  INSERT INTO returns (id,return_id,original_sale_id,original_bill_id,item_type,imei,sku,quantity,refund_amount,
      reason,reason_notes,condition_on_return,refund_method,customer_whatsapp,store_id,processed_by,return_date,restocked,notes,is_deleted)
  VALUES (v_rid, v_return_id, v_sale.id, v_sale.bill_id, 'phone', v_ret_id, null, 1, v_refund,
      payload->>'reason', payload->>'reason_notes', payload->>'condition_on_return', v_refmethod,
      payload->>'customer_whatsapp', v_store, v_uid, now(), true,
      coalesce(payload->>'notes','')||' [trade-in-return repl='||v_repl_imei||' dir='||v_dir||' delta='||round(v_delta)::text||']',
      false);

  v_exchange_id := 'e_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO exchanges (id,sale_id,exchange_type,trade_in_imei,trade_in_model,trade_in_valuation,
      outgoing_phone_id,cash_difference,difference_direction,customer_whatsapp,store_id,is_deleted,trade_in_notes)
  VALUES (v_exchange_id, v_sale.id, 'trade-in-return', v_ret_id, coalesce(v_ret_model,''), round(v_pret),
      v_bid, abs(round(v_delta)), v_dir, payload->>'customer_whatsapp', v_store, false, 'return='||v_return_id);

  UPDATE sales SET items=v_new_items, total_revenue=v_new_total, return_status='full',
      exchange_id=v_exchange_id, net_payable = v_new_total - coalesce(trade_in_value,0),
      local_updated_at=now()::text
    WHERE id=v_sale.id;

  RETURN jsonb_build_object('return_id',v_return_id,'exchange_id',v_exchange_id,'difference_direction',v_dir,
      'delta',round(v_delta),'replacement_phone_id',v_bid,'restocked_imei',v_ret_id,
      'new_total_revenue',v_new_total,'refund_amount',v_refund);
END $function$;
