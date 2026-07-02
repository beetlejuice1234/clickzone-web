import { useMemo, useState } from 'react';
import { Users, Search, Phone, IdCard, Receipt, ShieldAlert } from 'lucide-react';
import { useCustomers, useSales } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { formatLKR, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { SaleRecord } from '@/types';

export default function Customers() {
  const { isAdmin } = useAuth();
  const { customers, isLoading } = useCustomers();
  const { sales } = useSales();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Purchases per customer (owner view of v_sales_profit carries customer_id).
  const salesByCustomer = useMemo(() => {
    const map = new Map<string, SaleRecord[]>();
    for (const s of sales) {
      if (!s.customerId) continue;
      const list = map.get(s.customerId) ?? [];
      list.push(s);
      map.set(s.customerId, list);
    }
    return map;
  }, [sales]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.nic || '').toLowerCase().includes(q) ||
      (c.whatsapp || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const selected = customers.find(c => c.id === selectedId) ?? null;
  const selectedSales = selected ? (salesByCustomer.get(selected.id) ?? []) : [];
  const selectedTotal = selectedSales.reduce((sum, s) => sum + s.totalRevenue, 0);

  // Owner-only page. Staff should never reach it (nav hidden + RLS blocks the table anyway).
  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-[var(--paper)] border border-[var(--line)] p-8 flex items-center gap-4">
          <ShieldAlert className="text-[var(--danger)]" size={24} />
          <div>
            <h2 className="text-lg font-bold text-[var(--ink)]">Owner only</h2>
            <p className="text-[10px] text-[var(--subtle)] mt-1">Customer records are restricted to the owner.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 min-h-screen bg-[var(--bg-app)]">
      <div className="flex items-end justify-between border-b border-[var(--line)] pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--ink)]">Customers</h1>
          <p className="text-[var(--subtle)] text-[9px] mt-1.5">Owner-only records · {customers.length} total</p>
        </div>
        <Users className="text-[var(--accent)]" size={22} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* List */}
        <div className="bg-[var(--paper)] border border-[var(--line)]">
          <div className="p-4 border-b border-[var(--line)] relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[var(--accent)]" size={14} />
            <Input
              placeholder="Search name, NIC, or WhatsApp..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-10 border-[var(--line)] bg-[var(--bg-app)] rounded-none text-[10px] font-bold text-[var(--ink)]"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-[var(--bg-app)] border border-[var(--line)] animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-[var(--subtle)]">
                <Users size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-[10px] font-medium">No customers found</p>
              </div>
            ) : filtered.map(c => {
              const count = (salesByCustomer.get(c.id) ?? []).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "w-full text-left px-5 py-3 border-b border-[var(--line)]/50 flex items-center justify-between transition-colors",
                    selectedId === c.id ? "bg-[var(--bg-app)]" : "hover:bg-[var(--bg-app)]"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[var(--ink)] truncate">{c.name || 'Unnamed'}</p>
                    <p className="text-[9px] text-[var(--subtle)] truncate">
                      {c.nic ? `NIC ${c.nic}` : ''}{c.nic && c.whatsapp ? ' · ' : ''}{c.whatsapp || ''}
                    </p>
                  </div>
                  <span className="text-[8px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-1.5 py-0.5 rounded-none shrink-0">
                    {count} {count === 1 ? 'sale' : 'sales'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail + history */}
        <div className="bg-[var(--paper)] border border-[var(--line)] p-6">
          {!selected ? (
            <div className="text-center py-20 text-[var(--subtle)]">
              <Receipt size={28} className="mx-auto mb-3 opacity-20" />
              <p className="text-[10px] font-medium">Select a customer to see purchase history</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-[var(--ink)]">{selected.name || 'Unnamed'}</h2>
                <div className="flex flex-wrap gap-4 mt-3">
                  {selected.nic && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--subtle)]"><IdCard size={12} className="text-[var(--accent)]" /> {selected.nic}</span>
                  )}
                  {selected.whatsapp && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--subtle)]"><Phone size={12} className="text-[var(--accent)]" /> {selected.whatsapp}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[var(--bg-app)] border border-[var(--line)] p-4">
                  <p className="text-[9px] font-bold text-[var(--subtle)] mb-1">Purchases</p>
                  <p className="text-2xl font-bold text-[var(--ink)]">{selectedSales.length}</p>
                </div>
                <div className="bg-[var(--bg-app)] border border-[var(--line)] p-4">
                  <p className="text-[9px] font-bold text-[var(--subtle)] mb-1">Total Spent</p>
                  <p className="text-2xl font-bold text-[var(--accent)]">{formatLKR(selectedTotal)}</p>
                </div>
              </div>

              <div>
                <p className="text-[9px] font-bold text-[var(--subtle)] mb-3 uppercase">Purchase History</p>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {selectedSales.length === 0 ? (
                    <p className="text-[10px] text-[var(--subtle)] py-4">No linked purchases yet.</p>
                  ) : [...selectedSales].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(s => (
                    <div key={s.id} className="border border-[var(--line)]/50 p-3 flex items-center justify-between hover:bg-[var(--bg-app)]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[var(--ink)]">{s.billId}</span>
                          <span className="text-[8px] px-1 py-0.5 border border-[var(--line)] text-[var(--subtle)] rounded-none uppercase">{s.paymentMethod || 'cash'}</span>
                        </div>
                        <p className="text-[9px] text-[var(--subtle)] mt-0.5 truncate">{s.date} · {s.items.map(i => i.name).join(', ')}</p>
                      </div>
                      <span className="text-[11px] font-bold text-[var(--accent)] shrink-0">{formatLKR(s.totalRevenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
