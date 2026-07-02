-- =========================================================================
-- ClickZone Phase 3 — schema migration (snake_case)
-- Target: STAGING ttaexrsipmwxhciisufc (replayable against a fresh production
--         snapshot at cutover). Single transaction: any failure rolls back.
-- Kandy store UUID = a0000000-0000-4000-8000-000000000001
-- =========================================================================
BEGIN;

-- 1) New reference/support tables (RLS on; policies come in Phase 4) --------
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, address text, phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Kandy row created BEFORE any store_id default references it
INSERT INTO public.stores (id, name, address, phone)
VALUES ('a0000000-0000-4000-8000-000000000001','ClickZone Kandy','28 Raja Veediya, Kandy',NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
  store_id uuid REFERENCES public.stores(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, nic text, whatsapp text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES public.profiles(id),
  action text, entity text, detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Cost split (§3.2 Option A): copy EVERY phone's cost into phone_costs ----
CREATE TABLE IF NOT EXISTS public.phone_costs (
  phone_id text PRIMARY KEY REFERENCES public.phones(id) ON DELETE CASCADE,
  cost_price integer
);
INSERT INTO public.phone_costs (phone_id, cost_price)
SELECT id, cost_price FROM public.phones
ON CONFLICT (phone_id) DO NOTHING;

-- 2a) GUARD: verify preservation BEFORE dropping the column. Aborts (rollback)
--     unless phone_costs has one matching row per phone (incl. zero-cost ones).
DO $$
DECLARE n_ph int; n_pc int; n_bad int;
BEGIN
  SELECT count(*) INTO n_ph FROM public.phones;
  SELECT count(*) INTO n_pc FROM public.phone_costs;
  SELECT count(*) INTO n_bad
    FROM public.phones p
    LEFT JOIN public.phone_costs c ON c.phone_id = p.id
    WHERE c.phone_id IS NULL OR c.cost_price IS DISTINCT FROM p.cost_price;
  IF n_pc <> n_ph OR n_bad <> 0 THEN
    RAISE EXCEPTION 'phone_costs preservation guard FAILED: phones=%, phone_costs=%, mismatched=%',
      n_ph, n_pc, n_bad;
  END IF;
  RAISE NOTICE 'phone_costs guard OK: % phones all preserved', n_ph;
END $$;

-- 3) Drop dead duplicate lowercase columns (0 rows populated, unread) --------
ALTER TABLE public.phones      DROP COLUMN IF EXISTS exchangeid;
ALTER TABLE public.accessories DROP COLUMN IF EXISTS minstocklevel;
ALTER TABLE public.sales       DROP COLUMN IF EXISTS returnstatus;
ALTER TABLE public.sales       DROP COLUMN IF EXISTS totalrefunded;
ALTER TABLE public.sales       DROP COLUMN IF EXISTS exchangeid;
ALTER TABLE public.sales       DROP COLUMN IF EXISTS tradeinvalue;
ALTER TABLE public.sales       DROP COLUMN IF EXISTS netpayable;

-- 4) phones: new cols, drop cost_price (guard passed), imei nullable + CHECK --
ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS device_type   text NOT NULL DEFAULT 'phone',
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS store_id      uuid NOT NULL
        DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.stores(id);
ALTER TABLE public.phones DROP COLUMN IF EXISTS cost_price;   -- preserved in phone_costs
ALTER TABLE public.phones ALTER COLUMN imei DROP NOT NULL;
ALTER TABLE public.phones ADD CONSTRAINT phones_identifier_check
  CHECK (imei IS NOT NULL OR serial_number IS NOT NULL);

-- 5) Replace GLOBAL unique imei with partial (active stock only) — Issue #4 ---
ALTER TABLE public.phones DROP CONSTRAINT IF EXISTS phones_imei_key;
CREATE UNIQUE INDEX phones_active_imei_uidx   ON public.phones (imei)
  WHERE imei IS NOT NULL          AND is_deleted = false AND status = 'in-stock';
CREATE UNIQUE INDEX phones_active_serial_uidx ON public.phones (serial_number)
  WHERE serial_number IS NOT NULL AND is_deleted = false AND status = 'in-stock';

-- 6) accessories + sales: multi-store (with FKs) + sale metadata -------------
ALTER TABLE public.accessories
  ADD COLUMN IF NOT EXISTS store_id uuid NOT NULL
        DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.stores(id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash',   -- pre-exists on prod
  ADD COLUMN IF NOT EXISTS store_id    uuid NOT NULL
        DEFAULT 'a0000000-0000-4000-8000-000000000001' REFERENCES public.stores(id),
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS sold_by     uuid REFERENCES public.profiles(id);
-- guarantee the default even if the column pre-existed without one
ALTER TABLE public.sales ALTER COLUMN payment_method SET DEFAULT 'cash';
-- Legacy dangling refs: NO FK on sales.exchange_id / sales->returns (108 + 7 legacy
-- rows would violate). Kept as denormalized history; integrity enforced on new rows only.

-- 7) Drop & recreate empty returns + exchanges (clean snake_case; bool is_deleted) --
DROP TABLE IF EXISTS public.returns   CASCADE;
DROP TABLE IF EXISTS public.exchanges CASCADE;

CREATE TABLE public.returns (
  id text PRIMARY KEY,
  return_id text NOT NULL UNIQUE,
  original_sale_id text REFERENCES public.sales(id),
  original_bill_id text,
  item_type text NOT NULL,
  imei text, sku text,
  quantity integer NOT NULL DEFAULT 1,
  refund_amount real NOT NULL DEFAULT 0,
  reason text, reason_notes text, condition_on_return text, refund_method text,
  customer_whatsapp text,
  store_id uuid REFERENCES public.stores(id),
  processed_by uuid REFERENCES public.profiles(id),
  return_date timestamptz NOT NULL DEFAULT now(),
  restocked boolean NOT NULL DEFAULT true,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  local_updated_at timestamptz, synced_at timestamptz
);

CREATE TABLE public.exchanges (
  id text PRIMARY KEY,
  sale_id text REFERENCES public.sales(id),
  exchange_type text NOT NULL DEFAULT 'trade-in'
    CHECK (exchange_type IN ('trade-in','phone-swap','trade-in-return')),
  trade_in_imei text, trade_in_model text, trade_in_valuation real,
  trade_in_condition text, trade_in_battery_health integer, trade_in_notes text,
  outgoing_phone_id text REFERENCES public.phones(id),
  cash_difference real NOT NULL DEFAULT 0,
  difference_direction text
    CHECK (difference_direction IN ('customer-paid','refunded','store-credit','zeroed')),
  customer_name text, customer_nic text, customer_whatsapp text,
  ingested_phone_id text REFERENCES public.phones(id),
  store_id uuid REFERENCES public.stores(id),
  is_deleted boolean NOT NULL DEFAULT false,
  local_updated_at timestamptz, synced_at timestamptz
);

-- 8) RLS + grants (match production posture; real policies land in Phase 4) --
ALTER TABLE public.stores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchanges   ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.returns, public.exchanges TO anon, authenticated, service_role;

COMMIT;
