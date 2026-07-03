# Phase 10 — Full verification pass (pre-cutover)

**Date:** 2026-07-03 · **Target:** STAGING `ttaexrsipmwxhciisufc` only (production `zahoixqvkshqalvvrtbs` never touched).
**Method:** real JWTs against the Supabase REST API + RPCs (not the UI), concurrent calls, direct SQL, and
PDFs rendered from the real `src/lib/pdfBill.ts`. Test accounts: owner `owner@clickzone.test`, staff-Kandy
`staff@clickzone.test`, staff-2 `staff2@clickzone.test`. Stores: Kandy `…0001`, Test-2 `…0002`.

## Go / No-Go summary

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | **Staff-JWT RLS** (cost/profit/customers hidden; no writes) | ✅ PASS | staff = 0 rows on all sensitive reads; writes 403 / 0-rows; owner sees data |
| 2 | **Checkout race** (no double-sell) | ✅ PASS | 2 concurrent → 1 OK, 1 "not available"; phone sold once |
| 3 | **Profit = revenue − COGS** (no trade-in double-count) | ✅ PASS | plain 20k, trade-in 72k, trade-in-return 7k all reconcile |
| 4 | **Trade-in-return 50k→45k** | ✅ PASS | R restocked, B sold, delta 5k store-credit, profit 7k follows B |
| 5 | **PDF correctness** (T&C+notes, bill==record, payment, overflow) | ✅ PASS | 5 bills incl. one from a real persisted sale; totals reconcile |
| 6 | **Multi-store isolation** + daily_revenue scoping | ✅ PASS | staff see only their store; daily_revenue force-scoped |

**Overall: GO** for cutover, subject to the pre-cutover checklist at the bottom (backup gate + zero-cost backfill).

---

## 1. Staff-JWT RLS proof (most important)

Direct REST calls with a real staff JWT vs owner JWT.

```
=== STAFF (Kandy) — READS that MUST return zero cost/profit/customer data ===
  GET phone_costs      -> { status: 200, rows: 0 }
  GET v_phones_full    -> { status: 200, rows: 0 }
  GET v_sales_profit   -> { status: 200, rows: 0 }
  GET customers        -> { status: 200, rows: 0 }
  GET sales            -> { status: 200, rows: 0 }   (base table, incl. items[].costPrice)

=== STAFF — READS that SHOULD work (cost-free public views) ===
  GET v_phones_public   -> { status: 200, rows: 5 }
  GET v_sales_public    -> { status: 200, rows: 5 }
  v_phones_public columns: id,imei,serial_number,device_type,model,storage,color,condition,
    battery_health,icloud_status,target_sale_price,status,date_added,is_deleted,store_id,source,ram,notes,exchange_id
  -> has cost_price? false     (no cost column exists in the staff view)

=== STAFF — WRITES that MUST be blocked ===
  INSERT phone          -> { status: 403, ERR 42501: new row violates row-level security policy for table "phones" }
  DELETE phone (soft)   -> { status: 200, rows: 0 }   (0 rows changed = RLS filtered = blocked)
  DELETE sale  (soft)   -> { status: 200, rows: 0 }   (blocked)

=== OWNER — the SAME reads MUST return data ===
  GET phone_costs      -> { status: 200, rows: 5 }
  GET v_phones_full    -> { status: 200, rows: 5 }
  GET v_sales_profit   -> { status: 200, rows: 5 }
  GET customers        -> { status: 200, rows: 2 }
```

**Verdict: PASS.** A staff JWT cannot read cost, profit, or customer data via the API, and cannot add or
delete stock or delete a sale. Security is server-enforced (RLS + column-separated cost table + self-gated
views), not UI-only. Owner sees everything.

## 2. Checkout race (double-sell guard)

Seeded one in-stock phone, fired two `checkout()` calls with `Promise.all`.

```
seeded in-stock phone 359000000210777
call #1: OK CZ-260703-330FE1
call #2: ERR Phone 359000000210777 is not available (already sold or removed)
phone final status: sold | sales referencing this IMEI: 1
RESULT: PASS — exactly one checkout succeeded, phone sold once.
```

**Verdict: PASS.** The `FOR UPDATE` row lock in `checkout()` serializes the two calls; exactly one wins,
the phone is sold once, no partial/double writes.

## 3. Profit unit test (revenue − COGS, no double-count)

Real staging rows; `profit_correct = total_revenue − COGS`, and the WRONG formula `net_payable − COGS`
shown for contrast.

| kind | bill | total_revenue | trade_in | net_payable | COGS | **profit (correct)** | wrong (net−COGS) |
|---|---|---|---|---|---|---|---|
| plain | CZ-260703-330FE1 | 60,000 | 0 | 60,000 | 40,000 | **20,000** | 20,000 |
| trade-in-checkout | CZ-260701-724AD1 | 150,000 | 40,000 | 110,000 | 78,000 | **72,000** | 32,000 |
| trade-in-return | CZ-260703-3EAF14 | 45,000 | 0 | 45,000 | 38,000 | **7,000** | 7,000 |

**Verdict: PASS.** Every profit figure = revenue − COGS. On the trade-in sale the wrong formula
(`net_payable − COGS`) understates profit by exactly the 40,000 trade-in — the double-count the app
avoids by using `total_revenue`, never `net_payable`. Confirmed the app uses `total_revenue − cost` in
`v_sales_profit`, Dashboard, and SalesLog.

## 4. Trade-in-return math (50,000 → 45,000, end-to-end)

Sold R for 50,000, then `return_item` trade-in-return: return R, take B (45,000), `store-credit`.

```
sold R -> sale CZ-260703-3EAF14
return_item -> {"delta":5000,"refund_amount":5000,"new_total_revenue":45000,
                "difference_direction":"store-credit","replacement_phone_id":"…B","restocked_imei":"…R"}

R (returned): { status: in-stock, source: returned }     <- restocked
B (taken)   : { status: sold }                            <- moved out
sale after  : total_revenue=45000 net_payable=45000 cogs=38000 gross_profit=7000 return_status=full
sale items  : [{ name:'…B', costPrice:38000, finalPrice:45000, identifier:'…B' }]   <- cost follows B
return row  : { refund_amount:5000, refund_method:'credit', restocked:true }
exchange row: { exchange_type:'trade-in-return', cash_difference:5000, difference_direction:'store-credit', outgoing_phone_id:'…B' }
```

**Verdict: PASS.** The 5,000 delta is recorded (not lost) as store-credit on both the return and exchange
rows; revenue becomes 45,000; profit (7,000) follows the device that left (B's cost), matching the Phase 8d
worked example. Money never disappears.

## 5. PDF correctness

Bills rendered from the real `pdfBill.ts` into `docs/phase10-bills/`:

```
bill-1-cash.pdf          (1 page)  — PAID·CASH, no trade-in row, T&C renders
bill-2-card.pdf          (1 page)  — PAID·CARD, 2 items, SUBTOTAL 123,000 − DISC 5,000 = 118,000
bill-3-tradein.pdf       (1 page)  — TRADE-IN −150,000, TOTAL DUE 50,000
bill-4-longnotes.pdf     (2 pages) — Special Notes + T&C both render, A5 overflow → page 2
bill-5-REAL-persisted.pdf(1 page)  — built from real sale CZ-260701-724AD1
```

**bill == persisted record** (sale `CZ-260701-724AD1`, fetched from the owner view):

```
persisted:  total_revenue=150000 total_discount=0 trade_in=40000 net_payable=110000 payment=cash
bill prints: SUBTOTAL=150000 DISCOUNT=0 TRADE-IN=40000 TOTAL DUE=110000 badge=PAID·CASH
reconciles: YES — TOTAL DUE == net_payable and SUBTOTAL−DISCOUNT == total_revenue
```

**Verdict: PASS.** Special Notes and T&C both render; content overflows cleanly to a second A5 page;
payment method shows on the badge; and the bill total equals the persisted sale record (totals are printed
verbatim from the sale, never recalculated). Sample PDFs are in `docs/phase10-bills/`.

## 6. Multi-store isolation

```
=== inventory visibility (v_phones_public.store_id) ===
staff-Kandy: 372 phones, distinct stores = [ …0001 (Kandy) ]
staff-2    : 2 phones,   distinct stores = [ …0002 (Test-2) ]
owner      : 374 phones, distinct stores = [ …0001, …0002 ]

=== cross-store leak checks ===
staff-Kandy fetching Test-2 phone 359999900000001 -> 0 rows
staff-2     fetching Kandy  phone 358447315395484 -> 0 rows

=== daily_revenue store-scoping (2026-07-03) ===
owner daily_revenue(Kandy)=105000   owner daily_revenue(Test-2)=0
staff-Kandy daily_revenue(param=Test-2) = 105000  -> equals Kandy, NOT Test-2
staff-2     daily_revenue(param=Kandy)  = 0        -> equals Test-2, NOT Kandy
```

**Verdict: PASS.** Staff see only their own store's inventory (DB-level, via store-scoped views), cannot
read the other store's rows even by direct query, and `daily_revenue` ignores a foreign store parameter for
staff — it force-scopes to the caller's own store.

---

## Must-fix / decide before cutover (Phase 11)

1. **Backup gate (blocking).** Staging/prod are on Supabase **Free** = no automated backups. Before go-live,
   move to **Pro** (recommended) or stand up the nightly `pg_dump` + CSV export. Don't run a live shop with no backup.
2. **Zero-cost rows (data).** ~111 phones + 68 accessories have `cost = 0` (legacy), which inflates historical
   profit. Owner to backfill from `docs/zero-cost-backfill.csv`. Profit **math** is correct (verified above);
   this is data quality.
3. **Cutover hygiene (checklist §6).** Replay `migrations/*` against a fresh **production** snapshot; do **not**
   run the staging test-user seed on prod; create real owner/staff accounts and set a real
   `override_pin_hash` (not the staging default `4321`).

## Non-blocking / open questions
- **`phone_swap`** RPC is tested but has no UI (dead code). Confirm with the client whether a pure
  device-for-device swap (not a purchase or a return) is ever needed; if not, remove at cleanup.
- **Staging test data** left by verification (`[PH10-*]`, `[8x-TEST]`, `[8F/8G-TEST]`) — harmless on staging,
  and won't reach production (cutover replays schema, not staging rows).

*All Phase 10 tests executed against staging only. Production was never accessed.*
