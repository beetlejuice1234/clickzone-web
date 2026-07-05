-- Client fix — optional serial number on accessories.
-- Additive + safe (nullable column; views recreated to surface it). Staging first, then production.

ALTER TABLE public.accessories ADD COLUMN IF NOT EXISTS serial_number text;

-- Staff-facing view (store-scoped) — expose serial_number (not sensitive; no cost).
-- serial_number appended LAST (CREATE OR REPLACE VIEW only allows adding columns at the end).
CREATE OR REPLACE VIEW public.v_accessories_public AS
SELECT sku, name, quantity, sale_price, category, brand, variant, min_stock_level, store_id, is_deleted, serial_number
FROM public.accessories
WHERE is_deleted = false
  AND (store_id = (SELECT store_id FROM public.profiles WHERE id = auth.uid())
       OR public.auth_role() = 'owner');

-- Owner view is SELECT a.* — recreate so the new column is picked up (views freeze * at create time).
CREATE OR REPLACE VIEW public.v_accessories_full AS
SELECT a.*
FROM public.accessories a
WHERE public.auth_role() = 'owner' AND a.is_deleted = false;
