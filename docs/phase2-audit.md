# Phase 2 — Supabase Data Audit (read-only)

**Date:** 2026-07-01
**Project:** `clickzonepos` — ref `zahoixqvkshqalvvrtbs` (ap-southeast-1, Postgres 17.6)
**Scope:** Observation only. Every statement was a read-only `SELECT`. No INSERT/UPDATE/DELETE/DDL, no migration tooling, no data or app-code changes.
**Source plan:** `.handoff/CLICKZONE_WEB_BUILD_PLAN (1).md` §3.4 + `IMPLEMENTATION_RUNBOOK.md` Phase 2.

---

## Summary of findings

| # | Audit item | Result |
|---|---|---|
| 1 | Duplicate IMEIs in active stock | **0** — impossible today (global unique index on `imei`) |
| 2 | Soft-deletes / IMEI re-entry blocking | 37 soft-deleted phones; **304 distinct IMEIs locked from re-entry** by the global unique index → root cause of client Issue #4 |
| 3 | Orphan exchanges/returns | `returns`/`exchanges` tables are **empty**; but **108 sales** have dangling `exchange_id`/`trade_in_value` refs and **7** have dangling return refs to those empty tables |
| 4 | Null / garbage cost & price | **111** active phones with `cost_price=0` (none are trade-ins), **42** phones with `target_sale_price=0`, **68** accessories with `cost_price=0`, 5 sales with `total_revenue=0` |
| 5 | Column casing | snake_case is canonical & populated; smushed-lowercase duplicates are **dead/empty**; `returns`/`exchanges` columns are prefixed with **U+00A0 non-breaking spaces** (broken); `is_deleted` is boolean on main tables, integer on returns/exchanges |
| 6 | Row counts | phones 382, accessories 390, sales 456, returns 0, exchanges 0, services 0 |

---

## Detailed results

### 6. Row counts
| Table | Rows | Soft-deleted |
|---|---|---|
| phones | 382 | 37 |
| accessories | 390 | 5 |
| sales | 456 | 2 |
| returns | 0 | — |
| exchanges | 0 | — |
| services | 0 | — |

`phones` status × `is_deleted`: in-stock/live **78**, in-stock/deleted 30, sold/live 267, sold/deleted 7.
Active (sellable) stock = **78** phones. Source mix (active): purchased 251, trade-in 73, returned 21.

### 1. Duplicate IMEIs in active stock — NONE
No duplicates. `phones.imei` has a **global** unique index `phones_imei_key` (`CREATE UNIQUE INDEX phones_imei_key ON public.phones USING btree (imei)`), so duplicates are currently impossible across the whole table. All 382 phones have a non-null IMEI (0 nulls).

### 2. Soft-deletes & IMEI re-entry blocking — 304 IMEIs locked
- Soft-deleted rows: 37 phones, 5 accessories, 2 sales.
- The global unique index spans **all** rows (sold + soft-deleted included), so **304 distinct IMEIs cannot be re-added** (267 sold-but-live + 30 in-stock-but-deleted + 7 sold-and-deleted).
- **Root cause of client Issue #4.** Fix (Phase 3, per plan §3.1): replace the global unique index with a **partial** one — `WHERE is_deleted = false AND status = 'in-stock'`.

### 3. Orphans — child tables empty, sales hold dangling refs
- `returns`→`sales` and `exchanges`→`sales` orphans: **0** (both child tables empty).
- Reverse direction: **108 live sales** reference exchange/trade-in data (`exchange_id` + `trade_in_value` set) and **7** reference a return, but `exchanges`/`returns` hold **0 rows**. Detailed trade-in/return records (valuation, customer NIC, condition, refund method) never landed or were wiped; only denormalized summary fields on `sales`/`phones` survive.

### 4. Null / garbage cost & price
| Scope | Finding |
|---|---|
| phones (active) | 111 rows `cost_price = 0` (none negative/null); **all 111 are `source='purchased'`/`'returned'`, none trade-ins** → genuinely missing cost, profit overstated |
| phones (active) | 42 rows `target_sale_price = 0`. No inverted margins (`cost > real_price` = 0); the "cost>price" rows are exactly the price=0 ones |
| accessories (active) | 68 rows `cost_price = 0` (price column clean) |
| sales (active) | 5 rows `total_revenue = 0`; no negatives, no null payables |

### 5. Column casing — structural findings
**(a) Duplicate columns; only snake_case holds data:**
| Table | Dead (legacy, 0 populated) | Live (canonical) |
|---|---|---|
| phones | `exchangeid` (0) | `exchange_id` (109) |
| accessories | `minstocklevel` | `min_stock_level` |
| sales | `returnstatus`(0), `totalrefunded`(0), `exchangeid`(0), `tradeinvalue`(0), `netpayable`(0) | `return_status`(8), `total_refunded`(8), `exchange_id`(109), `trade_in_value`(109), `net_payable`(456) |

**(b) `returns` & `exchanges` broken column names:** every column prefixed with two U+00A0 non-breaking spaces (`first_char_code = 160`, not 32). Only referenceable with exact NBSP quoting. Both tables empty → drop & recreate cleanly.

**(c) `is_deleted` type drift:** boolean on phones/accessories/sales/services; integer (`isdeleted`, 0/1) on returns/exchanges. Plan's `is_deleted=1` must become `is_deleted = true` for the main tables.

---

## Recommendation — naming convention

**Standardize on `snake_case` in the DB with a typed mapping layer (DB `snake_case` ↔ TS `camelCase`), per plan §3.1.** Rationale:

1. The canonical, **populated** columns are already snake_case — choosing snake_case means **no data movement** for live columns; just drop the dead lowercase twins.
2. `returns`/`exchanges` are empty and structurally broken (NBSP names) → recreated from scratch in Phase 3 at no migration cost.
3. A thin mapping layer in `src/types` + the `api.ts` hooks (already flagged as a Phase-6 TODO in the Phase-1 stub) keeps React components on camelCase while the DB stays snake_case, matching Supabase generated-types convention.

Avoid "keep quoted camelCase" — requires quoting identifiers everywhere and doesn't match the data that's actually present.

---

## Cleanup backlog (NOT executed — for a separate, explicitly-approved Phase 3 step)
1. Replace global `phones_imei_key` with a **partial** unique index → unblocks the 304 re-entry IMEIs (Issue #4).
2. Triage/backfill 111 phones + 68 accessories with `cost_price = 0` and 42 phones with `target_sale_price = 0` (profit accuracy).
3. Drop dead duplicate columns (`exchangeid`, `returnstatus`, `totalrefunded`, `tradeinvalue`, `netpayable`, `minstocklevel`) after confirming nothing reads them.
4. Drop & recreate `returns`/`exchanges` with clean snake_case names (removes NBSP columns); decide whether the 108 dangling trade-in / 7 return refs on `sales` need reconstructed parent rows or are acceptable as denormalized history.
5. Standardize `is_deleted` to boolean across all tables.
6. Assign every row a `store_id` (Kandy) once `stores` exists.

---

## Appendix — exact SQL executed (all read-only)

```sql
-- A. Column casing / spacing inventory
SELECT table_name, ordinal_position, column_name, data_type,
       (column_name <> lower(column_name))           AS has_uppercase,
       (column_name ~ '(^\s)|(\s$)')                 AS has_edge_space,
       (column_name ~ '_')                           AS has_underscore
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('phones','accessories','sales','returns','exchanges','services')
ORDER BY table_name, ordinal_position;

-- B. Indexes on phones/accessories/sales
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('phones','accessories','sales')
ORDER BY tablename, indexname;

-- C. Row counts + soft-delete split
SELECT 'phones' t, count(*) total, count(*) FILTER (WHERE is_deleted) soft_deleted FROM phones
UNION ALL SELECT 'accessories', count(*), count(*) FILTER (WHERE is_deleted) FROM accessories
UNION ALL SELECT 'sales', count(*), count(*) FILTER (WHERE is_deleted) FROM sales
UNION ALL SELECT 'services', count(*), count(*) FILTER (WHERE is_deleted) FROM services
UNION ALL SELECT 'returns', count(*), NULL FROM returns
UNION ALL SELECT 'exchanges', count(*), NULL FROM exchanges
ORDER BY t;

-- D. phones status × is_deleted
SELECT status, is_deleted, count(*) AS n FROM phones GROUP BY status, is_deleted ORDER BY status, is_deleted;

-- E. Duplicate IMEIs in active stock
SELECT imei, count(*) AS copies, array_agg(id) AS phone_ids, array_agg(model) AS models
FROM phones WHERE is_deleted = false AND status = 'in-stock'
GROUP BY imei HAVING count(*) > 1 ORDER BY copies DESC, imei;

-- F. IMEI re-entry blocking
SELECT
  count(*) FILTER (WHERE imei IS NOT NULL AND (is_deleted = true OR status <> 'in-stock')) AS inactive_rows_with_imei,
  count(DISTINCT imei) FILTER (WHERE is_deleted = true OR status <> 'in-stock') AS distinct_blocking_imeis,
  count(*) FILTER (WHERE imei IS NULL) AS rows_null_imei,
  count(*) FILTER (WHERE imei IS NOT NULL AND is_deleted = false AND status = 'in-stock') AS active_in_stock_with_imei
FROM phones;

-- G. Null/garbage cost & price (phones, accessories)
SELECT 'phones (active)' AS scope,
  count(*) FILTER (WHERE cost_price IS NULL) AS cost_null,
  count(*) FILTER (WHERE cost_price <= 0) AS cost_le_0,
  count(*) FILTER (WHERE target_sale_price IS NULL) AS price_null,
  count(*) FILTER (WHERE target_sale_price <= 0) AS price_le_0,
  count(*) FILTER (WHERE cost_price IS NOT NULL AND target_sale_price IS NOT NULL AND cost_price > target_sale_price) AS cost_gt_price
FROM phones WHERE is_deleted = false
UNION ALL
SELECT 'accessories (active)',
  count(*) FILTER (WHERE cost_price IS NULL),
  count(*) FILTER (WHERE cost_price <= 0),
  count(*) FILTER (WHERE sale_price IS NULL),
  count(*) FILTER (WHERE sale_price <= 0),
  count(*) FILTER (WHERE cost_price IS NOT NULL AND sale_price IS NOT NULL AND cost_price > sale_price)
FROM accessories WHERE is_deleted = false;

-- G2. Null/garbage on sales
SELECT count(*) AS rows,
  count(*) FILTER (WHERE total_revenue IS NULL) AS rev_null,
  count(*) FILTER (WHERE total_revenue < 0) AS rev_neg,
  count(*) FILTER (WHERE total_revenue = 0) AS rev_zero,
  count(*) FILTER (WHERE total_discount < 0) AS disc_neg,
  count(*) FILTER (WHERE net_payable IS NULL AND netpayable IS NULL) AS netpay_both_null
FROM sales WHERE is_deleted = false;

-- H. Duplicate-column population (phones + sales)
SELECT
  (SELECT count(*) FROM phones) AS phone_rows,
  (SELECT count(exchangeid) FROM phones) AS phones_exchangeid_set,
  (SELECT count(exchange_id) FROM phones) AS phones_exchange_id_set,
  (SELECT count(*) FROM sales) AS sale_rows,
  (SELECT count(*) FROM sales WHERE returnstatus IS NOT NULL AND returnstatus <> 'none') AS returnstatus_set,
  (SELECT count(*) FROM sales WHERE return_status IS NOT NULL AND return_status <> 'none') AS return_status_set,
  (SELECT count(*) FROM sales WHERE totalrefunded > 0) AS totalrefunded_set,
  (SELECT count(*) FROM sales WHERE total_refunded > 0) AS total_refunded_set,
  (SELECT count(exchangeid) FROM sales) AS sales_exchangeid_set,
  (SELECT count(exchange_id) FROM sales) AS sales_exchange_id_set,
  (SELECT count(*) FROM sales WHERE tradeinvalue > 0) AS tradeinvalue_set,
  (SELECT count(*) FROM sales WHERE trade_in_value > 0) AS trade_in_value_set,
  (SELECT count(netpayable) FROM sales) AS netpayable_set,
  (SELECT count(net_payable) FROM sales) AS net_payable_set;

-- I. Byte identity of leading "space" in returns/exchanges column names
SELECT table_name,
       ascii(substring(column_name from 1 for 1)) AS first_char_code,
       ascii(substring(column_name from 2 for 1)) AS second_char_code,
       length(column_name) - length(ltrim(column_name)) AS leading_ws_chars,
       octet_length(column_name) AS bytes,
       length(column_name) AS chars
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('returns','exchanges') AND ordinal_position = 1;

-- J. Sales referencing exchange/trade-in/return data (children empty → dangling)
SELECT
  count(*) FILTER (WHERE coalesce(exchange_id, exchangeid) IS NOT NULL) AS sales_with_exchange_ref,
  count(*) FILTER (WHERE coalesce(trade_in_value, tradeinvalue, 0) > 0) AS sales_with_tradein_value,
  count(*) FILTER (WHERE coalesce(return_status, returnstatus, 'none') <> 'none') AS sales_with_return_status
FROM sales WHERE is_deleted = false;

-- K. Cost=0 breakdown by source; source distribution
SELECT
  count(*) FILTER (WHERE cost_price = 0) AS cost_eq_0,
  count(*) FILTER (WHERE cost_price < 0) AS cost_lt_0,
  count(*) FILTER (WHERE cost_price <= 0 AND source = 'trade-in') AS cost_le0_tradein,
  count(*) FILTER (WHERE cost_price <= 0 AND source IS DISTINCT FROM 'trade-in') AS cost_le0_not_tradein,
  count(*) FILTER (WHERE target_sale_price > 0 AND cost_price > target_sale_price) AS cost_gt_real_price
FROM phones WHERE is_deleted = false;

SELECT coalesce(source,'(null)') AS source, count(*) AS n
FROM phones WHERE is_deleted = false GROUP BY source ORDER BY n DESC;
```
