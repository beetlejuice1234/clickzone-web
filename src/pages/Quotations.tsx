import { useMemo, useState, useCallback } from 'react';
import { FileText, Search, Printer, MessageCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useQuotations, updateQuotation, reloadData } from '@/lib/api';
import { formatLKR, cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { downloadBillPDF, shareBillPDF, type BillData } from '@/lib/pdfBill';
import { useMobile } from '@/hooks/useMobile';
import { toast } from 'sonner';
import type { Quotation } from '@/types';

function quoteToBill(q: Quotation): BillData {
  return {
    billId: q.quoteNo,
    date: (q.createdAt || '').slice(0, 10),
    time: '',
    customerWhatsapp: q.customerWhatsapp || '',
    saleItems: q.items,
    totals: { subtotal: q.totalRevenue + q.totalDiscount, discount: q.totalDiscount, tradeIn: 0, grandTotal: q.totalRevenue },
    specialNotes: q.notes,
    kind: 'quotation',
    validUntil: q.validUntil,
  };
}

const STATUS_STYLE: Record<Quotation['status'], string> = {
  open: 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30',
  converted: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30',
  expired: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30',
};

export default function Quotations() {
  const { quotations, isLoading } = useQuotations();
  const isMobile = useMobile();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return quotations;
    return quotations.filter(x =>
      x.quoteNo.toLowerCase().includes(q) ||
      (x.customerName || '').toLowerCase().includes(q) ||
      (x.customerWhatsapp || '').toLowerCase().includes(q) ||
      x.items.some(i => i.name.toLowerCase().includes(q))
    );
  }, [quotations, search]);

  const handlePdf = useCallback(async (q: Quotation) => {
    const data = quoteToBill(q);
    if (isMobile) { const shared = await shareBillPDF(data); if (!shared) await downloadBillPDF(data); }
    else await downloadBillPDF(data);
  }, [isMobile]);

  const handleWhatsapp = useCallback((q: Quotation) => {
    const digits = (q.customerWhatsapp || '').replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length < 9) { toast.error('No WhatsApp number on this quotation'); return; }
    const normalized = digits.startsWith('94') ? digits : `94${digits}`;
    const itemLines = q.items.map(i => ` • ${i.name}${i.quantity && i.quantity > 1 ? ` ×${i.quantity}` : ''} — ${formatLKR(i.finalPrice)}`).join('\n');
    const message =
`🔵 *ClickZone Mobile* — Quotation
━━━━━━━━━━━━━━━━━━━━

📄 *Quote:* \`${q.quoteNo}\`${q.validUntil ? `\n📅 *Valid until:* ${q.validUntil}` : ''}

━━━━━━━━━━━━━━━━━━━━
🛒 *Items:*
${itemLines}
━━━━━━━━━━━━━━━━━━━━
💰 *Total:* *${formatLKR(q.totalRevenue)}*

_This is a quotation, not a receipt._

🌐 www.clickzonemobiles.com · 📍 Kandy`;
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank');
  }, []);

  const setStatus = useCallback(async (q: Quotation, status: Quotation['status']) => {
    try { await updateQuotation({ id: q.id, status }); reloadData(); toast.success(`Quotation ${status}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  }, []);

  const remove = useCallback(async (q: Quotation) => {
    if (!confirm(`Delete quotation ${q.quoteNo}?`)) return;
    try { await updateQuotation({ id: q.id, is_deleted: true }); reloadData(); toast.success('Quotation deleted'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  }, []);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 min-h-screen bg-[var(--bg-app)]">
      <div className="flex items-end justify-between border-b border-[var(--line)] pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--ink)]">Quotations</h1>
          <p className="text-[var(--subtle)] text-[9px] mt-1.5">{quotations.length} saved · send via WhatsApp or PDF</p>
        </div>
        <FileText className="text-[var(--brand)]" size={22} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" size={14} />
        <Input
          placeholder="Search quote #, customer, or item..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-11 border-[var(--line)] bg-[var(--paper)] rounded-xl text-[10px] font-bold text-[var(--ink)]"
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          [1, 2, 3].map(i => <div key={i} className="h-20 bg-[var(--paper)] border border-[var(--line)] rounded-xl animate-pulse" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[var(--subtle)]">
            <FileText size={28} className="mx-auto mb-3 opacity-20" />
            <p className="text-[10px] font-medium">No quotations yet — create one from the POS.</p>
          </div>
        ) : filtered.map(q => (
          <div key={q.id} className="bg-[var(--paper)] border border-[var(--line)] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[var(--ink)]">{q.quoteNo}</span>
                <span className={cn('text-[8px] px-1.5 py-0.5 border font-medium rounded-xl uppercase', STATUS_STYLE[q.status])}>{q.status}</span>
                {q.validUntil && <span className="text-[8px] text-[var(--subtle)]">valid to {q.validUntil}</span>}
              </div>
              <p className="text-[9px] text-[var(--subtle)] mt-1 truncate">
                {(q.customerName || q.customerWhatsapp || 'Walk-in')} · {q.items.map(i => i.name).join(', ')}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-lg font-bold text-[var(--brand)]">{formatLKR(q.totalRevenue)}</span>
              <button onClick={() => handleWhatsapp(q)} title="Send via WhatsApp" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--line)] text-[var(--success)] hover:bg-[var(--bg-app)]"><MessageCircle size={15} /></button>
              <button onClick={() => handlePdf(q)} title="PDF" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--line)] text-[var(--brand)] hover:bg-[var(--bg-app)]"><Printer size={15} /></button>
              {q.status !== 'converted' && (
                <button onClick={() => setStatus(q, 'converted')} title="Mark converted" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--bg-app)]"><CheckCircle2 size={15} /></button>
              )}
              <button onClick={() => remove(q)} title="Delete" className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--line)] text-[var(--danger)] hover:bg-[var(--bg-app)]"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
