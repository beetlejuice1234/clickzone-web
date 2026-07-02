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
- Money mutations go through atomic `plpgsql` RPCs (all SECURITY DEFINER, `search_path=public`,
  internal `auth_role()` gate, EXECUTE to `authenticated`): `checkout`, `return_item`,
  `phone_swap`, `verify_override_pin`, `daily_revenue`, `upsert_phone`.
- Dates pinned to **Asia/Colombo** in RPCs.

## Progress (build order §8)
- ✅ Phase 1 — Vite SPA skeleton
- ✅ Phase 2 — read-only data audit (`docs/phase2-audit.md`)
- ✅ Phase 3 — schema migration (`supabase/migrations/20260701_phase3_schema.sql`) — staging
- ✅ Phase 4 — RLS + `auth_role()` + views + test users (`20260701_phase4_rls.sql`) — staging
- ✅ Phase 5 — atomic RPCs (`20260701_phase5_rpcs.sql`) — staging
- ✅ **Phase 6 — data layer + auth rewrite (COMPLETE, staging)**:
  - Stage A: `AuthContext.tsx` (Supabase Auth, role from profiles, PIN-override capability),
    `LoginScreen.tsx`, `mappers.ts`.
  - Stage B: `api.ts` rewritten as TanStack Query hooks over the views/RPCs; modals wired
    (`upsert_phone`/`checkout`/`return_item` etc.); `20260702_phase6_data_layer.sql`.
  - Verified 13/13: owner sees 353 active phones + 462 sales WITH cost/profit; staff sees
    inventory with NO cost and NO profit; a real UI checkout wrote a sale via the RPC.
- ⏭️ **NEXT: Phase 7** — wire all pages/modals end-to-end on the new layer + owner store-switcher
  / staff store pinning. (Do NOT build the Phase 8 client-issue features yet.)

## Phase-5 RPC follow-ups (deferred — fix in the noted phases)
1. **Checkout trade-in always inserts a NEW phones row** even if that IMEI existed before (sold),
   whereas `phone_swap` revives the old one → decide revive-vs-duplicate for consistency (**Phase 8b**).
2. **total_revenue contract:** checkout sets `net_payable = total_revenue − trade_in_value`,
   assuming the client sends the **GROSS** total (POS now does). Keep this contract to avoid the
   profit double-count (**Phase 6/8**; dashboard double-count fix in **8h**).
3. **trade-in-return doesn't move the replacement phone out** — `return_item` records the return +
   delta but doesn't mark the different phone the customer takes as sold (**Phase 8d**).
4. **Minor:** `return_status` is always `'returned'` (no partial/full); `daily_revenue` isn't
   store-scoped for staff yet (**Phase 7**).

## Staging test users
- Owner: `owner@clickzone.test` / `ClickZoneOwner!2026`
- Staff: `staff@clickzone.test` / `ClickZoneStaff!2026`
- Kandy store id: `a0000000-0000-4000-8000-000000000001`; override PIN default `4321`.

## Working rules
- Every DB write goes to **staging (`ttaexrsipmwxhciisufc`) only**; confirm the ref before writing.
- Each phase: snapshot → show SQL/diff → get approval → apply → verify → report → pause. Save DB
  changes as versioned files in `supabase/migrations/` (replayable at cutover).
- Backups/snapshots live under `docs/backups/<date>*/`.
