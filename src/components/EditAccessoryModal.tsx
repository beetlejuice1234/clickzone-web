import { useState, useCallback } from 'react';
import { reloadData, updateAccessory } from '@/lib/api';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Accessory } from '@/types';

interface EditAccessoryModalProps {
 open: boolean;
 accessory: Accessory | null;
 onClose: () => void;
}

export default function EditAccessoryModal({ open, accessory, onClose }: EditAccessoryModalProps) {
 const [name, setName] = useState(accessory?.name ?? '');
 const [quantity, setQuantity] = useState(String(accessory?.quantity ?? ''));
 const [costPrice, setCostPrice] = useState(String(accessory?.costPrice ?? ''));
 const [salePrice, setSalePrice] = useState(String(accessory?.salePrice ?? ''));
 const [serialNumber, setSerialNumber] = useState(accessory?.serialNumber ?? '');
 const [notes, setNotes] = useState(accessory?.notes ?? '');
 const [error, setError] = useState('');

 const handleClose = useCallback(() => {
 setError('');
 onClose();
 }, [onClose]);

 const handleSubmit = useCallback(async () => {
 setError('');
 if (!accessory) return;
 if (!name.trim()) return setError('Name is required');
 if (!quantity || isNaN(Number(quantity))) return setError('Valid quantity required');
 if (!costPrice || isNaN(Number(costPrice))) return setError('Valid cost price required');
 if (!salePrice || isNaN(Number(salePrice))) return setError('Valid sale price required');

 const updatePayload = {
 name: name.trim(),
 quantity: parseInt(quantity),
 costPrice: parseInt(costPrice),
 salePrice: parseInt(salePrice),
 serialNumber: serialNumber.trim() || undefined,
 notes: notes.trim() || undefined,
 };

 try {
 await updateAccessory(accessory.sku, updatePayload);
 reloadData();
 toast.success('Accessory Updated');
 handleClose();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to update accessory');
 }
 }, [accessory, name, quantity, costPrice, salePrice, serialNumber, notes, handleClose]);

 return (
 <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
 <DialogContent className="sm:max-w-md bg-[var(--paper)] border border-[var(--line)] p-0 overflow-hidden rounded-xl shadow-none">
 <div className="bg-[var(--bg-app)] px-8 pt-8 pb-6 border-b border-[var(--line)]">
 <DialogHeader>
 <DialogTitle className="text-3xl text-[var(--ink)]">Edit Accessory</DialogTitle>
 <p className="text-sm text-[var(--subtle)] mt-1.5">Update accessory details and quantity</p>
 </DialogHeader>
 </div>

 <div className="p-8">
 {error && (
 <div className="mb-6 p-4 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-xl text-[10px] font-bold text-[var(--danger)] flex items-center gap-3 animate-shake">
 <div className="w-1.5 h-1.5 rounded-xl bg-[var(--danger)] animate-pulse" />
 {error}
 </div>
 )}

 <div className="space-y-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">SKU</Label>
 <Input value={accessory?.sku ?? ''} disabled className="h-11 bg-[var(--bg-app)] border-[var(--line)] text-[var(--subtle)] text-[11px] opacity-60" />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Name</Label>
 <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-medium " />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Quantity</Label>
 <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Cost Price</Label>
 <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--brand)] ">Sale Price</Label>
 <Input type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--brand)]/40 text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Serial Number <span className="text-[var(--subtle)] font-normal">(optional)</span></Label>
 <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Device serial, if applicable" className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-medium" />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Internal Note <span className="text-[var(--subtle)] font-normal">(staff only — not shown on the invoice)</span></Label>
 <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Private note — supplier, condition remarks, etc." className="w-full px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--line)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand)] text-[11px] resize-none" />
 </div>
 </div>

 <div className="flex justify-end gap-4 pt-8 border-t border-[var(--line)] mt-10">
 <Button variant="ghost" onClick={handleClose} className="rounded-xl h-12 px-8 text-[11px] font-bold text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--bg-app)] transition-all">Cancel</Button>
 <Button onClick={handleSubmit} className="bg-[var(--terracotta)] hover:bg-[var(--terracotta-hover)] text-white rounded-xl h-12 px-10 text-[11px] font-medium transition-all active:scale-95">
 Save Changes
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 );
}