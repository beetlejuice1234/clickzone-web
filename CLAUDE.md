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
- ⏭️ **NEXT: Phase 8d** — trade-in-return flow (`return_item` `trade-in-return` + `difference_direction`;
  resolves follow-up #3). Then 8e–8h (see below). Small sub-sessions, commit between each.
- Note: `npm run build` is red on PRE-EXISTING errors in Sidebar (legacy sync-status dead code),
  ReturnModal/pdfBill (8d/8f), and one unused `entry` in Dashboard's chart map. The app runs via
  `vite dev`; 8c files (`utils.ts`/`api.ts`/`SalesLog.tsx` + new Dashboard code) are type-clean.

## Phase-5 RPC follow-ups
1. ✅ RESOLVED (Phase 8b) — checkout trade-in now revives instead of duplicating.
2. **total_revenue contract:** checkout sets `net_payable = total_revenue − trade_in_value`,
   assuming the client sends the **GROSS** total (POS now does). Keep this contract to avoid the
   profit double-count (dashboard double-count check in **8h**).
3. **trade-in-return doesn't move the replacement phone out** — `return_item` records the return +
   delta but doesn't mark the different phone the customer takes as sold (**Phase 8d**).
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
