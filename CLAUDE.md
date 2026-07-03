# ClickZone Web POS — build context

Clean rebuild of the ClickZone Mobiles POS (Kandy) as a **cloud-first PWA** on **Supabase only**
(no Electron/Express/SQLite). The legacy Electron app is one level up in `../` — **read-only
reference**; never run or modify it. Plans: `../.handoff/CLICKZONE_WEB_BUILD_PLAN (1).md`
(source of truth, build order §8) and `../IMPLEMENTATION_RUNBOOK.md` (phase-by-phase).

## Stack
Vite + React 19 + TypeScript + Tailwind + shadcn/ui (Radix). Data: `@supabase/supabase-js`,
`@tanstack/react-query`. Routing: `react-router-dom`. Also zustand, framer-motion, recharts,
jspdf(+autotable), sonner, xlsx. PWA (`vite-plugin-pwa`) installed but NOT wired (Phase 9).

## Environments — STAGING vs PRODUCTION (critical)
- **PRODUCTION** = Supabase project **`zahoixqvkshqalvvrtbs`** ("clickzonepos", ap-southeast-1).
  **LIVE** — the legacy Electron app still writes to it. **Never write to production.** Read-only.
- **STAGING** = Supabase project **`ttaexrsipmwxhciisufc`** ("akash pos web app", ap-south-1).
  An exact clone of production. **All build/test work targets staging.** The app (`.env`) points here.
- We are on **Path C**: build/test everything against the staging clone; production is migrated only
  at cutover (replay the `supabase/migrations/*.sql` against a fresh prod snapshot).
- DB passwords in `.env.staging` are REJECTED by Supabase (pooler auth fails) → `pg_dump`/`psql`
  do NOT work. Use the **Supabase MCP connector** (by `project_ref`) for all DB work. `.env` /
  `.env.staging` are gitignored.

## Security model (server-enforced — never UI-only)
- Two roles in `profiles.role`: **owner** (full CRUD) and **staff** (sell only).
- Cost/profit is hidden from staff **in the database**: `phones.cost_price` was moved to the
  owner-only `phone_costs` table (§3.2 Option A). Staff read **cost-free views**; owner reads
  owner views. RLS enabled on every table; `auth_role()` SECURITY DEFINER helper backs policies.
- Views: `v_phones_public` / `v_accessories_public` / `v_sales_public` (staff, no cost;
  `v_sales_public` strips `costPrice` from `items`) and owner-only `v_phones_full` /
  `v_accessories_full` / `v_sales_profit` (self-gated `WHERE auth_role()='owner'`).
- App rule: **listings read views only, never base tables**; owner-only records
  (returns/exchanges/customers/stores) are query-disabled for staff.
- `isAdmin = role==='owner'` drives cost/profit visibility and is **fail-closed** (false while role
  loads). PIN override (`verify_override_pin` RPC) gives staff a short-lived UI capability — NOT a
  role change; RLS still blocks staff DB writes, so real stock edits require an owner login.

## Conventions
- **snake_case** in the DB; components use camelCase. Mapping layer: `src/lib/mappers.ts`
  (the `items` JSON inside sales is already camelCase — passed through).
- Money/stock mutations go through atomic `plpgsql` RPCs (all SECURITY DEFINER, `search_path=public`,
  internal `auth_role()` gate, EXECUTE to `authenticated`): `checkout`, `return_item`,
  `phone_swap`, `verify_override_pin`, `daily_revenue`, `upsert_phone`, `find_phone_by_identifier`.
- Dates pinned to **Asia/Colombo** in RPCs.
- Devices: `phones` carries `device_type` (phone|tablet|watch) + nullable `serial_number`; a phone
  needs a 15-digit IMEI, a tablet/watch needs a serial (CHECK: imei OR serial). Empty identifiers are
  stored as NULL. Active-stock uniqueness on both imei and serial (partial unique indexes); a
  previously sold/removed IMEI/serial can be re-added (revive-vs-new).

## Progress (build order §8)
- ✅ Phase 1 — Vite SPA skeleton
- ✅ Phase 2 — read-only data audit (`docs/phase2-audit.md`)
- ✅ Phase 3 — schema migration (`supabase/migrations/20260701_phase3_schema.sql`) — staging
- ✅ Phase 4 — RLS + `auth_role()` + views + test users (`20260701_phase4_rls.sql`) — staging
- ✅ Phase 5 — atomic RPCs (`20260701_phase5_rpcs.sql`) — staging
- ✅ **Phase 6 — data layer + auth rewrite (staging)**: `AuthContext.tsx` (Supabase Auth, role from
  profiles, PIN-override capability), `LoginScreen.tsx`, `mappers.ts`; `api.ts` = TanStack Query hooks
  over views/RPCs; modals wired; `20260702_phase6_data_layer.sql`. Verified 13/13 (owner sees
  cost/profit; staff none; real UI checkout wrote a sale).
- ✅ **Phase 7 — multi-store scoping (staging)** `20260702_phase7_multistore.sql`: staff-facing views
  filter to the caller's store (owner sees all); `daily_revenue` force-scopes staff to own store;
  `enforce_staff_store` trigger blocks a staff profile with null store_id; owner store-switcher in
  Header (zustand `useStoreScope`, persisted) scopes owner listings + stamps store_id on owner writes.
  Verified: staff isolated per store, owner sees/switches both.
- ✅ **Phase 8a — device_type / serial support (staging)** `20260702_phase8a_device_type.sql`:
  Device Type selector (Phone/Tablet/Watch) in Add/Edit modals; serial required for tablet/watch,
  IMEI optional; search + POS lookup match serial; inventory shows device badge + right identifier.
  Verified 5/5.
- ✅ **Phase 8b — duplicate-IMEI revive-vs-new (staging)** `20260702_phase8b_revive.sql`:
  `find_phone_by_identifier` RPC; AddUnitModal prompts Revive (keeps id/history) vs Create-new for a
  prior sold/soft-deleted IMEI/serial, blocks active duplicates; `upsert_phone` un-deletes on revive;
  **checkout trade-in revives** a prior unit instead of duplicating. Verified 7/7 + 0 dup active
  imei/serial. (Resolves follow-up #1.)
- ✅ **Phase 8c — sales date-range filter + monthly dashboard (staging, Issue #2)** — no DB change
  (`date` is `YYYY-MM-DD` text → lexicographic gte/lte is correct): `useSales(range?)` pushes
  `.gte/.lte('date')` into the query; Sales Log presets Today/Week/Month/All/Custom (default This
  Month); Dashboard month picker + monthly summary (revenue, count, owner-only profit) via a second
  month-scoped `useSales`. Asia/Colombo date helpers in `utils.ts` (`todayColombo`/`startOfWeekColombo`/
  `monthColombo`/`monthBounds`). Verified 9/9 (owner: month 2026-06 = 255 sales / 14,041,250 matches
  manual sum, server range == client filter, months disjoint; staff: range works, zero cost/profit).
- ✅ **Phase 8d — trade-in-return flow (staging, Issue #3)** `20260702_phase8d_trade_in_return.sql`:
  `return_item` `trade-in-return` branch now **moves the replacement phone out** — restocks the
  returned phone, marks the chosen in-stock replacement sold, and swaps returned→replacement inside
  the sale's cost/price snapshot so **profit follows the device** (cost stays in `phone_costs`; B's
  cost only read in, R's untouched for resale). Delta recorded on the return row + an exchange row
  (`cash_difference` + `difference_direction`). Revenue by direction: store-credit/refunded/customer-paid
  → `old − p_ret + p_rep`; zeroed → keep `old` (shop keeps surplus). ReturnModal gets an "Exchange for
  device" mode (default) with replacement picker + direction selector (cash refund behind a confirm);
  "Cash / refund" mode = the old straight return. Verified 13/13 (50k→45k: R in-stock, B sold, rev 45k,
  5k store-credit, profit 7,000; zeroed=12,000; customer-paid 60k; straight cash return; forced-failure
  rollback leaves no partial writes). Resolves follow-up #3. `[8D]`-tagged test phones left on staging.
- ✅ **Phase 8e — payment method + customer records (staging)** `20260702_phase8e_customer_link.sql`:
  POS gets a Cash/Card selector (wired to `checkout.payment_method`) + optional customer Name/NIC
  (WhatsApp already captured); Sales Log shows a payment badge. `checkout` RPC now takes an optional
  `payload.customer {name,nic,whatsapp}` — deduped (NIC then WhatsApp), insert-or-reuse, linked via
  `sales.customer_id`; written inside the SECURITY DEFINER RPC so **staff can attach a customer at
  checkout without gaining read access** to the owner-only `customers` table. New owner-only Customers
  page (list + per-customer purchase history, `useCustomers` owner-gated, nav hidden for staff).
  Verified 10/10 (cash/card saved+shown; customer created+linked; NIC dedup=1 row/2 sales/LKR 60k;
  staff reads 0 customer rows but CAN attach at checkout). `[8E]` test phones left on staging.
- ✅ **Phase 8f — PDF fixes (staging)** `20260702_phase8f_sale_notes.sql`: `pdfBill.ts` now prints
  totals **verbatim** from the persisted sale (new `totals {subtotal,discount,tradeIn,grandTotal}`,
  no recalculation) so bill == Sales Log; real payment badge (PAID · CASH/CARD); **Special Notes +
  T&C both render** with A5 overflow → second page; per-sale note reuses the existing `sales.notes`
  column (checkout RPC now writes `payload.notes`; `mapSale` maps `notes`→`specialNotes`; POS notes
  textarea; reprint reuses the exact bill). Cleared the `pdfBill` build errors. Verified: 5 sample
  PDFs (cash/card/trade-in/2-page overflow/notes+T&C) + a LIVE owner checkout (note persisted,
  net_payable/cost correct, reprint matches). `[8F-TEST]` sale left on staging.
- ✅ **Phase 8g — staff lock + staff dashboard + other-brand (staging, no DB change)**: Inventory
  Delete (phone+accessory) now gated by `requireAdmin`; POS "+ TRADE-IN" entry gated by `requireAdmin`
  (staff can't set exchange values without owner PIN); Edit/Add already gated. Dashboard renders a
  **Daily-Revenue-only** view for non-owners (profit/cost/ROI/monthly/chart/history hidden). **"Other
  (Android / specify)"** free-text model in Add/Edit/Exchange modals (model is free-text; writes
  through `upsert_phone`/`checkout`, no schema change). Verified live: staff RLS-blocked from deleting
  stock, other-brand model persists verbatim + sells. `[8G-TEST]` rows on staging. (Client Issue 7 +
  "Android not available for exchange".) **`phone_swap` left unwired** — no pure device-swap UI;
  open question for the client (trade-in + trade-in-return already cover the real workflows).
- ✅ **Phase 8h — correctness sweep + build-green (staging, no DB change)**: **profit audited** —
  every calc uses `total_revenue − COGS` (never `net_payable`), so no trade-in double-count (worked
  example: goods 150k, trade-in 40k, COGS 78k → profit 72k; `net_payable−COGS` would wrongly give 32k).
  **Timezone → Asia/Colombo**: Dashboard today/month + 7-day chart (new `lastNDaysColombo`/
  `weekdayShortColombo`), POS sale date/time, SalesLog export filename (fixes the weekly off-by-one).
  **Phone counts**: IN STOCK/SOLD badges on Inventory (store-scoped). **Build GREEN**: Sidebar dead
  sync code removed, `AddUnitModal` `status as const`, Dashboard unused `entry` dropped — `npm run
  build` passes (`tsc -b` + `vite build`). Legacy zero-cost rows still need owner backfill (data, not math).
- ✅ **Phase 9 — PWA + Vercel config (no DB change)**: `vite-plugin-pwa` wired in `vite.config.ts`
  (manifest "ClickZone POS", standalone, black theme, icons from `public/`; `registerType: autoUpdate`,
  auto SW registration). **Online-first SW**: precache the app shell; **Supabase = `NetworkOnly`** (auth/
  stock never cached → no staleness). `vercel.json` = SPA rewrite + no-cache headers on sw/manifest.
  `index.html` PWA meta; `main.tsx` `storage.persist()`. Build GREEN, emits `sw.js`/`manifest.webmanifest`;
  runtime-verified (preview: sw/manifest/icon 200, `/inventory` → app shell). **Deploy is the owner's step**
  (Vercel import + env vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` pointed at **staging**). Icons are
  proper **PNGs** (192, 512-any, 512-maskable padded) generated from `pwa-icon-1024.jpg` via `sharp`
  (`scripts/gen-icons.mjs`) — Chrome install prompt works. (Fixed after the first deploy showed no
  install: JPEG 500²/1024² icons don't satisfy Chrome's PNG 192/512 requirement.)
- ✅ **Phase 10 — full verification pass (staging, no code change)**: all 6 GO — staff-JWT RLS (staff gets
  0 cost/profit/customer rows, writes 403/0; owner sees data), checkout race (1 wins, no double-sell),
  profit = revenue−COGS with no trade-in double-count (plain/trade-in/trade-in-return), trade-in-return
  50k→45k (delta 5k store-credit, profit 7k follows the device), PDF (T&C+notes render, 2-page overflow,
  **bill == real persisted sale** 150k/40k/110k), multi-store isolation + `daily_revenue` force-scoped.
  Report + sample bills: `docs/phase10-verification.md`, `docs/phase10-bills/`. `[PH10-*]` test rows on staging.
- ⏭️ **NEXT: Phase 11** — backup gate (Free→Pro or nightly dump) + production cutover (§6). Pre-cutover
  must-do: **zero-cost backfill** (`docs/zero-cost-backfill.csv`), real accounts + real override PIN, no
  staging test-user seed on prod. Open: `phone_swap` unwired (confirm with client or remove at cleanup).
- Note: `npm run build` still red on PRE-EXISTING errors cleared in **8h** (app runs via `vite dev`):
  `Sidebar` (legacy sync-status dead code), `AddUnitModal` (latent 8a `status: string` typing),
  one unused `entry` in Dashboard's chart map. `pdfBill` is now type-clean.

## Phase-5 RPC follow-ups
1. ✅ RESOLVED (Phase 8b) — checkout trade-in now revives instead of duplicating.
2. **total_revenue contract:** checkout sets `net_payable = total_revenue − trade_in_value`,
   assuming the client sends the **GROSS** total (POS now does). Keep this contract to avoid the
   profit double-count (dashboard double-count check in **8h**).
3. ✅ RESOLVED (Phase 8d) — `return_item` `trade-in-return` now restocks the returned phone, marks the
   chosen replacement sold, and swaps the sale's cost snapshot to the replacement so profit reconciles.
4. ✅ RESOLVED (Phase 7) — `daily_revenue` now store-scopes staff. (Minor still open: `return_status`
   is always `'returned'`, no partial/full distinction.)

## Remaining Phase 8 sub-chunks
8c date ranges/monthly · 8d trade-in-return flow · 8e payment method (Cash/Card) + customer records ·
8f PDF fixes (T&C + Special Notes both render; bill == sales values) · 8g staff lock + daily-revenue
staff dashboard · 8h profit double-count / Asia-Colombo timezone / in-stock vs sold counts.

## Staging test users / stores
- Owner: `owner@clickzone.test` / `ClickZoneOwner!2026`
- Staff (Kandy): `staff@clickzone.test` / `ClickZoneStaff!2026`
- Staff-2 (Test-2): `staff2@clickzone.test` / `ClickZoneStaff2!2026`
- Stores: Kandy `a0000000-0000-4000-8000-000000000001`; Test-2 `a0000000-0000-4000-8000-000000000002`
  (staging-only test store). Override PIN default `4321`.
- Staging carries `[8A-TEST]`/`[8B-TEST]` marker rows from verification — safe to delete anytime.

## Git
- `clickzone-web/` is a git repo on branch **`web-migration`**. Commit at the end of each chunk
  (message trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).
- `.env`, `.env.staging`, `docs/backups/` are **gitignored** (secrets + customer-data snapshots out
  of history). Commits so far: `67466cb` (init through 8a), `5452c1f` (8b).

## Working rules
- Every DB write goes to **staging (`ttaexrsipmwxhciisufc`) only**; confirm the ref before writing.
  Production `zahoixqvkshqalvvrtbs` is read-only until cutover.
- Each phase: snapshot → show SQL/diff → get approval → apply → verify → report → pause. Save DB
  changes as versioned files in `supabase/migrations/` (replayable at cutover).
- Backups/snapshots live under `docs/backups/<date>*/` (gitignored).
