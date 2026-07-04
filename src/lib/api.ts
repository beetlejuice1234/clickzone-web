import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useStoreScope } from '@/lib/store';
import {
  mapPhone, mapAccessory, mapSale, mapReturn, mapExchange,
  phoneToUpsertPayload,
} from '@/lib/mappers';
import type { PhoneUnit, Accessory, Customer } from '@/types';

/**
 * Phase 6 data layer — TanStack Query over Supabase.
 *
 * GUARDS:
 *  - Fail closed: listings use the cost-free PUBLIC views unless role === 'owner'
 *    is confirmed (isAdmin). While the role is still loading, isAdmin is false, so no
 *    cost/profit is ever fetched → no flash-leak.
 *  - Views only: phones/accessories/sales listings read v_*_public (staff+owner) or the
 *    owner v_*_full / v_sales_profit — never base tables, so staff RLS is never hit.
 *  - Owner-only data (returns/exchanges/customers/stores) is query-DISABLED for staff,
 *    so staff never touch those base tables at all.
 */

const listOpts = { staleTime: 5000 } as const;

/* ------------------------------------------------------------------ reads */

// Owner store-switcher: when a specific store is active, scope the owner's listings to it.
// Staff never set this (no switcher) and are already isolated by the views.
export function usePhones() {
  const { isAdmin } = useAuth();
  const activeStore = useStoreScope((s) => s.activeStoreId);
  const scoped = isAdmin ? activeStore : null;
  const view = isAdmin ? 'v_phones_full' : 'v_phones_public';
  const { data, error, isLoading } = useQuery({
    queryKey: ['phones', isAdmin ? 'full' : 'public', scoped ?? 'all'],
    queryFn: async () => {
      let q = supabase.from(view).select('*');
      if (scoped) q = q.eq('store_id', scoped);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapPhone);
    },
    ...listOpts,
  });
  return { phones: data ?? [], isLoading, isError: error };
}

export function useAccessories() {
  const { isAdmin } = useAuth();
  const activeStore = useStoreScope((s) => s.activeStoreId);
  const scoped = isAdmin ? activeStore : null;
  const view = isAdmin ? 'v_accessories_full' : 'v_accessories_public';
  const { data, error, isLoading } = useQuery({
    queryKey: ['accessories', isAdmin ? 'full' : 'public', scoped ?? 'all'],
    queryFn: async () => {
      let q = supabase.from(view).select('*');
      if (scoped) q = q.eq('store_id', scoped);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapAccessory);
    },
    ...listOpts,
  });
  return { accessories: data ?? [], isLoading, isError: error };
}

// Optional date range (inclusive) pushes gte/lte on the text `date` column into the query,
// so a filtered Sales Log / monthly Dashboard pulls only the rows it needs. Dates are
// 'YYYY-MM-DD', so string comparison is correct. No args = all rows (unchanged behaviour).
// The range is part of the queryKey, so each range caches independently and refetches on change.
export function useSales(range?: { from?: string; to?: string }) {
  const { isAdmin } = useAuth();
  const activeStore = useStoreScope((s) => s.activeStoreId);
  const scoped = isAdmin ? activeStore : null;
  const view = isAdmin ? 'v_sales_profit' : 'v_sales_public';
  const from = range?.from || null;
  const to = range?.to || null;
  const { data, error, isLoading } = useQuery({
    queryKey: ['sales', isAdmin ? 'full' : 'public', scoped ?? 'all', from ?? 'any', to ?? 'any'],
    queryFn: async () => {
      let q = supabase.from(view).select('*');
      if (scoped) q = q.eq('store_id', scoped);
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapSale);
    },
    ...listOpts,
  });
  return { sales: data ?? [], isLoading, isError: error };
}

// Owner-only records — disabled for staff (never hits base-table RLS).
export function useReturns() {
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ['returns'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('returns').select('*').eq('is_deleted', false);
      if (error) throw error;
      return (data ?? []).map(mapReturn);
    },
    ...listOpts,
  });
  return { returns: data ?? [], isLoading, isError: error };
}

export function useExchanges() {
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ['exchanges'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('exchanges').select('*').eq('is_deleted', false);
      if (error) throw error;
      return (data ?? []).map(mapExchange);
    },
    ...listOpts,
  });
  return { exchanges: data ?? [], isLoading, isError: error };
}

// Owner-only: customers table is blocked from staff by RLS (customers_owner_all).
export function useCustomers() {
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ['customers'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('customers')
        .select('id, name, nic, whatsapp, notes, created_at').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r): Customer => ({
        id: r.id as string,
        name: (r.name as string) ?? undefined,
        nic: (r.nic as string) ?? undefined,
        whatsapp: (r.whatsapp as string) ?? undefined,
        notes: (r.notes as string) ?? undefined,
        createdAt: (r.created_at as string) ?? undefined,
      }));
    },
    ...listOpts,
  });
  return { customers: data ?? [], isLoading, isError: error };
}

export function useStores() {
  const { isAdmin } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ['stores'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('stores').select('id, name, address, phone');
      if (error) throw error;
      return data ?? [];
    },
    ...listOpts,
  });
  return { stores: data ?? [], isLoading, isError: error };
}

/* ------------------------------------------------------------------ mutations */

// Lookup an IMEI/serial across ALL rows (incl. sold/soft-deleted) to decide
// duplicate (active) vs revive (prior non-active) vs new. Owner-only RPC.
export async function findPhoneByIdentifier(identifier: string) {
  const { data, error } = await supabase.rpc('find_phone_by_identifier', { identifier });
  if (error) throw new Error(error.message);
  return data as {
    found: boolean; active?: boolean; id?: string; status?: string;
    is_deleted?: boolean; date_added?: string; model?: string;
  };
}

// Owner add/edit of a phone — writes phones + phone_costs atomically via RPC.
// New/edited stock lands in the owner's active store when one is selected.
// `revive` un-deletes an existing (sold/soft-deleted) row in place, keeping its id/history.
export async function upsertPhone(phone: Partial<PhoneUnit> & { id: string }, opts?: { revive?: boolean }) {
  const payload: Record<string, unknown> = phoneToUpsertPayload(phone);
  const active = useStoreScope.getState().activeStoreId;
  if (active) payload.store_id = active;
  if (opts?.revive) payload.is_deleted = false;
  const { data, error } = await supabase.rpc('upsert_phone', { payload });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

// Soft-delete a phone (owner, base table).
export async function deletePhone(id: string) {
  const { error } = await supabase.from('phones')
    .update({ is_deleted: true, local_updated_at: Date.now().toString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Add stock for an accessory — increments if the SKU already exists, else inserts (owner).
export async function addAccessory(a: { sku: string; name: string; quantity: number; costPrice: number; salePrice: number; serialNumber?: string }) {
  const sku = a.sku.trim().toUpperCase();
  const serial = a.serialNumber?.trim() || null;
  const { data: existing, error: readErr } = await supabase.from('accessories')
    .select('quantity').eq('sku', sku).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  const active = useStoreScope.getState().activeStoreId;
  if (existing) {
    const { error } = await supabase.from('accessories').update({
      name: a.name, quantity: (existing.quantity ?? 0) + a.quantity,
      cost_price: a.costPrice, sale_price: a.salePrice, is_deleted: false,
      ...(serial ? { serial_number: serial } : {}),   // only overwrite when a serial is given
      local_updated_at: Date.now().toString(),
    }).eq('sku', sku);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('accessories').insert({
      sku, name: a.name, quantity: a.quantity, cost_price: a.costPrice, sale_price: a.salePrice,
      serial_number: serial,
      is_deleted: false, min_stock_level: 5, local_updated_at: Date.now().toString(),
      ...(active ? { store_id: active } : {}),
    });
    if (error) throw new Error(error.message);
  }
}

export async function updateAccessory(sku: string, patch: { name: string; quantity: number; costPrice: number; salePrice: number; serialNumber?: string }) {
  const { error } = await supabase.from('accessories').update({
    name: patch.name, quantity: patch.quantity, cost_price: patch.costPrice, sale_price: patch.salePrice,
    serial_number: patch.serialNumber?.trim() || null,
    local_updated_at: Date.now().toString(),
  }).eq('sku', sku);
  if (error) throw new Error(error.message);
}

export async function deleteAccessory(sku: string) {
  const { error } = await supabase.from('accessories')
    .update({ is_deleted: true, local_updated_at: Date.now().toString() }).eq('sku', sku);
  if (error) throw new Error(error.message);
}

export async function deleteSale(id: string) {
  const { error } = await supabase.from('sales')
    .update({ is_deleted: true, local_updated_at: Date.now().toString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// Atomic checkout via RPC. `payload` is the snake_case checkout contract.
// Owner sales land in the active store; staff always use their profile store (RPC default).
export async function checkout(payload: Record<string, unknown>) {
  const active = useStoreScope.getState().activeStoreId;
  const body = active && payload.store_id == null ? { ...payload, store_id: active } : payload;
  const { data, error } = await supabase.rpc('checkout', { payload: body });
  if (error) throw new Error(error.message);
  return data as { sale_id: string; bill_id: string; ingested_phone_id?: string; exchange_id?: string };
}

export async function returnItem(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('return_item', { payload });
  if (error) throw new Error(error.message);
  return data as {
    return_id: string; exchange_id?: string | null; difference_direction?: string | null;
    delta?: number; replacement_phone_id?: string; restocked_imei?: string;
    new_total_revenue?: number; refund_amount?: number;
  };
}

export async function phoneSwap(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('phone_swap', { payload });
  if (error) throw new Error(error.message);
  return data as { exchange_id: string; outgoing_phone_id: string; ingested_phone_id: string };
}

/** Invalidate all list caches after a write. */
export const reloadData = () => {
  for (const k of ['phones', 'accessories', 'sales', 'returns', 'exchanges', 'customers', 'stores']) {
    queryClient.invalidateQueries({ queryKey: [k] });
  }
};

// Re-exported for type help at call sites.
export type { PhoneUnit, Accessory };
