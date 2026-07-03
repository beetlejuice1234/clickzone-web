import { useState, useCallback, useEffect, useRef } from 'react';
import { reloadData, useAccessories, upsertPhone, addAccessory, findPhoneByIdentifier } from '@/lib/api';
import { toast } from 'sonner';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import {
 AlertDialog,
 AlertDialogContent,
 AlertDialogHeader,
 AlertDialogFooter,
 AlertDialogTitle,
 AlertDialogDescription,
 AlertDialogAction,
 AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Smartphone, Package } from 'lucide-react';
import { MODEL_OPTIONS, STORAGE_OPTIONS, COLOR_OPTIONS, CONDITION_OPTIONS, CONDITION_LABELS } from '@/lib/utils';
import type { ConditionGrade } from '@/types';

interface AddUnitModalProps {
 open: boolean;
 onClose: () => void;
}

export default function AddUnitModal({ open, onClose }: AddUnitModalProps) {
 // Common states
 const [activeTab, setActiveTab] = useState<'phone' | 'accessory'>('phone');
 const [error, setError] = useState('');

 // Phone states
 const [deviceType, setDeviceType] = useState<'phone' | 'tablet' | 'watch'>('phone');
 const [imei, setImei] = useState('');
 const [serialNumber, setSerialNumber] = useState('');
 const [model, setModel] = useState('');
 const [modelOther, setModelOther] = useState(false); // "Other" → free-text model (Android/etc.)
 const [storage, setStorage] = useState('128GB');
 const [color, setColor] = useState('Black');
 const [condition, setCondition] = useState<ConditionGrade>('a');
 const [batteryHealth, setBatteryHealth] = useState('100');
 const [icloudStatus, setIcloudStatus] = useState<'clean' | 'locked'>('clean');
 const [costPrice, setCostPrice] = useState('');
 const [salePrice, setSalePrice] = useState('');

 // Accessory states
 const [accName, setAccName] = useState('');
 const [accSku, setAccSku] = useState('');
 const [accQty, setAccQty] = useState('1');
 const [accCost, setAccCost] = useState('');
 const [accSale, setAccSale] = useState('');
 const [accSkuInfo, setAccSkuInfo] = useState<{ name: string; quantity: number } | null>(null);

 const { accessories } = useAccessories();

 // Revive-vs-new prompt (duplicate-IMEI/serial re-entry)
 const [revivePrompt, setRevivePrompt] = useState<{ id: string; status: string; date: string } | null>(null);
 const pendingPhone = useRef<(Parameters<typeof upsertPhone>[0]) | null>(null);

 // When SKU changes, check if it already exists
 useEffect(() => {
 const found = accessories.find(a => a.sku.toUpperCase() === accSku.trim().toUpperCase());
 setAccSkuInfo(found ? { name: found.name, quantity: found.quantity } : null);
 if (found && !accName) setAccName(found.name);
 if (found && !accCost) setAccCost(String(found.costPrice));
 if (found && !accSale) setAccSale(String(found.salePrice));
 }, [accSku, accessories]);

 const handleClose = useCallback(() => {
 setError('');
 onClose();
 }, [onClose]);

 const resetPhoneForm = () => { setImei(''); setSerialNumber(''); setDeviceType('phone'); setCostPrice(''); setSalePrice(''); setModel(''); setModelOther(false); };

 // Actual write: `reviveId` set => revive the existing (sold/deleted) record in place.
 const writePhone = useCallback(async (
 data: Parameters<typeof upsertPhone>[0],
 opts?: { reviveId?: string },
 ) => {
 await upsertPhone(
 opts?.reviveId ? { ...data, id: opts.reviveId, status: 'in-stock' } : data,
 opts?.reviveId ? { revive: true } : undefined,
 );
 toast.success(opts?.reviveId ? `Revived returning stock: ${data.model ?? ''}` : `Unit added: ${data.model ?? ''}`);
 reloadData();
 handleClose();
 resetPhoneForm();
 }, [handleClose]);

 const handleSubmit = useCallback(async () => {
 setError('');
 
 if (activeTab === 'phone') {
 if (deviceType === 'phone') {
 if (!imei.trim()) return setError('IMEI is required for phones');
 if (imei.length !== 15) return setError('IMEI must be 15 digits');
 } else {
 if (!serialNumber.trim()) return setError('Serial Number is required for tablets/watches');
 }
 // Match the DB CHECK: at least one identifier.
 if (!imei.trim() && !serialNumber.trim()) return setError('Enter an IMEI or a Serial Number');
 if (!model) return setError('Model is required');
 if (!costPrice || isNaN(Number(costPrice))) return setError('Valid cost price is required');
 if (!salePrice || isNaN(Number(salePrice))) return setError('Valid sale price is required');

 const phoneData = {
 id: `p${Date.now()}`,
 deviceType,
 imei: imei.trim(),
 serialNumber: serialNumber.trim(),
 model,
 storage,
 color,
 condition,
 batteryHealth: parseInt(batteryHealth),
 icloudStatus,
 costPrice: parseInt(costPrice),
 targetSalePrice: parseInt(salePrice),
 status: 'in-stock' as const,
 dateAdded: new Date().toISOString()
 };

 try {
 const idf = imei.trim() || serialNumber.trim();
 const match = await findPhoneByIdentifier(idf);
 if (match?.found && match.active) {
 setError('This IMEI/serial is already in ACTIVE stock — it is a duplicate.');
 return;
 }
 if (match?.found && !match.active) {
 // Prior sold/soft-deleted unit — ask revive vs create-new.
 pendingPhone.current = phoneData;
 setRevivePrompt({ id: match.id!, status: match.status ?? 'sold', date: match.date_added ?? '' });
 return;
 }
 await writePhone(phoneData); // brand-new unit
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to add unit');
 }
 } else {
 // Accessory
 if (!accName.trim()) return setError('Name is required');
 if (!accSku.trim()) return setError('SKU is required');
 if (!accCost || isNaN(Number(accCost))) return setError('Valid cost price is required');
 if (!accSale || isNaN(Number(accSale))) return setError('Valid sale price is required');

 const accData = {
 name: accName.trim(),
 sku: accSku.trim().toUpperCase(),
 quantity: parseInt(accQty),
 costPrice: parseInt(accCost),
 salePrice: parseInt(accSale)
 };

 try {
 await addAccessory(accData);

 toast.success(`Accessory added: ${accName}`);
 reloadData();
 handleClose();
 // Reset
 setAccName('');
 setAccSku('');
 setAccCost('');
 setAccSale('');
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Failed to add accessory');
 }
 }
 }, [activeTab, deviceType, imei, serialNumber, model, storage, color, condition, batteryHealth, icloudStatus, costPrice, salePrice, accName, accSku, accQty, accCost, accSale, handleClose]);

 return (
 <>
 <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
 <DialogContent className="sm:max-w-xl bg-[var(--paper)] border border-[var(--line)] p-0 overflow-hidden rounded-xl shadow-none">
 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'phone' | 'accessory')} className="w-full">
 <div className="bg-[var(--bg-app)] px-8 pt-8 pb-6 border-b border-[var(--line)]">
 <DialogHeader className="mb-6">
 <DialogTitle className="text-3xl text-[var(--ink)]">Add Stock</DialogTitle>
 <p className="text-sm text-[var(--subtle)] mt-1.5">Add new phones or accessories to inventory</p>
 </DialogHeader>
 <TabsList className="grid grid-cols-2 bg-[var(--bg-app)] border border-[var(--line)] rounded-xl p-1">
 <TabsTrigger value="phone" className="rounded-xl flex items-center gap-3 text-[10px] font-medium data-[state=active]:bg-[var(--paper)] data-[state=active]:text-[var(--brand)] data-[state=active]:border-[var(--line)] transition-all">
 <Smartphone size={14} /> Phone
 </TabsTrigger>
 <TabsTrigger value="accessory" className="rounded-xl flex items-center gap-3 text-[10px] font-medium data-[state=active]:bg-[var(--paper)] data-[state=active]:text-[var(--brand)] data-[state=active]:border-[var(--line)] transition-all">
 <Package size={14} /> Accessory
 </TabsTrigger>
 </TabsList>
 </div>

 <div className="p-8">
 {error && (
 <div className="mb-6 p-4 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl text-[10px] font-bold text-[var(--danger)] flex items-center gap-3 animate-shake">
 <div className="w-1.5 h-1.5 rounded-xl bg-[var(--danger)] animate-pulse" />
 {error}
 </div>
 )}

 <TabsContent value="phone" className="mt-0 space-y-6">
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Device Type</Label>
 <Select value={deviceType} onValueChange={(v) => setDeviceType(v as 'phone'|'tablet'|'watch')}>
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 focus:border-[var(--brand)] text-[11px] font-medium"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 <SelectItem value="phone" className="text-[10px] font-medium">Phone</SelectItem>
 <SelectItem value="tablet" className="text-[10px] font-medium">Tablet (iPad)</SelectItem>
 <SelectItem value="watch" className="text-[10px] font-medium">Watch</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Serial Number {deviceType !== 'phone' && <span className="text-[var(--brand)]">*</span>}</Label>
 <Input
 value={serialNumber}
 onChange={(e) => setSerialNumber(e.target.value.trim())}
 disabled={deviceType === 'phone'}
 placeholder={deviceType === 'phone' ? 'For tablets/watches' : 'Serial (no IMEI)'}
 className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] disabled:opacity-40"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2 relative group">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">IMEI Number {deviceType === 'phone' && <span className="text-[var(--brand)]">*</span>}</Label>
 <Input
 value={imei}
 onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
 placeholder={deviceType === 'phone' ? '15-digit hardware ID' : 'Optional for tablet/watch'}
 className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] "
 />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Model</Label>
 <Select
 value={modelOther ? '__other__' : model}
 onValueChange={(v) => { if (v === '__other__') { setModelOther(true); setModel(''); } else { setModelOther(false); setModel(v); } }}
 >
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 focus:border-[var(--brand)] text-[11px] font-medium ">
 <SelectValue placeholder="Identify Model" />
 </SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 {MODEL_OPTIONS.map(m => <SelectItem key={m} value={m} className="text-[10px] font-medium hover:bg-[var(--bg-app)]">{m}</SelectItem>)}
 <SelectItem value="__other__" className="text-[10px] font-medium hover:bg-[var(--bg-app)]">Other (Android / specify)…</SelectItem>
 </SelectContent>
 </Select>
 {modelOther && (
 <Input
 value={model}
 onChange={(e) => setModel(e.target.value)}
 placeholder="e.g. Samsung Galaxy S23"
 className="h-11 mt-2 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px]"
 />
 )}
 </div>
 </div>

 <div className="grid grid-cols-3 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Storage</Label>
 <Select value={storage} onValueChange={setStorage}>
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-bold"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s} className="text-[10px] font-bold">{s}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Color</Label>
 <Select value={color} onValueChange={setColor}>
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-bold"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 {COLOR_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-[10px] font-medium">{c}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Grade</Label>
 <Select value={condition} onValueChange={(v) => setCondition(v as ConditionGrade)}>
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium "><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 {CONDITION_OPTIONS.map(c => <SelectItem key={c} value={c} className="text-[10px] font-medium">{CONDITION_LABELS[c]}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="grid grid-cols-4 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Battery %</Label>
 <Input type="number" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">iCloud Status</Label>
 <Select value={icloudStatus} onValueChange={(v) => setIcloudStatus(v as 'clean'|'locked')}>
 <SelectTrigger className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 focus:border-[var(--brand)] text-[11px] font-medium ">
 <SelectValue />
 </SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl">
 <SelectItem value="clean" className="text-[10px] font-medium">Clean</SelectItem>
 <SelectItem value="locked" className="text-[10px] font-medium text-[var(--danger)]">Locked</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Cost Price</Label>
 <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)]" />
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--brand)] ">Valuation</Label>
 <Input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0" className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--brand)]/40 focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)]" />
 </div>
 </div>
 </TabsContent>

 <TabsContent value="accessory" className="mt-0 space-y-6">
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">SKU</Label>
 <Input value={accSku} onChange={(e) => setAccSku(e.target.value)} placeholder="e.g. CABLE-LITO-USB" className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] " />
 {accSkuInfo ? (
 <div className="bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] font-bold text-amber-700">
 ✓ SKU exists: <span className="font-bold">{accSkuInfo.name}</span> · Current stock: {accSkuInfo.quantity} units
 <br/><span className="text-amber-600 font-normal">Adding will increase stock by the quantity below.</span>
 </div>
 ) : accSku.trim().length > 0 ? (
 <div className="bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] font-bold text-blue-700">
 New SKU — will create a new accessory entry.
 </div>
 ) : null}
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Name</Label>
 <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. LITO USB-C Cable" className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-medium " />
 </div>
 </div>
 <div className="grid grid-cols-3 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Quantity</Label>
 <Input type="number" value={accQty} onChange={(e) => setAccQty(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Cost (Unit)</Label>
 <Input type="number" value={accCost} onChange={(e) => setAccCost(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--brand)] ">Valuation</Label>
 <Input type="number" value={accSale} onChange={(e) => setAccSale(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--brand)]/40 focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold text-[var(--ink)]" />
 </div>
 </div>
 </TabsContent>

 <div className="flex justify-end gap-4 pt-8 border-t border-[var(--line)] mt-10">
 <Button variant="ghost" onClick={handleClose} className="rounded-xl h-12 px-8 text-[11px] font-bold text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--bg-app)] transition-all">Cancel</Button>
 <Button onClick={handleSubmit} className="bg-[var(--brand)] text-[var(--bg-app)] rounded-xl h-12 px-10 text-[11px] font-medium transition-all active:scale-95 hover:brightness-90">
 Add Item
 </Button>
 </div>
 </div>
 </Tabs>
 </DialogContent>
 </Dialog>

 <AlertDialog open={!!revivePrompt} onOpenChange={(o) => { if (!o) { setRevivePrompt(null); pendingPhone.current = null; } }}>
 <AlertDialogContent className="bg-[var(--paper)] border border-[var(--line)] rounded-xl text-[var(--ink)]">
 <AlertDialogHeader>
 <AlertDialogTitle className="text-[var(--ink)]">Returning stock detected</AlertDialogTitle>
 <AlertDialogDescription className="text-[var(--subtle)] text-[12px]">
 <span className="font-mono text-[var(--ink)]">{imei.trim() || serialNumber.trim()}</span> was here before
 ({revivePrompt?.status}{revivePrompt?.date ? ` · added ${revivePrompt.date}` : ''}).
 Revive the original record (keeps its id/history) or create a new one?
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter className="gap-2">
 <AlertDialogCancel className="rounded-xl border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink)]">Cancel</AlertDialogCancel>
 <Button
 variant="ghost"
 className="rounded-xl border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--bg-app)]"
 onClick={async () => {
 const p = pendingPhone.current; setRevivePrompt(null); pendingPhone.current = null;
 if (p) { try { await writePhone(p); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }
 }}
 >Create new</Button>
 <AlertDialogAction
 className="rounded-xl bg-[var(--brand)] text-[var(--bg-app)] hover:brightness-90"
 onClick={async () => {
 const p = pendingPhone.current; const rid = revivePrompt?.id; setRevivePrompt(null); pendingPhone.current = null;
 if (p && rid) { try { await writePhone(p, { reviveId: rid }); } catch (e) { setError(e instanceof Error ? e.message : 'Failed to revive'); } }
 }}
 >Revive existing</AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </>
 );
}