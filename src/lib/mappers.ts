// snake_case (Supabase/Postgres) <-> camelCase (React components) mapping layer.
// DB is snake_case; components use camelCase (costPrice, targetSalePrice, ...).
// The `items` JSON inside sales is already camelCase (SaleItem[]) — passed through as-is.
//
// Cost note (Phase 3/4): phones no longer carry cost_price — it lives in the owner-only
// phone_costs table and is surfaced (owner only) via v_phones_full as `cost_price`.
// For staff reads (v_phones_public) there is no cost column, so costPrice maps to 0.

import type {
  PhoneUnit, Accessory, SaleRecord, SaleItem, ReturnRecord, ExchangeRecord,
  ConditionGrade, UnitStatus, ItemSource, DeviceType,
} from '@/types';

const b2n = (v: unknown): number => (v === true || v === 1 || v === '1' ? 1 : 0);
const num = (v: unknown, d = 0): number => (v === null || v === undefined ? d : Number(v));

/* ---------------------------------------------------------------- reads (row -> model) */

export function mapPhone(row: Record<string, unknown>): PhoneUnit {
  return {
    id: row.id as string,
    imei: (row.imei as string) ?? '',
    deviceType: (row.device_type as DeviceType) ?? 'phone',
    serialNumber: (row.serial_number as string) ?? undefined,
    model: (row.model as string) ?? '',
    storage: (row.storage as string) ?? '',
    color: (row.color as string) ?? '',
    condition: (row.condition as ConditionGrade) ?? 'used-good',
    batteryHealth: num(row.battery_health, 0),
    icloudStatus: (row.icloud_status as 'clean' | 'locked') ?? 'clean',
    costPrice: num(row.cost_price, 0),            // only present in v_phones_full (owner)
    targetSalePrice: num(row.target_sale_price, 0),
    status: (row.status as UnitStatus) ?? 'in-stock',
    dateAdded: (row.date_added as string) ?? '',
    source: (row.source as ItemSource) ?? undefined,
    exchangeId: (row.exchange_id as string) ?? undefined,
    localUpdatedAt: (row.local_updated_at as string) ?? undefined,
    syncedAt: (row.synced_at as string) ?? undefined,
    isDeleted: b2n(row.is_deleted),
  };
}

export function mapAccessory(row: Record<string, unknown>): Accessory {
  return {
    sku: row.sku as string,
    name: (row.name as string) ?? '',
    quantity: num(row.quantity, 0),
    costPrice: num(row.cost_price, 0),            // absent in v_accessories_public (staff)
    salePrice: num(row.sale_price, 0),
    minStockLevel: row.min_stock_level == null ? undefined : num(row.min_stock_level),
    category: (row.category as string) ?? undefined,
    brand: (row.brand as string) ?? undefined,
    variant: (row.variant as string) ?? undefined,
    localUpdatedAt: (row.local_updated_at as string) ?? undefined,
    syncedAt: (row.synced_at as string) ?? undefined,
    isDeleted: b2n(row.is_deleted),
  };
}

export function mapSale(row: Record<string, unknown>): SaleRecord {
  return {
    id: row.id as string,
    billId: (row.bill_id as string) ?? '',
    customerWhatsapp: (row.customer_whatsapp as string) ?? '',
    items: (row.items as SaleItem[]) ?? [],       // already camelCase JSON
    totalRevenue: num(row.total_revenue, 0),
    totalDiscount: num(row.total_discount, 0),
    date: (row.date as string) ?? '',
    time: (row.time as string) ?? '',
    returnStatus: (row.return_status as SaleRecord['returnStatus']) ?? 'none',
    totalRefunded: num(row.total_refunded, 0),
    exchangeId: (row.exchange_id as string) ?? undefined,
    tradeInValue: num(row.trade_in_value, 0),
    netPayable: row.net_payable == null ? undefined : num(row.net_payable),
    paymentMethod: (row.payment_method as string) ?? 'cash',
    customerId: (row.customer_id as string) ?? undefined,
    localUpdatedAt: (row.local_updated_at as string) ?? undefined,
    syncedAt: (row.synced_at as string) ?? undefined,
    isDeleted: b2n(row.is_deleted),
  };
}

export function mapReturn(row: Record<string, unknown>): ReturnRecord {
  return {
    id: row.id as string,
    returnId: (row.return_id as string) ?? '',
    originalSaleId: (row.original_sale_id as string) ?? '',
    originalBillId: (row.original_bill_id as string) ?? '',
    itemType: (row.item_type as 'phone' | 'accessory') ?? 'phone',
    imei: (row.imei as string) ?? undefined,
    sku: (row.sku as string) ?? undefined,
    quantity: num(row.quantity, 1),
    refundAmount: num(row.refund_amount, 0),
    reason: (row.reason as string) ?? '',
    reasonNotes: (row.reason_notes as string) ?? undefined,
    conditionOnReturn: (row.condition_on_return as string) ?? '',
    refundMethod: (row.refund_method as string) ?? '',
    customerWhatsapp: (row.customer_whatsapp as string) ?? undefined,
    processedBy: (row.processed_by as string) ?? undefined,
    returnDate: (row.return_date as string) ?? '',
    restocked: b2n(row.restocked),
    notes: (row.notes as string) ?? undefined,
    localUpdatedAt: (row.local_updated_at as string) ?? '',
    syncedAt: (row.synced_at as string) ?? undefined,
    isDeleted: b2n(row.is_deleted),
  };
}

export function mapExchange(row: Record<string, unknown>): ExchangeRecord {
  return {
    id: row.id as string,
    saleId: (row.sale_id as string) ?? '',
    tradeInImei: (row.trade_in_imei as string) ?? '',
    tradeInModel: (row.trade_in_model as string) ?? '',
    tradeInValuation: num(row.trade_in_valuation, 0),
    tradeInCondition: (row.trade_in_condition as string) ?? '',
    tradeInBatteryHealth: row.trade_in_battery_health == null ? undefined : num(row.trade_in_battery_health),
    tradeInNotes: (row.trade_in_notes as string) ?? undefined,
    customerName: (row.customer_name as string) ?? '',
    customerNic: (row.customer_nic as string) ?? '',
    customerWhatsapp: (row.customer_whatsapp as string) ?? undefined,
    ingestedPhoneId: (row.ingested_phone_id as string) ?? '',
    localUpdatedAt: (row.local_updated_at as string) ?? '',
    syncedAt: (row.synced_at as string) ?? undefined,
    isDeleted: b2n(row.is_deleted),
  };
}

/* --------------------------------------------------- writes (model -> row / RPC payload) */

// Owner add/edit of a phone. Cost is split out for the upsert_phone RPC (phones + phone_costs).
export function phoneToUpsertPayload(p: Partial<PhoneUnit> & { id: string }) {
  const imei = (p.imei ?? '').toString().trim();
  const serial = (p.serialNumber ?? '').toString().trim();
  return {
    id: p.id,
    // Empty identifiers MUST be null (not '') so the CHECK + partial unique indexes behave.
    imei: imei || null,
    serial_number: serial || null,
    device_type: p.deviceType ?? 'phone',
    model: p.model,
    storage: p.storage,
    color: p.color,
    condition: p.condition,
    battery_health: p.batteryHealth,
    icloud_status: p.icloudStatus,
    target_sale_price: p.targetSalePrice,
    status: p.status,
    date_added: p.dateAdded,
    source: p.source ?? 'purchased',
    cost_price: p.costPrice ?? 0,   // routed to phone_costs by the RPC
  };
}

export function accessoryToRow(a: Partial<Accessory> & { sku: string }): Record<string, unknown> {
  return {
    sku: a.sku,
    name: a.name,
    quantity: a.quantity,
    cost_price: a.costPrice,
    sale_price: a.salePrice,
    min_stock_level: a.minStockLevel ?? 5,
    category: a.category ?? null,
    brand: a.brand ?? null,
    variant: a.variant ?? null,
    local_updated_at: Date.now().toString(),
  };
}
