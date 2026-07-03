# ClickZone Web POS — Handoff (read this first)

A cloud-first PWA rebuild of the ClickZone Mobiles POS (Kandy phone shop) on **Supabase only**
(Auth + Postgres + RLS + plpgsql RPCs) with a React 19 + Vite + TS + Tailwind + shadcn frontend.
This file is the fast entry point. Deeper context: **`CLAUDE.md`** (in this folder) and, if you have the
parent folder, `../BUILD_PROGRESS.md`, `../IMPLEMENTATION_RUNBOOK.md`, `../.handoff/`.

---

## 1. The one rule that matters most: two Supabase projects
| Project | Ref | Role |
|---|---|---|
| **STAGING** | `ttaexrsipmwxhciisufc` | Safe clone. **All build/test work targets this.** `.env` points here. |
| **PRODUCTION** | `zahoixqvkshqalvvrtbs` | The shop's **LIVE** DB (old Electron app still writes to it). **Never touch until cutover.** |

Strategy = **Path C**: build/verify on staging, keep the shop on the old app, do one final cutover at the end.

## 2. Repo, branches, hosting
- **GitHub:** `https://github.com/beetlejuice1234/clickzone-web`
- **`web-migration`** — the mainline. Phases 1–10 complete, build green, deployed to Vercel (staging-backed). This is what becomes production at cutover.
- **`redesign`** — a **skin-only** visual redesign (warm teal/cream/terracotta theme). **NOT merged.** Awaiting review. Before/after context in `docs/redesign-screens/`. Zero logic/DB changes — pure presentation. Merge into `web-migration` when approved.
- **Vercel:** connected to the GitHub repo. `web-migration` = the deploy; each branch also gets a preview URL. Env vars live in Vercel (not committed): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — **set to staging**.
- **Auth to push:** repo is public; pushing needs a collaborator/owner GitHub login.

## 3. Run it locally
```
cd clickzone-web
npm install
npm run dev      # http://localhost:3000  (points at STAGING via .env)
npm run build    # tsc -b && vite build — currently GREEN
```
`.env` is gitignored (secrets). Copy `.env.example` / `.env.staging` values if missing.

**Staging test accounts:**
- Owner — `owner@clickzone.test` / `ClickZoneOwner!2026`
- Staff (Kandy) — `staff@clickzone.test` / `ClickZoneStaff!2026`
- Staff-2 (Test-2 store) — `staff2@clickzone.test` / `ClickZoneStaff2!2026`
- Override PIN (staging): `4321`. Stores: Kandy `a0000000-0000-4000-8000-000000000001`, Test-2 `…0002`.

## 4. Architecture / conventions (don't break these)
- **DB is snake_case; app is camelCase** via `src/lib/mappers.ts`. Keep both in sync.
- **Cost/profit is hidden from staff *in the DB*** — cost lives in the owner-only `phone_costs` table, surfaced only through owner views. Staff read cost-free `v_*_public` views; owner reads `v_*_full` / `v_sales_profit`. RLS on every table, backed by an `auth_role()` SECURITY DEFINER helper. `isAdmin` is **fail-closed**.
- All money/stock mutations go through **atomic plpgsql RPCs**: `checkout`, `return_item`, `phone_swap`, `upsert_phone`, `find_phone_by_identifier`, `verify_override_pin`, `daily_revenue`. No unguarded multi-step client writes. Dates pinned to **Asia/Colombo**.
- Every DB migration: **staging only, single transaction, replayable, saved to `supabase/migrations/`** (replayed against production at cutover).
- Data layer = TanStack Query hooks over views/RPCs in `src/lib/api.ts`. Auth = Supabase Auth in `src/contexts/AuthContext.tsx`.

## 5. Status — what's DONE (Phases 1–10, all on staging, build green)
- **1–7:** SPA skeleton, data audit, schema migration (cost-split, partial unique indexes, `device_type`/`serial`, `store_id`, etc.), RLS + views + `auth_role()`, atomic RPCs, data-layer + Supabase Auth rewrite, multi-store scoping.
- **8a–8e:** serial/device-type (Watch/iPad), duplicate-IMEI revive, sales date-range + monthly dashboard, trade-in-return flow, payment method (Cash/Card) + customer records.
- **8f:** PDF bill fixes — bill total == persisted sale (no recalculation), Special Notes + T&C both render, A5 overflow → 2nd page, payment badge. (`20260702_phase8f_sale_notes.sql` — reuses the existing `sales.notes` column.)
- **8g:** staff lock (Delete + trade-in gated by owner PIN) + Daily-Revenue-only staff dashboard + "Other/Android" free-text model in Add/Edit/Exchange.
- **8h:** profit audit (revenue − COGS, no trade-in double-count — verified), Asia/Colombo timezone sweep, in-stock/sold counts, build-green cleanup.
- **9:** PWA (`vite-plugin-pwa`: manifest + online-first SW, Supabase = NetworkOnly, real PNG icons) + `vercel.json` (SPA rewrite). Deployed to Vercel (staging).
- **10:** full verification pass — all 6 GO. Evidence + sample bills in **`docs/phase10-verification.md`** and `docs/phase10-bills/`. (Staff-JWT RLS proof, checkout race/no-double-sell, profit reconciliation, trade-in-return math, PDF == record, multi-store isolation.)

**Post-Phase-10 bill fixes (on `web-migration`):**
- Sale completion now **opens the bill PDF in a new tab on desktop** (was popping an empty Web Share sheet); mobile keeps the share sheet; download fallback if a tab is blocked. Same for reprint + Sales Log.
- Fixed the **TOTAL DUE / LKR overlap** on the bill (label moved left of the amount).
- Removed the broken `♛` crown glyph; added an **invisible "SevIT" easter egg** in every bill (PDF render mode 3 — select-all to find it).

## 6. What's LEFT
- **Phase 11 — backup gate + production cutover** (the only phase that touches production; do in a maintenance window). Checklist in `CLAUDE.md` §"Cutover" / `../BUILD_PROGRESS.md` §6:
  1. **Decide backups:** Supabase **Free → Pro** (recommended, automated backups) or nightly `pg_dump`. Don't go live with neither.
  2. **Zero-cost backfill:** ~111 phones + 68 accessories have `cost = 0` (legacy) — owner backfills from `docs/zero-cost-backfill.csv` so historical profit isn't inflated. (Profit *math* is verified correct; this is data.)
  3. Backup production, replay `supabase/migrations/*` (phase3→…→phase8f) against a fresh prod snapshot **in order**, create **real** owner/staff accounts + a **real** override PIN (not `4321`), repoint `.env` to production, deploy, smoke-test, go live. **Do NOT run the staging test-user seed on production.**
- **Redesign branch:** review `redesign` and decide whether to merge into `web-migration` before or after cutover.

## 7. Open questions / notes for the client
- **`phone_swap` RPC is built + tested but has no UI** (dead code). Ask the client: "do you ever do a straight device-for-device swap that isn't a purchase or a return?" If no → remove at cleanup; if yes → small chunk to wire a UI.
- Lost legacy trade-in/return detail (pre-migration) was accepted as denormalized history; full records enforced going forward.
- Staging carries `[8x-TEST]`, `[8F/8G-TEST]`, `[PH10-*]` marker rows from verification — safe to delete; they won't reach production (cutover replays schema, not staging rows).

## 8. Migration files (all on staging, replayable at cutover)
`supabase/migrations/`: `20260701_phase3_schema.sql`, `…phase4_rls.sql`, `…phase5_rpcs.sql`,
`20260702_phase6_data_layer.sql`, `…phase7_multistore.sql`, `…phase8a_device_type.sql`,
`…phase8b_revive.sql`, `…phase8d_trade_in_return.sql`, `…phase8e_customer_link.sql`, `…phase8f_sale_notes.sql`.

## 9. Working rhythm (please keep it)
One phase/chunk at a time → verify on staging → show the SQL before applying any DB change → commit
between each → pause at the gate for review. Never write to production `zahoixqvkshqalvvrtbs` before cutover.
