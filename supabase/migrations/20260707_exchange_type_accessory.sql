-- Fix — allow 'accessory-trade-in' as an exchange_type. The accessory-trade-in feature
-- (20260707_accessory_trade_in) inserts exchanges rows with exchange_type='accessory-trade-in', but
-- the original CHECK only permitted trade-in / phone-swap / trade-in-return, so every accessory
-- trade-in failed (and rolled back). Widen the constraint. Additive & safe. Staging first, then prod.

ALTER TABLE public.exchanges DROP CONSTRAINT IF EXISTS exchanges_exchange_type_check;
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_exchange_type_check
  CHECK (exchange_type = ANY (ARRAY['trade-in','phone-swap','trade-in-return','accessory-trade-in']));
