BEGIN;

ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS sale_item_index integer;
ALTER TABLE public.returns ADD COLUMN IF NOT EXISTS profit_reversed numeric;

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
  v_line jsonb; v_line_index int; v_line_quantity int;
  v_returned_quantity int; v_refund_amount numeric; v_device_id text;
BEGIN
  IF v_uid IS NULL OR coalesce(v_role, '') NOT IN ('owner','staff') THEN RAISE EXCEPTION 'return_item: not authorized'; END IF;
  SELECT * INTO v_sale FROM sales WHERE id=payload->>'original_sale_id' AND is_deleted=false FOR UPDATE;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Original sale % not found', payload->>'original_sale_id'; END IF;
  v_store := v_sale.store_id;
  IF v_role = 'staff' AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_uid AND store_id = v_store
  ) THEN RAISE EXCEPTION 'Return must be processed in the sale store'; END IF;

  SELECT line, (ordinal - 1)::int INTO v_line, v_line_index
  FROM jsonb_array_elements(v_sale.items) WITH ORDINALITY AS lines(line, ordinal)
  WHERE line->>'type' = v_item_type
    AND lower(btrim(line->>'identifier')) = lower(btrim(v_ret_id))
    AND (payload->>'sale_item_index' IS NULL OR ordinal - 1 = (payload->>'sale_item_index')::int)
  ORDER BY ordinal LIMIT 1;
  IF v_line IS NULL OR v_item_type NOT IN ('phone','accessory','repair') THEN
    RAISE EXCEPTION 'Select an item from the original sale';
  END IF;

  v_line_quantity := greatest(coalesce((v_line->>'quantity')::int, 1), 1);
  SELECT coalesce(sum(r.quantity), 0)::int INTO v_returned_quantity
  FROM returns r
  WHERE r.original_sale_id = v_sale.id AND NOT r.is_deleted
    AND r.item_type = v_item_type
    AND lower(btrim(coalesce(r.imei, r.sku, ''))) = lower(btrim(v_ret_id))
    AND coalesce(r.notes, '') !~ ' \[trade-in-return repl='
    AND (r.sale_item_index IS NULL OR r.sale_item_index = v_line_index);
  IF v_qty < 1 OR v_qty > v_line_quantity - v_returned_quantity THEN
    RAISE EXCEPTION 'This item or quantity has already been returned';
  END IF;

  IF v_item_type = 'phone' THEN
    SELECT id INTO v_device_id FROM phones
    WHERE store_id = v_store AND NOT is_deleted AND status = 'sold'
      AND (CASE WHEN nullif(v_line->>'id', '') IS NOT NULL THEN id = v_line->>'id'
        ELSE id = v_ret_id OR imei = v_ret_id OR lower(btrim(serial_number)) = lower(btrim(v_ret_id)) END)
    ORDER BY local_updated_at DESC NULLS LAST, id LIMIT 1 FOR UPDATE;
    IF v_device_id IS NOT NULL AND (v_restock OR v_type = 'trade-in-return') AND EXISTS (
      SELECT 1 FROM sales s
      CROSS JOIN LATERAL jsonb_array_elements(s.items) AS newer(line)
      WHERE s.id <> v_sale.id AND NOT s.is_deleted AND s.store_id = v_store
        AND (s.date, s."time") > (v_sale.date, v_sale."time")
        AND line->>'type' = 'phone'
        AND (line->>'id' = v_device_id OR lower(btrim(line->>'identifier')) = lower(btrim(v_ret_id)))
    ) THEN RAISE EXCEPTION 'This device has a newer sale. Use the most recent bill to restock it'; END IF;
  END IF;

  --------------------------------------------------------------------- STRAIGHT RETURN
  IF v_type <> 'trade-in-return' THEN
    v_refund_amount := (payload->>'refund_amount')::numeric;
    IF v_refund_amount IS NULL OR v_refund_amount = 'NaN'::numeric OR v_refund_amount < 0
       OR v_refund_amount > coalesce((v_line->>'finalPrice')::numeric, 0) * v_qty / v_line_quantity THEN
      RAISE EXCEPTION 'Refund amount must be between zero and the returned items’ sale price';
    END IF;
    IF v_item_type='phone' AND v_restock THEN
      IF v_device_id IS NULL THEN RAISE EXCEPTION 'Sold device could not be located for restock'; END IF;
      UPDATE phones SET status='in-stock', source='returned', local_updated_at=now()::text WHERE id=v_device_id;
    ELSIF v_item_type='accessory' AND v_restock THEN
      UPDATE accessories SET quantity=quantity+v_qty, local_updated_at=now()::text WHERE sku=v_ret_id AND store_id=v_store AND NOT is_deleted;
      IF NOT FOUND THEN RAISE EXCEPTION 'Accessory could not be located for restock'; END IF;
    END IF;

    v_rid := 'r_'||replace(gen_random_uuid()::text,'-','');
    v_return_id := 'RET-'||to_char((now() AT TIME ZONE 'Asia/Colombo'),'YYMMDD')||'-'||upper(substr(md5(gen_random_uuid()::text),1,5));
    INSERT INTO returns (id,return_id,original_sale_id,original_bill_id,item_type,imei,sku,quantity,refund_amount,
        reason,reason_notes,condition_on_return,refund_method,customer_whatsapp,store_id,processed_by,return_date,restocked,notes,is_deleted,sale_item_index,profit_reversed)
    VALUES (v_rid, v_return_id, v_sale.id, v_sale.bill_id, v_item_type,
        CASE WHEN v_item_type='phone' THEN v_ret_id END,
        CASE WHEN v_item_type='accessory' THEN v_ret_id END,
        v_qty, v_refund_amount, payload->>'reason', payload->>'reason_notes',
        payload->>'condition_on_return', payload->>'refund_method', payload->>'customer_whatsapp', v_store, v_uid, now(), v_restock AND v_item_type <> 'repair',
        payload->>'notes', false, v_line_index,
        (coalesce((v_line->>'finalPrice')::numeric, 0) - coalesce((v_line->>'costPrice')::numeric, 0) * CASE WHEN v_item_type = 'accessory' THEN v_line_quantity ELSE 1 END) * v_qty / v_line_quantity);

    UPDATE sales SET return_status='returned',
        total_refunded = coalesce(total_refunded,0) + v_refund_amount,
        local_updated_at=now()::text
      WHERE id=v_sale.id;

    RETURN jsonb_build_object('return_id',v_return_id,'exchange_id',null,'difference_direction',null);
  END IF;

  --------------------------------------------------------------------- TRADE-IN RETURN (device swap)
  IF v_qty <> 1 THEN RAISE EXCEPTION 'A device exchange must return exactly one device'; END IF;
  IF v_dir IS NULL OR v_dir NOT IN ('refunded','store-credit','customer-paid','zeroed') THEN
    RAISE EXCEPTION 'trade-in-return requires difference_direction in (refunded, store-credit, customer-paid, zeroed)';
  END IF;
  IF v_repl_imei IS NULL OR v_repl_imei = '' THEN
    RAISE EXCEPTION 'trade-in-return requires replacement_identifier (the phone the customer takes)';
  END IF;
  IF v_item_type <> 'phone' OR v_device_id IS NULL THEN
    RAISE EXCEPTION 'Sold device could not be located for exchange';
  END IF;
  IF lower(btrim(v_repl_imei)) = lower(btrim(v_ret_id)) THEN
    RAISE EXCEPTION 'Replacement phone must differ from the returned phone';
  END IF;

  -- Lock + validate the replacement phone: it must be active, in-stock (abort before any write).
  SELECT id, model, condition, target_sale_price INTO v_bid, v_bmodel, v_bcond, v_btarget
    FROM phones WHERE store_id = v_store AND NOT is_deleted AND status='in-stock'
      AND (id = v_repl_imei OR imei = v_repl_imei OR lower(btrim(serial_number)) = lower(btrim(v_repl_imei)))
      ORDER BY id LIMIT 1 FOR UPDATE;
  IF v_bid IS NULL THEN
    RAISE EXCEPTION 'Replacement phone % is not available in active stock', v_repl_imei;
  END IF;
  SELECT cost_price INTO v_bcost FROM phone_costs WHERE phone_id=v_bid;

  -- Value credited for the returned phone = its line price on the original sale (fallback: refund_amount).
  v_pret := (v_line->>'finalPrice')::numeric;
  v_ret_model := v_line->>'name';
  v_pret := coalesce(v_pret, (payload->>'refund_amount')::numeric, 0);
  v_prep := coalesce((payload->>'replacement_value')::numeric, v_btarget, 0);
  IF v_prep < 0 OR v_prep = 'NaN'::numeric THEN RAISE EXCEPTION 'Invalid replacement value'; END IF;
  v_delta := v_pret - v_prep;                                  -- >0 customer owed; <0 customer owes

  IF (v_delta < 0 AND v_dir <> 'customer-paid') OR (v_delta >= 0 AND v_dir = 'customer-paid') THEN
    RAISE EXCEPTION 'Exchange settlement does not match the price difference';
  END IF;

  -- Move the stock: returned phone back in, replacement phone out.
  UPDATE phones SET status='in-stock', is_deleted=false, source='returned', local_updated_at=now()::text WHERE id=v_device_id;
  UPDATE phones SET status='sold', local_updated_at=now()::text WHERE id=v_bid;

  -- Swap the returned line -> replacement line in the sale's cost/price snapshot (cost follows B).
  SELECT coalesce(jsonb_agg(
           CASE WHEN ordinal - 1 = v_line_index
             THEN jsonb_build_object('type','phone','name',v_bmodel,'identifier',v_repl_imei,'id',v_bid,
                    'costPrice',coalesce(v_bcost,0),'finalPrice',round(v_prep),'discount',0,
                    'condition',coalesce(v_bcond,'used-good'))
                  || CASE WHEN elem ? 'includeBillTerms'
                          THEN jsonb_build_object('includeBillTerms', elem->'includeBillTerms') ELSE '{}'::jsonb END
             ELSE elem END ORDER BY ordinal), '[]'::jsonb)
    INTO v_new_items
    FROM jsonb_array_elements(coalesce(v_sale.items,'[]'::jsonb)) WITH ORDINALITY AS lines(elem, ordinal);

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

-- Sale totals already incorporate swap settlements. Only straight returns are
-- deducted again. Expose financial adjustments within each role's store scope.
CREATE OR REPLACE VIEW public.v_return_adjustments AS
SELECT r.id, r.original_sale_id AS sale_id, r.store_id,
  (r.return_date AT TIME ZONE 'Asia/Colombo')::date AS refund_date,
  r.refund_amount,
  coalesce(r.notes, '') ~ ' \[trade-in-return repl=' AS is_exchange,
  CASE WHEN public.auth_role() = 'owner' THEN
    CASE WHEN coalesce(r.notes, '') ~ ' \[trade-in-return repl=' THEN 0::numeric
      ELSE coalesce(r.profit_reversed,
        (coalesce((sold.line->>'finalPrice')::numeric, 0) - coalesce((sold.line->>'costPrice')::numeric, 0)
          * CASE WHEN r.item_type = 'accessory' THEN greatest(coalesce((sold.line->>'quantity')::int, 1), 1) ELSE 1 END)
        * least(r.quantity, greatest(coalesce((sold.line->>'quantity')::int, 1), 1))
        / greatest(coalesce((sold.line->>'quantity')::int, 1), 1))
    END
  END AS profit_reversed
FROM public.returns r
JOIN public.sales s ON s.id = r.original_sale_id AND NOT s.is_deleted
LEFT JOIN LATERAL (
  SELECT line FROM jsonb_array_elements(s.items) WITH ORDINALITY AS lines(line, ordinal)
  WHERE line->>'type' = r.item_type
    AND lower(btrim(line->>'identifier')) = lower(btrim(coalesce(r.imei, r.sku, '')))
    AND (r.sale_item_index IS NULL OR ordinal - 1 = r.sale_item_index)
  ORDER BY ordinal LIMIT 1
) sold ON true
WHERE NOT r.is_deleted AND auth.uid() IS NOT NULL
  AND (public.auth_role() = 'owner'
    OR (public.auth_role() = 'staff' AND r.store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())));

REVOKE ALL ON public.v_return_adjustments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_return_adjustments TO authenticated;
REVOKE ALL ON FUNCTION public.return_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_item(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
