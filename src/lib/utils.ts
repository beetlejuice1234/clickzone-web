import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
 return twMerge(clsx(inputs))
}

export function formatLKR(amount: number): string {
 return `LKR ${amount.toLocaleString('en-US')}`;
}

/** Net revenue actually collected on a sale = gross goods revenue minus any trade-in credit.
 *  Plain sales: net == gross. Trade-in sales: the traded device's value is deducted here (it becomes
 *  resale stock, and shows up in profit — not in revenue). Use this for every REVENUE display.
 *  Profit stays on gross (total_revenue − COGS) so the traded-in asset isn't double-counted. */
export function saleNetRevenue(s: { netPayable?: number; totalRevenue: number; tradeInValue?: number }): number {
 return s.netPayable ?? (s.totalRevenue - (s.tradeInValue ?? 0));
}

/** Normalise any stored date value (plain 'YYYY-MM-DD', ISO timestamp, or 'YYYY-MM-DD HH:MM:SS')
 *  to a clean 'YYYY-MM-DD' for display. All those formats start with the date, so slice(0,10). */
export function shortDate(s?: string | null): string {
 return s ? String(s).slice(0, 10) : '—';
}

/* ---------------------------------------------------------------- Asia/Colombo dates
 * Date columns are text 'YYYY-MM-DD' (validated: 0 rows off-format), so lexicographic
 * gte/lte comparison is correct. These helpers pin "now" to Asia/Colombo to stay
 * consistent with the RPCs; the full app-wide timezone sweep is Phase 8h.
 * en-CA locale renders as YYYY-MM-DD. */
export function todayColombo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

// Current month as 'YYYY-MM' in Asia/Colombo.
export function monthColombo(): string {
  return todayColombo().slice(0, 7);
}

export function startOfMonthColombo(): string {
  return `${monthColombo()}-01`;
}

// Monday of the current week (Asia/Colombo), as 'YYYY-MM-DD'.
export function startOfWeekColombo(): string {
  const d = new Date(`${todayColombo()}T00:00:00Z`);
  const dow = d.getUTCDay();        // 0=Sun .. 6=Sat
  const offset = (dow + 6) % 7;     // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// Lexicographic bounds for a whole month given 'YYYY-MM'. `-31` is a safe upper bound:
// every real day in the month is <= 'YYYY-MM-31' and days in other months sort outside.
export function monthBounds(ym: string): { from: string; to: string } {
  return { from: `${ym}-01`, to: `${ym}-31` };
}

// The last `n` calendar days (Asia/Colombo), oldest→newest, as 'YYYY-MM-DD'. Anchored on the
// Colombo "today" so the weekly chart buckets match how sales.date is stored (Colombo).
export function lastNDaysColombo(n: number): string[] {
  const base = new Date(`${todayColombo()}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

// Short weekday label for a 'YYYY-MM-DD' calendar date, tz-stable (no off-by-one from the runtime tz).
export function weekdayShortColombo(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export const CONDITION_LABELS: Record<ConditionGrade, string> = {
  'sealed': 'Sealed',
  'a-plus': 'A+',
  'a': 'A',
  'b': 'B',
  'c': 'C',
  'open-box': 'Open Box',
  'used-excellent': 'Used — Excellent',
  'used-good': 'Used — Good',
  'used-fair': 'Used — Fair',
  'parts-only': 'Parts Only',
  'damaged': 'Damaged',
};

export const CONDITION_OPTIONS: ConditionGrade[] = [
  'sealed', 'a-plus', 'a', 'b', 'c',
  'open-box', 'used-excellent', 'used-good', 'used-fair', 'parts-only', 'damaged'
];

export const STORAGE_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'] as const;

export const MODEL_OPTIONS = [
 'iPhone 6',
 'iPhone 6 Plus',
 'iPhone 6s',
 'iPhone 6s Plus',
 'iPhone 7',
 'iPhone 7 Plus',
 'iPhone 8',
 'iPhone 8 Plus',
 'iPhone X',
 'iPhone XR',
 'iPhone XS',
 'iPhone XS Max',
 'iPhone 11',
 'iPhone 11 Pro',
 'iPhone 11 Pro Max',
 'iPhone 12 mini',
 'iPhone 12',
 'iPhone 12 Pro',
 'iPhone 12 Pro Max',
 'iPhone 13 mini',
 'iPhone 13',
 'iPhone 13 Pro',
 'iPhone 13 Pro Max',
 'iPhone 14',
 'iPhone 14 Plus',
 'iPhone 14 Pro',
 'iPhone 14 Pro Max',
 'iPhone 15',
 'iPhone 15 Plus',
 'iPhone 15 Pro',
 'iPhone 15 Pro Max',
 'iPhone 16',
 'iPhone 16 Plus',
 'iPhone 16 Pro',
 'iPhone 16 Pro Max',
 'iPhone 16e',
 'iPhone 17',
 'iPhone 17 Air',
 'iPhone 17 Pro',
 'iPhone 17 Pro Max',
 'iPhone SE (2nd Gen)',
 'iPhone SE (3rd Gen)',
] as const;

export const COLOR_OPTIONS = [
 // Neutrals / classics
 'Black',
 'White',
 'Silver',
 'Gold',
 'Space Gray',
 'Space Black',
 'Graphite',
 'Jet Black',
 'Rose Gold',
 'Midnight',
 'Starlight',
 // Titanium family (15/16 Pro)
 'Natural Titanium',
 'Blue Titanium',
 'White Titanium',
 'Black Titanium',
 'Desert Titanium',
 // Colours
 'Blue',
 'Pacific Blue',
 'Sierra Blue',
 'Green',
 'Alpine Green',
 'Midnight Green',
 'Pink',
 'Red',
 'Purple',
 'Deep Purple',
 'Yellow',
 'Coral',
 'Ultramarine',
 'Teal',
 // iPhone 17 (2025)
 'Cosmic Orange',
 'Deep Blue',
 'Sage',
 'Lavender',
 'Mist Blue',
] as const;

export function conditionBadgeClass(condition: ConditionGrade): string {
 switch (condition) {
 case 'sealed': return 'bg-[#B10F2E]/10 text-[#B10F2E] border-[#B10F2E]/20';
 case 'a-plus': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
 case 'a': return 'bg-green-50 text-green-700 border-green-200';
 case 'b': return 'bg-amber-50 text-amber-700 border-amber-200';
 case 'c': return 'bg-orange-50 text-orange-700 border-orange-200';
 default: return 'bg-slate-50 text-slate-700 border-slate-200';
 }
}

export function statusBadgeClass(status: UnitStatus): string {
 switch (status) {
 case 'in-stock': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
 case 'sold': return 'bg-rose-50 text-rose-700 border-rose-200';
 case 'reserved': return 'bg-sky-50 text-sky-700 border-sky-200';
 default: return 'bg-slate-50 text-slate-700 border-slate-200';
 }
}

export const STATUS_LABELS: Record<UnitStatus, string> = {
  'in-stock': 'In Stock',
  'sold': 'Sold',
  'reserved': 'Reserved',
  'damaged': 'Damaged',
  'pending-refurb': 'Pending Refurb',
};

export type ConditionGrade = import('@/types').ConditionGrade;
export type UnitStatus = import('@/types').UnitStatus;
