import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
 return twMerge(clsx(inputs))
}

export function formatLKR(amount: number): string {
 return `LKR ${amount.toLocaleString('en-US')}`;
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
 'iPhone 12',
 'iPhone 12 Pro',
 'iPhone 12 Pro Max',
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
 'iPhone SE (3rd Gen)',
] as const;

export const COLOR_OPTIONS = [
 'Midnight',
 'Starlight',
 'Blue',
 'Pink',
 'Green',
 'Red',
 'Purple',
 'Natural Titanium',
 'Sierra Blue',
 'Space Black',
 'White',
 'Black',
 'Gold',
 'Silver',
 'Deep Purple',
 'Midnight Green',
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
