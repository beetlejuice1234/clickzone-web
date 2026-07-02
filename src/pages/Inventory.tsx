import { useState, useMemo, useCallback } from 'react';
import { MoreHorizontal, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Package, Smartphone, Search, Plus } from 'lucide-react';
import { usePhones, useAccessories, reloadData, deletePhone, deleteAccessory } from '@/lib/api';
import { formatLKR, STATUS_LABELS, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useMobile } from '@/hooks/useMobile';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { motion } from 'framer-motion';
import type { PhoneUnit, Accessory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
 Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
 DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EditUnitModal from '@/components/EditUnitModal';
import EditAccessoryModal from '@/components/EditAccessoryModal';

type SortKey = 'model' | 'imei' | 'condition' | 'costPrice' | 'status' | 'name' | 'sku' | 'quantity';
type SortDir = 'asc' | 'desc';

interface InventoryProps {
 onAddStock: () => void;
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
 return (
 <>
 {Array.from({ length: rows }).map((_, i) => (
 <TableRow key={i} className="border-[var(--line)]">
 {Array.from({ length: cols }).map((_, j) => (
 <TableCell key={j} className="py-4 px-4 bg-[var(--paper)]">
 <div className="h-4 bg-[var(--line)] rounded-none animate-pulse" style={{ width: `${50 + Math.random() * 40}%` }} />
 </TableCell>
 ))}
 </TableRow>
 ))}
 </>
 );
}

export default function Inventory({ onAddStock }: InventoryProps) {
 const isMobile = useMobile();
 const { isAdmin, requireAdmin } = useAuth();
 const { phones, isLoading: isLoadingPhones } = usePhones();
 const { accessories, isLoading: isLoadingAcc } = useAccessories();
 const isLoading = isLoadingPhones || isLoadingAcc;

 const [selectedPhoneIds, setSelectedPhoneIds] = useState<Set<string>>(new Set());
 const [editPhone, setEditPhone] = useState<PhoneUnit | null>(null);
 const [editPhoneOpen, setEditPhoneOpen] = useState(false);
 const [editAccessory, setEditAccessory] = useState<Accessory | null>(null);
 const [editAccessoryOpen, setEditAccessoryOpen] = useState(false);
 const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
 const [searchStr, setSearchStr] = useState('');
 const [phoneFilter, setPhoneFilter] = useState<'all' | 'in-stock' | 'sold' | 'purchased' | 'trade-in' | 'returned'>('all');
 const [accFilter, setAccFilter] = useState<'all' | 'in-stock' | 'out-of-stock'>('all');

 useBarcodeScanner(useCallback((scanned) => {
 setSearchStr(scanned);
 toast.success(`Catalog Identified: ${scanned}`);
 }, []));

 const filteredPhones = useMemo(() => {
 let list = phones;
 if (phoneFilter !== 'all') {
 if (phoneFilter === 'in-stock' || phoneFilter === 'sold') {
 list = list.filter(p => p.status === phoneFilter);
 } else {
 list = list.filter(p => (p.source ?? 'purchased') === phoneFilter);
 }
 }
 const finalSearch = searchStr.trim().toLowerCase();
 if (finalSearch) {
 list = list.filter(
 (p) =>
 p.model.toLowerCase().includes(finalSearch) ||
 (p.imei ?? '').toLowerCase().includes(finalSearch) ||
 (p.serialNumber ?? '').toLowerCase().includes(finalSearch) ||
 p.color.toLowerCase().includes(finalSearch) ||
 p.storage.toLowerCase().includes(finalSearch)
 );
 }
 if (sort && ['model', 'imei', 'condition', 'costPrice', 'status'].includes(sort.key)) {
 list = [...list].sort((a, b) => {
 const dir = sort.dir === 'asc' ? 1 : -1;
 const key = sort.key as keyof PhoneUnit;
 const valA = a[key]; const valB = b[key];
 if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
 if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
 return 0;
 });
 } else {
 list = [...list].sort((a, b) => {
 const dateA = new Date(a.localUpdatedAt || a.dateAdded || 0).getTime();
 const dateB = new Date(b.localUpdatedAt || b.dateAdded || 0).getTime();
 return dateB - dateA;
 });
 }
 return list;
 }, [phones, searchStr, phoneFilter, sort]);

 const filteredAccessories = useMemo(() => {
 let list = accessories;
 if (accFilter === 'in-stock') list = list.filter(a => a.quantity > 0);
 if (accFilter === 'out-of-stock') list = list.filter(a => a.quantity === 0);
 const finalSearch = searchStr.trim().toLowerCase();
 if (finalSearch) {
 list = list.filter((a) => a.name.toLowerCase().includes(finalSearch) || a.sku.toLowerCase().includes(finalSearch));
 }
 if (sort && ['name', 'sku', 'quantity', 'costPrice'].includes(sort.key)) {
 list = [...list].sort((a, b) => {
 const dir = sort.dir === 'asc' ? 1 : -1;
 const key = sort.key as keyof Accessory;
 const valA = a[key]; const valB = b[key];
 if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * dir;
 if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
 return 0;
 });
 } else {
 list = [...list].sort((a, b) => {
 const dateA = new Date(a.localUpdatedAt || 0).getTime();
 const dateB = new Date(b.localUpdatedAt || 0).getTime();
 return dateB - dateA;
 });
 }
 return list;
 }, [accessories, searchStr, accFilter, sort]);

 const handleSort = useCallback((key: SortKey) => {
 setSort((prev) => {
 if (!prev || prev.key !== key) return { key, dir: 'asc' };
 if (prev.dir === 'asc') return { key, dir: 'desc' };
 return null;
 });
 }, []);

 const renderSortIcon = useCallback((column: SortKey) => {
 if (sort?.key !== column) return <ArrowUpDown size={12} className="text-[var(--subtle)]" />;
 return sort.dir === 'asc' ? <ArrowUp size={12} className="text-[var(--accent)]" /> : <ArrowDown size={12} className="text-[var(--accent)]" />;
 }, [sort]);

 const handleSelectPhone = useCallback((id: string, checked: boolean) => {
 setSelectedPhoneIds((prev) => {
 const next = new Set(prev);
 if (checked) next.add(id); else next.delete(id);
 return next;
 });
 }, []);

 const handleDeletePhone = useCallback(async (id: string) => {
 if (confirm('Are you sure you want to delete this?')) {
 try {
 await deletePhone(id);
 reloadData();
 toast.success('Deleted successfully');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to delete');
 }
 }
 }, []);

 const handleDeleteAccessory = useCallback(async (sku: string) => {
 if (confirm('Are you sure you want to delete this?')) {
 try {
 await deleteAccessory(sku);
 reloadData();
 toast.success('Deleted successfully');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to delete');
 }
 }
 }, []);

 const allSelected = filteredPhones.length > 0 && filteredPhones.every((p) => selectedPhoneIds.has(p.id));

 return (
 <div className="min-h-screen bg-[var(--bg-app)]">
 {isMobile ? (
 <div className="px-4 py-4 space-y-4">
 <div className="flex items-center justify-between">
 <div className="relative flex-1 mr-2">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtle)]" size={14} />
 <Input 
 placeholder="Lookup..." 
 value={searchStr}
 onChange={e => setSearchStr(e.target.value)}
 className="pl-9 h-10 bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-none placeholder:text-[var(--subtle)]/50"
 />
 </div>
 <Button 
 className="h-10 w-10 rounded-none bg-[var(--accent)] text-[var(--bg-app)] p-0 active:scale-95 transition-transform"
 onClick={onAddStock}
 >
 <Plus size={18} />
 </Button>
 </div>

 <Tabs defaultValue="phones">
 <TabsList className="w-full mb-4 bg-[var(--paper)] border border-[var(--line)] rounded-none p-1">
 <TabsTrigger value="phones" className="flex-1 rounded-none text-[10px] font-bold data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--bg-app)] gap-1.5">
 Phones ({filteredPhones.length})
 </TabsTrigger>
 <TabsTrigger value="accessories" className="flex-1 rounded-none text-[10px] font-bold data-[state=active]:bg-[var(--accent)] data-[state=active]:text-[var(--bg-app)] gap-1.5">
 Accessories ({filteredAccessories.length})
 </TabsTrigger>
 </TabsList>

 <TabsContent value="phones">
 <div className="flex gap-2 mb-4 overflow-x-auto pb-1 hide-scrollbar">
   {(['all', 'in-stock', 'sold', 'purchased', 'trade-in', 'returned'] as const).map(filter => (
     <button
       key={filter}
       onClick={() => setPhoneFilter(filter)}
       className={cn(
         "px-3 py-1 text-[10px] font-bold uppercase rounded-none border transition-all whitespace-nowrap",
         phoneFilter === filter 
           ? "bg-[var(--accent)] text-[var(--bg-app)] border-[var(--accent)]" 
           : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
       )}
     >
       {filter.replace('-', ' ')}
     </button>
   ))}
 </div>
 {isLoading ? (
 <div className="space-y-3">
 {[1, 2, 3].map(i => <div key={i} className="h-16 bg-[var(--paper)] border border-[var(--line)] rounded-none animate-pulse" />)}
 </div>
 ) : filteredPhones.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center opacity-40">
 <Smartphone size={32} className="text-[var(--subtle)] mb-3" />
 <p className="text-[10px] font-bold text-[var(--subtle)] ">No Results</p>
 </div>
 ) : (
 <motion.div className="space-y-2" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
 {filteredPhones.map(phone => (
 <motion.div key={phone.id} variants={{ hidden: { opacity: 0, y: 5 }, show: { opacity: 1, y: 0 } }}
 className="bg-[var(--paper)] rounded-none p-4 border border-[var(--line)] flex items-center gap-3">
 <div className="flex-1 min-w-0">
 <p className="text-xs font-bold text-[var(--ink)] truncate ">{phone.model}</p>
 <p className="text-[9px] text-[var(--subtle)] ">{phone.storage} · {phone.color}</p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-xs font-bold text-[var(--accent)]">{isAdmin ? formatLKR(phone.costPrice).split(' ')[1] : '---'}</p>
 </div>
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button className="h-7 w-7 flex items-center justify-center rounded-none bg-[var(--line)] text-[var(--subtle)] border border-[var(--line)] hover:bg-[var(--accent)] hover:text-[var(--bg-app)] transition-colors">
 <MoreHorizontal size={14} />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-none">
 <DropdownMenuItem onClick={() => requireAdmin(() => { setEditPhone(phone); setEditPhoneOpen(true); })} className="text-[10px] font-bold focus:bg-[var(--accent)] focus:text-[var(--bg-app)]"><Pencil size={12} className="mr-2" /> Edit</DropdownMenuItem>
 <DropdownMenuItem onClick={() => handleDeletePhone(phone.id)} className="text-[10px] font-bold text-[var(--danger)] focus:bg-[var(--danger)] focus:text-white"><Trash2 size={12} className="mr-2" /> Delete</DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </motion.div>
 ))}
 </motion.div>
 )}
 </TabsContent>

 <TabsContent value="accessories">
 <div className="flex gap-2 mb-4 overflow-x-auto pb-1 hide-scrollbar">
   {(['all', 'in-stock', 'out-of-stock'] as const).map(filter => (
     <button
       key={filter}
       onClick={() => setAccFilter(filter)}
       className={cn(
         "px-3 py-1 text-[10px] font-bold uppercase rounded-none border transition-all whitespace-nowrap",
         accFilter === filter 
           ? "bg-[var(--accent)] text-[var(--bg-app)] border-[var(--accent)]" 
           : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
       )}
     >
       {filter.replace(/-/g, ' ')}
     </button>
   ))}
 </div>
 {isLoading ? (
 <div className="space-y-3">
 {[1, 2, 3].map(i => <div key={i} className="h-16 bg-[var(--paper)] border border-[var(--line)] rounded-none animate-pulse" />)}
 </div>
 ) : filteredAccessories.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center opacity-40">
 <Package size={32} className="text-[var(--subtle)] mb-3" />
 <p className="text-[10px] font-bold text-[var(--subtle)] ">No Accessories Found</p>
 </div>
 ) : (
 <motion.div className="space-y-2" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
 {filteredAccessories.map(acc => (
 <motion.div key={acc.sku} variants={{ hidden: { opacity: 0, y: 5 }, show: { opacity: 1, y: 0 } }}
 className="bg-[var(--paper)] rounded-none p-4 border border-[var(--line)] flex items-center gap-3">
 <div className="flex-1 min-w-0">
 <p className="text-xs font-bold text-[var(--ink)] truncate ">{acc.name}</p>
 <p className="text-[9px] text-[var(--subtle)]">{acc.sku}</p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-[11px] font-bold text-[var(--accent)]">{formatLKR(acc.salePrice)}</p>
 </div>
 </motion.div>
 ))}
 </motion.div>
 )}
 </TabsContent>
 </Tabs>
 </div>
 ) : (
 <div className="px-8 py-8 max-w-7xl mx-auto space-y-6">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-[var(--ink)] ">Inventory</h1>
 <p className="text-[var(--subtle)] text-[9px] mt-1 ">Stock Management</p>
 </div>
 
 <div className="relative group">
 <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] group-focus-within:text-[var(--accent)] transition-colors" />
 <Input
 placeholder="Search Inventory..."
 value={searchStr}
 onChange={e => setSearchStr(e.target.value)}
 className="pl-9 w-64 h-9 bg-[var(--paper)] border-[var(--line)] rounded-none text-[10px] font-medium text-[var(--ink)] placeholder:text-[var(--subtle)]/50 focus-visible:border-[var(--accent)] focus-visible:ring-0"
 />
 </div>
 </div>

 <Tabs defaultValue="phones" className="w-full">
 <TabsList className="bg-[var(--bg-app)] p-0 rounded-none w-fit h-auto border-b border-[var(--line)]">
 <TabsTrigger value="phones" className="px-8 py-2.5 rounded-none text-[10px] font-bold font-medium data-[state=active]:bg-[var(--paper)] data-[state=active]:text-[var(--accent)] data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-[var(--line)] border-transparent">
 Phones
 </TabsTrigger>
 <TabsTrigger value="accessories" className="px-8 py-2.5 rounded-none text-[10px] font-bold font-medium data-[state=active]:bg-[var(--paper)] data-[state=active]:text-[var(--accent)] data-[state=active]:border-t data-[state=active]:border-x data-[state=active]:border-[var(--line)] border-transparent">
 Accessories
 </TabsTrigger>
 </TabsList>

 <TabsContent value="phones" className="mt-0 pt-6">
  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
    {(['all', 'in-stock', 'sold', 'purchased', 'trade-in', 'returned'] as const).map(filter => (
      <button
        key={filter}
        onClick={() => setPhoneFilter(filter)}
        className={cn(
          "px-3 py-1 text-[10px] font-bold uppercase rounded-none border transition-all whitespace-nowrap",
          phoneFilter === filter 
            ? "bg-[var(--accent)] text-[var(--bg-app)] border-[var(--accent)]" 
            : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
        )}
      >
        {filter.replace('-', ' ')}
      </button>
    ))}
  </div>
 <div className="bg-[var(--paper)] border border-[var(--line)] rounded-none shadow-none overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="bg-[var(--bg-app)] hover:bg-[var(--bg-app)] border-b border-[var(--line)]">
 <TableHead className="w-12 py-3 px-6">
 <Checkbox checked={allSelected} onCheckedChange={(c) => {
 if (c) setSelectedPhoneIds(new Set(filteredPhones.map(p => p.id)));
 else setSelectedPhoneIds(new Set());
 }} className="rounded-none border-[var(--line)] data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[var(--accent)]" />
 </TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('model')}>
 <div className="flex items-center gap-2 text-inherit transition-colors">Model {renderSortIcon('model')}</div>
 </TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('imei')}>
 <div className="flex items-center gap-2 text-inherit transition-colors">IMEI {renderSortIcon('imei')}</div>
 </TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('condition')}>
 <div className="flex items-center gap-2 text-inherit transition-colors">Condition {renderSortIcon('condition')}</div>
 </TableHead>
 {isAdmin && (
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('costPrice')}>
 <div className="flex items-center gap-2 text-inherit transition-colors">Cost Price {renderSortIcon('costPrice')}</div>
 </TableHead>
 )}
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium">Sell Price</TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('status')}>
 <div className="flex items-center gap-2 text-inherit transition-colors">Status {renderSortIcon('status')}</div>
 </TableHead>
 <TableHead className="py-3 px-6 text-right text-[9px] font-bold text-[var(--subtle)] font-medium">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="zebra-table">
 {isLoading ? <SkeletonRows cols={isAdmin ? 8 : 7} /> : filteredPhones.length === 0 ? (
 <TableRow>
 <TableCell colSpan={isAdmin ? 8 : 7} className="h-60 text-center bg-[var(--paper)]">
 <Smartphone size={32} className="mx-auto mb-4 text-[var(--line)]" />
 <p className="text-[10px] font-bold text-[var(--subtle)] ">No results found</p>
 </TableCell>
 </TableRow>
 ) : filteredPhones.map((phone) => (
 <TableRow key={phone.id} className="border-b border-[var(--line)]/50 transition-all hover:border-l-2 hover:border-l-[var(--success)]">
 <TableCell className="py-3 px-6">
 <Checkbox checked={selectedPhoneIds.has(phone.id)} onCheckedChange={(c) => handleSelectPhone(phone.id, c as boolean)} className="rounded-none border-[var(--line)] data-[state=checked]:bg-[var(--accent)]" />
 </TableCell>
 <TableCell className="py-3 px-6">
 <div className="flex items-center gap-2">
 <p className="font-bold text-[var(--ink)] text-[11px]">{phone.model}</p>
 {phone.source === 'trade-in' && <span className="bg-orange-100 text-orange-700 border border-orange-300 text-[9px] font-bold px-1.5 py-0.5 rounded-none">TRADE-IN</span>}
 {phone.source === 'returned' && <span className="bg-sky-100 text-sky-700 border border-sky-300 text-[9px] font-bold px-1.5 py-0.5 rounded-none">RETURNED</span>}
 </div>
 <p className="text-[9px] text-[var(--subtle)] mt-0.5 ">{phone.storage} · {phone.color}</p>
 </TableCell>
 <TableCell className="py-3 px-6 text-[10px] text-[var(--subtle)]">
 <div className="flex items-center gap-2">
 <span>{phone.imei ? `#${phone.imei}` : phone.serialNumber ? `SN ${phone.serialNumber}` : '—'}</span>
 {phone.deviceType && phone.deviceType !== 'phone' && (
 <span className="bg-[var(--paper)] text-[var(--accent)] border border-[var(--line)] text-[8px] font-bold px-1.5 py-0.5 rounded-none uppercase">{phone.deviceType}</span>
 )}
 </div>
 </TableCell>
 <TableCell className="py-3 px-6">
 <span className={cn("inline-block px-2 py-0.5 text-[8px] font-bold border rounded-none ", 
 phone.condition === 'sealed' ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20' : 
 phone.condition === 'a-plus' ? 'bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20' : 'bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)]'
 )}>
 {phone.condition === 'sealed' ? 'Sealed' : phone.condition === 'a-plus' ? 'Grade A+' : phone.condition}
 </span>
 </TableCell>
 {isAdmin && <TableCell className="py-3 px-6 text-[10px] text-[var(--subtle)]">{formatLKR(phone.costPrice).split(' ')[1]}</TableCell>}
 <TableCell className="py-3 px-6 text-[10px] font-bold text-[var(--accent)]">{formatLKR(phone.targetSalePrice).split(' ')[1]}</TableCell>
 <TableCell className="py-3 px-6">
 <div className="flex items-center gap-2">
 <div className={cn("w-1.5 h-1.5 rounded-none shadow-[0_0_8px_currentColor]", 
 phone.status === 'in-stock' ? 'text-[var(--success)] bg-[var(--success)]' : 
 phone.status === 'sold' ? 'text-[var(--danger)] bg-[var(--danger)]' : 'text-[var(--warning)] bg-[var(--warning)]'
 )} />
 <span className="text-[9px] font-bold text-[var(--ink)] ">{STATUS_LABELS[phone.status]}</span>
 </div>
 </TableCell>
 <TableCell className="py-3 px-6 text-right">
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none bg-[var(--line)] border border-[var(--line)] hover:bg-[var(--accent)] hover:text-[var(--bg-app)] transition-colors">
 <MoreHorizontal className="h-3.5 w-3.5" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-none p-1">
 <DropdownMenuItem className="text-[9px] font-bold focus:bg-[var(--accent)] focus:text-[var(--bg-app)]" onClick={() => requireAdmin(() => { setEditPhone(phone); setEditPhoneOpen(true); })}><Pencil className="mr-2 h-3 w-3" /> Edit</DropdownMenuItem>
 <DropdownMenuItem className="text-[9px] font-bold text-[var(--danger)] focus:bg-[var(--danger)] focus:text-white" onClick={() => handleDeletePhone(phone.id)}><Trash2 className="mr-2 h-3 w-3" /> Delete</DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </TabsContent>

 <TabsContent value="accessories" className="mt-0 pt-6">
  <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
    {(['all', 'in-stock', 'out-of-stock'] as const).map(filter => (
      <button
        key={filter}
        onClick={() => setAccFilter(filter)}
        className={cn(
          "px-3 py-1 text-[10px] font-bold uppercase rounded-none border transition-all whitespace-nowrap",
          accFilter === filter 
            ? "bg-[var(--accent)] text-[var(--bg-app)] border-[var(--accent)]" 
            : "bg-[var(--paper)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
        )}
      >
        {filter.replace(/-/g, ' ')}
      </button>
    ))}
  </div>
  <div className="bg-[var(--paper)] border border-[var(--line)] rounded-none shadow-none overflow-hidden">
 <Table>
 <TableHeader>
 <TableRow className="bg-[var(--bg-app)] hover:bg-[var(--bg-app)] border-b border-[var(--line)]">
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('name')}>
 <div className="flex items-center gap-2 transition-colors">Name {renderSortIcon('name')}</div>
 </TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('sku')}>
 <div className="flex items-center gap-2 transition-colors">SKU {renderSortIcon('sku')}</div>
 </TableHead>
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium cursor-pointer group hover:text-[var(--accent)]" onClick={() => handleSort('quantity')}>
 <div className="flex items-center gap-2 transition-colors">Quantity {renderSortIcon('quantity')}</div>
 </TableHead>
 {isAdmin && <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium">Cost Price</TableHead>}
 <TableHead className="py-3 px-6 text-[9px] font-bold text-[var(--subtle)] font-medium">Sale Price</TableHead>
 <TableHead className="py-3 px-6 text-right text-[9px] font-bold text-[var(--subtle)] font-medium">Actions</TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="zebra-table">
 {isLoading ? <SkeletonRows cols={isAdmin ? 6 : 5} /> : filteredAccessories.length === 0 ? (
 <TableRow>
 <TableCell colSpan={isAdmin ? 6 : 5} className="h-40 text-center bg-[var(--paper)]">
 <Package size={32} className="mx-auto mb-4 text-[var(--line)]" />
 <p className="text-[10px] font-bold text-[var(--subtle)] ">No accessories found</p>
 </TableCell>
 </TableRow>
 ) : filteredAccessories.map((acc) => (
 <TableRow key={acc.sku} className="border-b border-[var(--line)]/50 transition-all hover:border-l-2 hover:border-l-[var(--success)]">
 <TableCell className="py-3 px-6 font-bold text-[var(--ink)] text-[11px]">{acc.name}</TableCell>
 <TableCell className="py-3 px-6 text-[10px] text-[var(--subtle)] ">#{acc.sku}</TableCell>
 <TableCell className="py-3 px-6">
 <div className="flex items-center gap-2">
 <span className={cn("text-[11px] font-bold ", acc.quantity <= 5 ? 'text-[var(--danger)]' : 'text-[var(--success)]')}>
 {acc.quantity.toString().padStart(2, '0')}
 </span>
 {acc.quantity <= 5 && <span className="text-[8px] font-bold bg-[var(--danger)] text-white px-1.5 py-0.5 rounded-none">CRITICAL STOCK</span>}
 </div>
 </TableCell>
 {isAdmin && <TableCell className="py-3 px-6 text-[10px] text-[var(--subtle)]">{formatLKR(acc.costPrice).split(' ')[1]}</TableCell>}
 <TableCell className="py-3 px-6 text-[10px] font-bold text-[var(--accent)]">{formatLKR(acc.salePrice).split(' ')[1]}</TableCell>
 <TableCell className="py-3 px-6 text-right">
 <DropdownMenu>
 <DropdownMenuTrigger asChild>
 <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none bg-[var(--line)] border border-[var(--line)] hover:bg-[var(--accent)] hover:text-[var(--bg-app)] transition-colors">
 <MoreHorizontal className="h-3.5 w-3.5" />
 </Button>
 </DropdownMenuTrigger>
 <DropdownMenuContent align="end" className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-none p-1">
 <DropdownMenuItem className="text-[9px] font-bold focus:bg-[var(--accent)] focus:text-[var(--bg-app)]" onClick={() => requireAdmin(() => { setEditAccessory(acc); setEditAccessoryOpen(true); })}><Pencil className="mr-2 h-3 w-3" /> Edit</DropdownMenuItem>
 <DropdownMenuItem className="text-[9px] font-bold text-[var(--danger)] focus:bg-[var(--danger)] focus:text-white" onClick={() => handleDeleteAccessory(acc.sku)}><Trash2 className="mr-2 h-3 w-3" /> Delete</DropdownMenuItem>
 </DropdownMenuContent>
 </DropdownMenu>
 </TableCell>
 </TableRow>
 ))}
 </TableBody>
 </Table>
 </div>
 </TabsContent>
 </Tabs>
 </div>
 )}

 <EditUnitModal key={editPhone?.id ?? 'phone-closed'} open={editPhoneOpen} phone={editPhone} onClose={() => { setEditPhoneOpen(false); setEditPhone(null); }} />
 <EditAccessoryModal key={editAccessory?.sku ?? 'acc-closed'} open={editAccessoryOpen} accessory={editAccessory} onClose={() => { setEditAccessoryOpen(false); setEditAccessory(null); }} />
 </div>
 );
}