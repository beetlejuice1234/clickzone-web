import { useMemo, useState, useCallback } from 'react';
import { 
 FileSearch, 
 Download, 
 Trash2, 
 User, 
 Calendar,
 Search,
 MoreVertical,
 Clock,
 Printer,
 RotateCcw
, ArrowUpDown, ArrowUp, ArrowDown} from 'lucide-react';
import { useSales, reloadData, deleteSale } from '@/lib/api';
import type { SaleRecord } from '@/types';
import { formatLKR, cn, todayColombo, startOfWeekColombo, monthBounds, monthColombo } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
 DropdownMenu, 
 DropdownMenuContent, 
 DropdownMenuItem, 
 DropdownMenuTrigger,
 DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useMobile } from '@/hooks/useMobile';
import { downloadBillPDF, shareBillPDF, openBillPDF, type BillData } from '@/lib/pdfBill';
import { ReturnModal } from '@/components/ReturnModal';

type DatePreset = 'today' | 'week' | 'month' | 'all' | 'custom';
const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', all: 'All', custom: 'Custom',
};

export default function SalesLog() {
 const { isAdmin } = useAuth();
 const isMobile = useMobile();
 const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'returned' | 'trade-in'>('all');

  // Date-range filter: presets drive the Supabase query (gte/lte on `date`, Asia/Colombo),
  // so we only pull rows in range. Defaults to This Month.
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo((): { from?: string; to?: string } => {
    const today = todayColombo();
    switch (preset) {
      case 'today': return { from: today, to: today };
      case 'week': return { from: startOfWeekColombo(), to: today };
      case 'month': return monthBounds(monthColombo());
      case 'custom': return { from: customFrom || undefined, to: customTo || undefined };
      case 'all':
      default: return {};
    }
  }, [preset, customFrom, customTo]);

  const { sales, isLoading } = useSales(range);
  
  type SortKey = 'billId' | 'date' | 'totalRevenue' | 'customerWhatsapp';
  type SortDir = 'asc' | 'desc';
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const renderSortIcon = useCallback((column: SortKey) => {
    if (sort?.key !== column) return <ArrowUpDown size={12} className="text-[var(--subtle)] inline-block ml-1" />;
    return sort.dir === 'asc' ? <ArrowUp size={12} className="text-[var(--brand)] inline-block ml-1" /> : <ArrowDown size={12} className="text-[var(--brand)] inline-block ml-1" />;
  }, [sort]);

 const [returnModalOpen, setReturnModalOpen] = useState(false);
 const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);

 const openReturnModal = (sale: SaleRecord) => {
   setSelectedSale(sale);
   setReturnModalOpen(true);
 };

 const filteredSales = useMemo(() => {
 let list = [...sales];
 
 if (statusFilter !== 'all') {
   if (statusFilter === 'returned') list = list.filter(s => s.returnStatus && s.returnStatus !== 'none');
   else if (statusFilter === 'trade-in') list = list.filter(s => !!s.exchangeId);
   else if (statusFilter === 'completed') list = list.filter(s => !s.returnStatus || s.returnStatus === 'none');
 }

 if (search.trim()) {
   const s = search.toLowerCase();
   list = list.filter(sale => 
     sale.billId.toLowerCase().includes(s) ||
     (sale.customerWhatsapp || '').toLowerCase().includes(s) ||
     sale.items.some(item => item.name.toLowerCase().includes(s) || item.identifier.toLowerCase().includes(s))
   );
 }

 if (sort) {
   list.sort((a, b) => {
     const dir = sort.dir === 'asc' ? 1 : -1;
     let valA = a[sort.key];
     let valB = b[sort.key];
     if (sort.key === 'date') {
       valA = a.date + ' ' + a.time;
       valB = b.date + ' ' + b.time;
     }
     if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
     if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
     return 0;
   });
 } else {
   list.sort((a, b) => {
     if (b.date !== a.date) return b.date.localeCompare(a.date);
     return b.id.localeCompare(a.id);
   });
 }

 return list;
 }, [sales, search, statusFilter, sort]);

 const resetFilters = useCallback(() => {
   setSearch('');
   setStatusFilter('all');
   setPreset('month');
   setCustomFrom('');
   setCustomTo('');
 }, []);

  const handleExport = useCallback(() => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Bill ID,Date,Time,Customer,Total Revenue,Items,Status\n"
      + filteredSales.map(e => `${e.billId},${e.date},${e.time},${e.customerWhatsapp || 'Walk-in'},${e.totalRevenue},"${e.items.map(i => i.name).join('; ')}",${e.returnStatus || 'none'}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_export_${todayColombo()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Sales exported successfully!");
  }, [filteredSales]);

 const handleDelete = useCallback(async (id: string) => {
 if (!isAdmin) return;
 if (confirm('Are you sure you want to delete this sale record? This will NOT restore inventory stock.')) {
 try {
 await deleteSale(id);
 reloadData();
 toast.success('Sale record deleted');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to delete sale');
 }
 }
 }, [isAdmin]);

  const handlePrint = useCallback(async (sale: SaleRecord) => {
  // Build the bill from the PERSISTED sale values so the reprint == what's in Sales Log.
  // total_revenue = gross goods; net_payable = total_revenue - trade_in_value (fallback for legacy rows).
  const tradeIn = sale.tradeInValue ?? 0;
  const grandTotal = sale.netPayable ?? (sale.totalRevenue - tradeIn);
  const billData: BillData = {
  billId: sale.billId,
  date: sale.date,
  time: sale.time,
  customerWhatsapp: sale.customerWhatsapp || '',
  saleItems: sale.items,
  totals: {
  subtotal: sale.totalRevenue + (sale.totalDiscount ?? 0),
  discount: sale.totalDiscount ?? 0,
  tradeIn,
  grandTotal,
  },
  paymentMethod: sale.paymentMethod,
  specialNotes: sale.specialNotes,
  };
  // Mobile shares; desktop opens the bill in a pre-opened tab (view + Ctrl+P). Both fall back to download.
  const win = isMobile ? null : window.open('', '_blank');
  if (isMobile) {
  const shared = await shareBillPDF(billData);
  if (!shared) await downloadBillPDF(billData);
  } else {
  const opened = await openBillPDF(billData, win);
  if (!opened) await downloadBillPDF(billData);
  }
  }, [isMobile]);

 const totalRevenue = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalRevenue, 0), [filteredSales]);
 const totalProfit = useMemo(() => filteredSales.reduce((sum, s) => {
   const cost = s.items.reduce((acc, i) => acc + i.costPrice, 0);
   return sum + (s.totalRevenue - cost);
 }, 0), [filteredSales]);

 if (isMobile) {
 return (
 <div className="p-4 space-y-4 bg-[var(--bg-app)] min-h-screen">
 <div className="space-y-2">
 <Input
 placeholder="Asset, ID or Whatsapp Ref..."
 value={search} onChange={e => setSearch(e.target.value)}
 className="h-10 bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[10px] font-medium text-[var(--ink)] placeholder:text-[var(--subtle)]/50 focus-visible:border-[var(--brand)] focus-visible:ring-0"
 />
 <div className="flex gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
   {(['today', 'week', 'month', 'all', 'custom'] as const).map(p => (
     <button
       key={p}
       onClick={() => setPreset(p)}
       className={cn(
         "px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl border transition-all whitespace-nowrap",
         preset === p
           ? "bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]"
           : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
       )}
     >
       {PRESET_LABELS[p]}
     </button>
   ))}
   <Button variant="ghost" className="h-8 px-3 rounded-xl border border-[var(--line)] text-[10px] font-bold text-[var(--brand)] whitespace-nowrap" onClick={resetFilters}>
     Clear
   </Button>
 </div>
 {preset === 'custom' && (
   <div className="flex gap-2">
     <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
       className="h-10 bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] flex-1" aria-label="From date" />
     <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
       className="h-10 bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[10px] font-bold text-[var(--ink)] flex-1" aria-label="To date" />
   </div>
 )}
 </div>
 
 <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
   {(['all', 'completed', 'returned', 'trade-in'] as const).map(filter => (
     <button
       key={filter}
       onClick={() => setStatusFilter(filter)}
       className={cn(
         "px-3 py-1 text-[10px] font-bold uppercase rounded-xl border transition-all whitespace-nowrap",
         statusFilter === filter 
           ? "bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]" 
           : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
       )}
     >
       {filter.replace('-', ' ')}
     </button>
   ))}
 </div>

 <div className="bg-[var(--paper)] border border-[var(--line)] rounded-xl p-5 text-white shadow-none relative overflow-hidden">
 <div className="absolute top-0 left-0 w-[2px] h-full bg-[var(--brand)]" />
 <p className="text-[9px] font-bold text-[var(--subtle)] mb-1 ">Total Revenue</p>
 <p className="text-3xl font-bold text-[var(--brand)]">{formatLKR(totalRevenue)}</p>
 {isAdmin && <p className="text-[10px] font-medium text-[var(--success)] mt-1">Profit: {formatLKR(totalProfit)}</p>}
 <div className="flex items-center gap-2 mt-3 text-[var(--success)] text-[9px] font-medium ">
 <div className="w-1.5 h-1.5 rounded-xl bg-[var(--success)] animate-pulse" />
 {filteredSales.length} Transactions Exported
 </div>
 </div>

 <div className="space-y-2.5">
 {isLoading ? (
 <div className="space-y-2">
 {[1, 2, 3].map(i => <div key={i} className="h-24 bg-[var(--paper)] border border-[var(--line)] rounded-xl animate-pulse" />)}
 </div>
 ) : filteredSales.length === 0 ? (
 <div className="text-center py-20 text-[var(--subtle)]">
 <FileSearch size={32} className="mx-auto mb-3 opacity-20" />
 <p className="text-[10px] font-medium ">No matching logs found</p>
 </div>
 ) : (
 filteredSales.map(sale => (
 <motion.div key={sale.id} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
 className="bg-[var(--paper)] rounded-xl p-5 border border-[var(--line)] space-y-4">
 <div className="flex items-start justify-between">
 <div>
 <div className="flex items-center gap-2 mb-1.5 flex-wrap">
 <span className="text-[10px] font-bold text-[var(--ink)] ">{sale.billId}</span>
 <span className={cn("text-[8px] px-1.5 py-0.5 border font-medium rounded-xl uppercase",
   sale.paymentMethod === 'card' ? "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30" : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)]")}>
   {sale.paymentMethod || 'cash'}
 </span>
 {sale.returnStatus && sale.returnStatus !== 'none' && (
   <span className="text-[8px] px-1.5 py-0.5 bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 font-medium rounded-xl uppercase">{sale.returnStatus} RETURN</span>
 )}
 {sale.exchangeId && (
   <span className="text-[8px] px-1.5 py-0.5 bg-[var(--terracotta)]/10 text-[var(--terracotta)] border border-[var(--terracotta)]/30 font-medium rounded-xl uppercase">TRADE-IN</span>
 )}
 <span className="text-[8px] px-1.5 py-0.5 bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30 font-medium rounded-xl">COMPLETED</span>
 </div>
 <div className="flex items-center gap-1.5">
 <Clock size={10} className="text-[var(--subtle)]" />
 <span className="text-[9px] text-[var(--subtle)] ">{sale.date} · {sale.time}</span>
 </div>
 </div>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button className="h-8 w-8 flex items-center justify-center rounded-xl bg-[var(--bg-app)] border border-[var(--line)] text-[var(--subtle)]">
 <MoreVertical size={14} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 <DropdownMenuItem onClick={() => handlePrint(sale)} className="text-[10px] font-medium hover:bg-[var(--bg-app)] py-2"><Printer className="mr-2 h-3.5 w-3.5 text-[var(--brand)]" /> Archive Reprint</DropdownMenuItem>
 <DropdownMenuItem onClick={() => openReturnModal(sale)} className="text-[10px] font-medium hover:bg-[var(--bg-app)] py-2"><RotateCcw className="mr-2 h-3.5 w-3.5 text-[var(--brand)]" /> Process Return</DropdownMenuItem>
 {isAdmin && (
 <>
 <DropdownMenuSeparator className="bg-[var(--line)]" />
 <DropdownMenuItem onClick={() => handleDelete(sale.id)} className="text-[10px] font-medium text-[var(--danger)] hover:bg-[var(--bg-app)] py-2"><Trash2 className="mr-2 h-3.5 w-3.5" /> Purge Entry</DropdownMenuItem>
 </>
 )}
 </DropdownMenuContent>
 </DropdownMenu>
 </div>
 
 <div className="py-3 border-y border-[var(--line)] space-y-2.5">
 {sale.items.map((item, idx) => (
 <div key={idx} className="flex items-center justify-between gap-3 ">
 <div className="min-w-0">
 <p className="text-[10px] font-bold text-[var(--ink)] truncate ">{item.name}</p>
 <p className="text-[8px] text-[var(--subtle)] truncate mt-0.5">REF: {item.identifier}</p>
 </div>
 <span className="text-[10px] font-bold text-[var(--ink)] shrink-0">{formatLKR(item.finalPrice)}</span>
 </div>
 ))}
 </div>

 <div className="flex items-center justify-between pt-1">
 <div className="flex items-center gap-2">
 <div className="w-6 h-6 rounded-xl bg-[var(--bg-app)] border border-[var(--line)] flex items-center justify-center">
 <User size={12} className="text-[var(--brand)]" />
 </div>
 <span className="text-[11px] font-medium text-[var(--ink)]">{sale.customerWhatsapp || 'Walk-in Registry'}</span>
 </div>
 <p className="text-sm font-bold text-[var(--brand)]">{formatLKR(sale.netPayable ?? (sale.totalRevenue - (sale.tradeInValue ?? 0)))}</p>
 </div>
 </motion.div>
 ))
 )}
 </div>
 </div>
 );
 }

 return (
 <div className="p-8 max-w-7xl mx-auto space-y-10 bg-[var(--bg-app)] min-h-screen">
 <div className="flex items-center justify-between pb-8 border-b border-[var(--line)]">
 <div>
 <h1 className="text-4xl font-bold text-[var(--ink)]">Sales Log</h1>
 <p className="text-[var(--subtle)] text-[9px] mt-1.5">View all previous sales and reprints</p>
 </div>
 <div className="flex items-center gap-8">
 <div className="text-right">
 <p className="text-[9px] font-bold text-[var(--subtle)] mb-1">Total Revenue</p>
 <p className="text-3xl font-bold text-[var(--brand)]">{formatLKR(totalRevenue)}</p>
 {isAdmin && <p className="text-[10px] font-medium text-[var(--success)] mt-1">Profit: {formatLKR(totalProfit)}</p>}
 </div>
 <Button variant="outline" onClick={handleExport} className="rounded-xl border-[var(--brand)] border-2 h-11 px-8 font-bold text-[10px] bg-transparent text-[var(--brand)] hover:bg-[var(--brand)] hover:text-[var(--bg-app)] transition-all shadow-none">
 <Download size={14} className="mr-2" /> Data Export
 </Button>
 </div>
 </div>

 <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
  {(['all', 'completed', 'returned', 'trade-in'] as const).map(filter => (
    <button
      key={filter}
      onClick={() => setStatusFilter(filter)}
      className={cn(
        "px-3 py-1 text-[10px] font-bold uppercase rounded-xl border transition-all whitespace-nowrap",
        statusFilter === filter 
          ? "bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]" 
          : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
      )}
    >
      {filter.replace('-', ' ')}
    </button>
  ))}
</div>
<div className="bg-[var(--paper)] border border-[var(--line)] rounded-xl shadow-none overflow-hidden relative">
 <div className="p-6 bg-[var(--bg-app)]/50 border-b border-[var(--line)] flex flex-col gap-4">
 <div className="flex flex-col md:flex-row gap-6 items-center">
 <div className="relative flex-1 group w-full">
 <div className="absolute -top-2.5 left-4 bg-[var(--bg-app)] px-2 z-10 border-x border-[var(--line)]">
 <span className="text-[8px] font-bold text-[var(--brand)]">Filter Parameters</span>
 </div>
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--brand)]" size={14} />
 <Input
 placeholder="Query by ID, Identifier, or WhatsApp reference..."
 value={search} onChange={e => setSearch(e.target.value)}
 className="pl-10 h-11 border-[var(--line)] bg-[var(--bg-app)] rounded-xl focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[10px] font-bold text-[var(--ink)] placeholder:text-[var(--subtle)]/30"
 />
 </div>
 <Button variant="ghost" className="h-11 text-[9px] font-medium rounded-xl border border-[var(--line)] text-[var(--subtle)] hover:text-[var(--brand)] hover:bg-[var(--bg-app)] w-full md:w-auto" onClick={resetFilters}>
 Clear Filters
 </Button>
 </div>
 <div className="flex flex-wrap items-center gap-3">
 <Calendar className="text-[var(--brand)]" size={14} />
 <div className="flex gap-2 flex-wrap">
   {(['today', 'week', 'month', 'all', 'custom'] as const).map(p => (
     <button
       key={p}
       onClick={() => setPreset(p)}
       className={cn(
         "px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl border transition-all whitespace-nowrap",
         preset === p
           ? "bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]"
           : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
       )}
     >
       {PRESET_LABELS[p]}
     </button>
   ))}
 </div>
 {preset === 'custom' && (
   <div className="flex items-center gap-2">
     <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
       className="h-9 w-40 border-[var(--line)] bg-[var(--bg-app)] rounded-xl text-[10px] font-bold text-[var(--ink)]" aria-label="From date" />
     <span className="text-[9px] font-bold text-[var(--subtle)]">→</span>
     <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
       className="h-9 w-40 border-[var(--line)] bg-[var(--bg-app)] rounded-xl text-[10px] font-bold text-[var(--ink)]" aria-label="To date" />
   </div>
 )}
 </div>
 </div>

 <Table>
 <TableHeader>
 <TableRow className="bg-[var(--bg-app)]/80 hover:bg-[var(--bg-app)] border-b border-[var(--line)]">
 <TableHead className="py-5 px-6 text-[9px] font-bold text-[var(--subtle)] cursor-pointer group hover:text-[var(--brand)]" onClick={() => handleSort('date')}>Record {renderSortIcon('date')}</TableHead>
 <TableHead className="py-5 px-6 text-[9px] font-bold text-[var(--subtle)] cursor-pointer group hover:text-[var(--brand)]" onClick={() => handleSort('customerWhatsapp')}>Customer {renderSortIcon('customerWhatsapp')}</TableHead>
 <TableHead className="py-5 px-6 text-[9px] font-bold text-[var(--subtle)]">Items</TableHead>
 <TableHead className="py-5 px-6 text-[9px] font-bold text-[var(--subtle)] text-right cursor-pointer group hover:text-[var(--brand)]" onClick={() => handleSort('totalRevenue')}>Price {renderSortIcon('totalRevenue')}</TableHead>
 <TableHead className="py-5 px-6 text-[9px] font-bold text-[var(--subtle)] text-right">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody>
 {isLoading ? (
 [1, 2, 3].map(i => (
 <TableRow key={i}>
 <TableCell colSpan={5} className="py-8 px-6"><div className="h-10 bg-[var(--bg-app)] border border-[var(--line)] animate-pulse rounded-xl w-full" /></TableCell>
 </TableRow>
 ))
 ) : filteredSales.length === 0 ? (
 <TableRow>
 <TableCell colSpan={5} className="h-48 text-center text-[var(--subtle)]">
 <FileSearch size={28} className="mx-auto mb-4 opacity-20" />
 <p className="text-[10px] font-medium ">No Logs Found</p>
 </TableCell>
 </TableRow>
 ) : filteredSales.map(sale => (
 <TableRow key={sale.id} className="group hover:bg-[var(--bg-app)] transition-colors border-b border-[var(--line)]/50 last:border-0 relative">
 <TableCell className="py-6 px-6">
 <div className="flex flex-col">
 <div className="flex items-center gap-2 mb-1.5 flex-wrap">
   <span className="text-sm font-bold text-[var(--ink)]">{sale.billId}</span>
   <span className={cn("text-[8px] px-1.5 py-0.5 border font-medium rounded-xl uppercase",
     sale.paymentMethod === 'card' ? "bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30" : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)]")}>
     {sale.paymentMethod || 'cash'}
   </span>
   {sale.returnStatus && sale.returnStatus !== 'none' && (
     <span className="text-[8px] px-1.5 py-0.5 bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 font-medium rounded-xl uppercase">{sale.returnStatus} RETURN</span>
   )}
   {sale.exchangeId && (
     <span className="text-[8px] px-1.5 py-0.5 bg-[var(--terracotta)]/10 text-[var(--terracotta)] border border-[var(--terracotta)]/30 font-medium rounded-xl uppercase">TRADE-IN</span>
   )}
 </div>
 <div className="flex items-center gap-2 text-[9px] text-[var(--subtle)]">
 <Clock size={10} className="text-[var(--brand)]" /> {sale.date} <span className="opacity-30 self-center">|</span> {sale.time}
 </div>
 </div>
 </TableCell>
 <TableCell className="py-6 px-6">
 <div className="flex items-center gap-4">
 <div className="w-9 h-9 bg-[var(--bg-app)] border border-[var(--line)] flex items-center justify-center rounded-xl">
 <User size={16} className="text-[var(--brand)]" />
 </div>
 <div>
 <p className="text-[10px] font-bold text-[var(--ink)]">{sale.customerWhatsapp || 'Walk-in Registry'}</p>
 {sale.customerWhatsapp && <span className="text-[8px] font-bold bg-[var(--success)]/20 text-[var(--success)] px-1.5 py-0.5 rounded-xl mt-1 inline-block">SECURED</span>}
 </div>
 </div>
 </TableCell>
 <TableCell className="py-6 px-6 min-w-[320px]">
 <div className="space-y-2">
 {sale.items.map((item, idx) => (
 <div key={idx} className="flex items-center justify-between py-2 border-b border-[var(--line)]/30 last:border-0 hover:bg-[var(--bg-app)] transition-colors px-1 rounded-xl">
 <div className="flex items-center gap-3">
 <span className="text-[10px] font-bold text-[var(--ink)]">{item.name}</span>
 <span className="text-[9px] text-[var(--subtle)] opacity-60">ID: {item.identifier}</span>
 </div>
 <span className="text-[10px] font-bold text-[var(--brand)] opacity-80">{formatLKR(item.finalPrice).split(' ')[1]}</span>
 </div>
 ))}
 </div>
 </TableCell>
 <TableCell className="py-6 px-6 text-right">
 <div className="flex flex-col items-end">
 <span className="text-lg font-bold text-[var(--brand)]">{formatLKR(sale.netPayable ?? (sale.totalRevenue - (sale.tradeInValue ?? 0)))}</span>
 {sale.totalDiscount > 0 && <span className="text-[8px] font-bold bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 px-1.5 py-0.5 mt-1 cursor-help" title="Adjustment Applied">-[{formatLKR(sale.totalDiscount).split(' ')[1]}]</span>}
 {sale.tradeInValue && sale.tradeInValue > 0 ? <span className="text-[8px] font-bold bg-[var(--terracotta)]/10 text-[var(--terracotta)] border border-[var(--terracotta)]/30 px-1.5 py-0.5 mt-1" title="Trade-in Applied">Trade-in -{formatLKR(sale.tradeInValue).split(' ')[1]}</span> : null}
 </div>
 </TableCell>
 <TableCell className="py-6 px-6 text-right relative">
 <div className="flex items-center justify-end gap-2">
 <Button variant="ghost" size="icon" onClick={() => handlePrint(sale)} className="hover:bg-[var(--brand)] hover:text-[var(--bg-app)] rounded-xl h-9 w-9 border border-[var(--line)] transition-all bg-[var(--line)] text-[var(--brand)] shadow-none" title="Print PDF">
 <Printer size={16} />
 </Button>
 <Button variant="ghost" size="icon" onClick={() => openReturnModal(sale)} className="hover:bg-[var(--brand)] hover:text-[var(--bg-app)] rounded-xl h-9 w-9 border border-[var(--line)] transition-all bg-[var(--line)] text-[var(--brand)] shadow-none" title="Process Return">
 <RotateCcw size={16} />
 </Button>
 {isAdmin && (
 <Button variant="ghost" size="icon" onClick={() => handleDelete(sale.id)} className="hover:bg-[var(--danger)] hover:text-white rounded-xl h-9 w-9 text-[var(--danger)] bg-[var(--line)] border border-[var(--line)] transition-all shadow-none" title="Purge Entry">
 <Trash2 size={16} />
 </Button>
 )}
 </div>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>

 <ReturnModal
  isOpen={returnModalOpen}
  onClose={() => setReturnModalOpen(false)}
  sale={selectedSale}
  onSuccess={() => {
    reloadData();
  }}
 />
 </div>
 );
}