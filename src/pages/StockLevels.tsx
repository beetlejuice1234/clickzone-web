import { useMemo, useState } from 'react';
import { Boxes, Search, Smartphone } from 'lucide-react';
import { usePhones } from '@/lib/api';
import { cn, formatLKR } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

// Stock-by-model overview: how many units are in stock for each phone model (owner + staff; counts).
// Reads the same store-scoped phones the rest of the app uses (v_phones_public for staff, v_phones_full
// for owner), so staff see only their store's counts. The total COST figure is owner-only (staff read
// cost-free views → costPrice is 0 for them; the card is also gated on isAdmin, fail-closed).
export default function StockLevels() {
  const { phones, isLoading } = usePhones();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [showSoldOut, setShowSoldOut] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, { model: string; inStock: number; sold: number; total: number }>();
    for (const p of phones) {
      const key = (p.model || 'Unknown').trim();
      const r = map.get(key) ?? { model: key, inStock: 0, sold: 0, total: 0 };
      r.total++;
      if (p.status === 'in-stock') r.inStock++;
      else if (p.status === 'sold') r.sold++;
      map.set(key, r);
    }
    let list = [...map.values()];
    if (!showSoldOut) list = list.filter(r => r.inStock > 0);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(r => r.model.toLowerCase().includes(q));
    list.sort((a, b) => (b.inStock - a.inStock) || a.model.localeCompare(b.model));
    return list;
  }, [phones, search, showSoldOut]);

  const totalInStock = useMemo(() => phones.filter(p => p.status === 'in-stock').length, [phones]);
  // Owner-only: total COST price of every in-stock phone.
  const totalCost = useMemo(() => phones.filter(p => p.status === 'in-stock').reduce((s, p) => s + (p.costPrice || 0), 0), [phones]);

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6 min-h-screen bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[var(--teal)]">Stock Levels</h1>
          <p className="text-[var(--subtle)] text-sm mt-1">Units in stock per model · {rows.length} models · {totalInStock} phones in stock</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" size={14} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search model…"
              className="pl-9 h-10 w-52 bg-[var(--paper)] border-[var(--line)] rounded-xl text-[11px] font-bold text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0"
            />
          </div>
          <button
            onClick={() => setShowSoldOut(v => !v)}
            className={cn(
              'h-10 px-4 text-[10px] font-bold uppercase rounded-xl border transition-all whitespace-nowrap',
              showSoldOut
                ? 'bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]'
                : 'bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]'
            )}
          >
            {showSoldOut ? 'All models' : 'In stock only'}
          </button>
        </div>
      </div>

      {/* Owner-only: total cost of everything in stock (staff never receive cost via the DB views). */}
      {isAdmin && (
        <div className="bg-[var(--cream)] rounded-2xl shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[var(--teal)]/70 uppercase tracking-wide mb-1">Total In-Stock Cost</p>
            <p className="text-[10px] text-[var(--teal)]/60">Cost price of all {totalInStock} phones currently in stock</p>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-sm font-medium text-[var(--teal)]/60">{formatLKR(totalCost).split(' ')[0]}</span>
            <span className="font-display text-4xl font-semibold text-[var(--teal)]">{formatLKR(totalCost).split(' ')[1]}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-[var(--paper)] border border-[var(--line)] rounded-xl animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-24 text-[var(--subtle)]">
          <Boxes size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-[11px] font-medium">No models to show</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.model} className="bg-[var(--paper)] border border-[var(--line)] rounded-xl p-4 flex items-center justify-between gap-3 hover:border-[var(--brand)] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-[var(--bg-app)] border border-[var(--line)] flex items-center justify-center text-[var(--brand)]">
                  <Smartphone size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-[var(--ink)] truncate">{r.model}</p>
                  <p className="text-[9px] text-[var(--subtle)]">{r.sold} sold · {r.total} total</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={cn('font-display text-2xl font-semibold', r.inStock > 0 ? 'text-[var(--teal)]' : 'text-[var(--subtle)]')}>{r.inStock}</p>
                <p className="text-[8px] font-bold uppercase tracking-wide text-[var(--subtle)]">in stock</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
