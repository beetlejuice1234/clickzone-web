-- Client feature — saved & numbered quotations (POS price quotes; not a sale, no stock change).
-- Quotations store NO cost (customer-facing), so staff may read/create them safely.
-- Sequential quote numbers via stores.next_quote_no (starts at 1001). Staging first, then production.

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS next_quote_no bigint;

CREATE TABLE IF NOT EXISTS public.quotations (
  id text PRIMARY KEY,
  quote_no text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{type,name,identifier,finalPrice,discount,quantity,condition}] — no cost
  customer_name text, customer_nic text, customer_whatsapp text,
  total_revenue integer NOT NULL DEFAULT 0,
  total_discount integer NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','converted','expired')),
  valid_until date,
  store_id uuid REFERENCES public.stores(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotations_owner_all    ON public.quotations;
DROP POLICY IF EXISTS quotations_staff_select ON public.quotations;
CREATE POLICY quotations_owner_all ON public.quotations FOR ALL TO authenticated
  USING (public.auth_role()='owner') WITH CHECK (public.auth_role()='owner');
-- Staff may read their own store's quotes (create/update happen via SECURITY DEFINER RPCs below).
CREATE POLICY quotations_staff_select ON public.quotations FOR SELECT TO authenticated
  USING (public.auth_role()='staff' AND store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

-- Create a quotation; assigns a sequential per-store number (Q-<n>, starting at 1001). No stock touched.
CREATE OR REPLACE FUNCTION public.create_quotation(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role(); v_uid uuid := auth.uid();
  v_store uuid; v_no bigint; v_id text; v_quote_no text;
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'create_quotation: not authorized'; END IF;
  v_store := coalesce((payload->>'store_id')::uuid, (SELECT store_id FROM profiles WHERE id=v_uid),
                      'a0000000-0000-4000-8000-000000000001'::uuid);
  UPDATE stores SET next_quote_no = coalesce(next_quote_no,1001) + 1
    WHERE id = v_store RETURNING next_quote_no - 1 INTO v_no;
  v_quote_no := 'Q-'||v_no::text;
  v_id := 'q_'||replace(gen_random_uuid()::text,'-','');
  INSERT INTO quotations (id,quote_no,items,customer_name,customer_nic,customer_whatsapp,
      total_revenue,total_discount,notes,valid_until,store_id,created_by,status,is_deleted)
  VALUES (v_id, v_quote_no, coalesce(payload->'items','[]'::jsonb),
      nullif(payload->>'customer_name',''), nullif(payload->>'customer_nic',''), nullif(payload->>'customer_whatsapp',''),
      coalesce((payload->>'total_revenue')::int,0), coalesce((payload->>'total_discount')::int,0),
      nullif(payload->>'notes',''), (payload->>'valid_until')::date, v_store, v_uid, 'open', false);
  RETURN jsonb_build_object('quote_id', v_id, 'quote_no', v_quote_no);
END $$;
REVOKE ALL ON FUNCTION public.create_quotation(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_quotation(jsonb) TO authenticated;

-- Update a quotation's status (converted/expired) or soft-delete it. Owner + own-store staff.
CREATE OR REPLACE FUNCTION public.update_quotation(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role text := public.auth_role(); v_uid uuid := auth.uid();
  v_id text := payload->>'id'; v_store uuid; v_qstore uuid;
BEGIN
  IF v_role NOT IN ('owner','staff') THEN RAISE EXCEPTION 'update_quotation: not authorized'; END IF;
  SELECT store_id INTO v_qstore FROM quotations WHERE id = v_id;
  IF v_qstore IS NULL THEN RAISE EXCEPTION 'Quotation % not found', v_id; END IF;
  IF v_role = 'staff' THEN
    v_store := (SELECT store_id FROM profiles WHERE id = v_uid);
    IF v_qstore <> v_store THEN RAISE EXCEPTION 'update_quotation: wrong store'; END IF;
  END IF;
  UPDATE quotations SET
    status     = coalesce(payload->>'status', status),
    is_deleted = coalesce((payload->>'is_deleted')::boolean, is_deleted)
  WHERE id = v_id;
  RETURN jsonb_build_object('id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.update_quotation(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_quotation(jsonb) TO authenticated;
