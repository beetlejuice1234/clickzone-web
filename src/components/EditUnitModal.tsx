import { useState, useCallback } from 'react';
import { reloadData, upsertPhone } from '@/lib/api';
import { toast } from 'sonner';
import {
 Dialog,
 DialogContent,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
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
import { MODEL_OPTIONS, STORAGE_OPTIONS, COLOR_OPTIONS, CONDITION_OPTIONS, CONDITION_LABELS } from '@/lib/utils';
import type { ConditionGrade, PhoneUnit } from '@/types';

interface EditUnitModalProps {
 open: boolean;
 phone: PhoneUnit | null;
 onClose: () => void;
}

export default function EditUnitModal({ open, phone, onClose }: EditUnitModalProps) {
 const [deviceType, setDeviceType] = useState<'phone' | 'tablet' | 'watch'>(phone?.deviceType ?? 'phone');
 const [imei, setImei] = useState(phone?.imei ?? '');
 const [serialNumber, setSerialNumber] = useState(phone?.serialNumber ?? '');
 const [model, setModel] = useState(phone?.model ?? '');
 // Other/Android model: start in free-text mode when the current model isn't an iPhone catalog entry
 // (so editing an Other-brand phone shows its model instead of a blank select).
 const [modelOther, setModelOther] = useState<boolean>(!!phone && !(MODEL_OPTIONS as readonly string[]).includes(phone.model));
 const [storage, setStorage] = useState(phone?.storage ?? '');
 const [color, setColor] = useState(phone?.color ?? '');
 const [condition, setCondition] = useState<ConditionGrade>(phone?.condition ?? 'a');
 const [batteryHealth, setBatteryHealth] = useState(String(phone?.batteryHealth ?? 100));
 const [icloudStatus, setIcloudStatus] = useState<'clean' | 'locked'>(phone?.icloudStatus ?? 'clean');
 const [costPrice, setCostPrice] = useState(String(phone?.costPrice ?? ''));
 const [targetSalePrice, setTargetSalePrice] = useState(String(phone?.targetSalePrice ?? ''));
 const [error, setError] = useState('');

 const handleClose = useCallback(() => {
 setError('');
 onClose();
 }, [onClose]);

 const handleSubmit = useCallback(async () => {
 setError('');
 if (!phone) return;
 if (deviceType === 'phone') {
 if (!imei.trim()) return setError('IMEI is required for phones');
 if (imei.length !== 15) return setError('IMEI must be 15 digits');
 } else if (!serialNumber.trim()) {
 return setError('Serial Number is required for tablets/watches');
 }
 if (!imei.trim() && !serialNumber.trim()) return setError('Enter an IMEI or a Serial Number');
 if (!model || !storage || !color) return setError('Model, storage, and color are required');
 if (!costPrice || isNaN(Number(costPrice))) return setError('Valid cost price is required');
 if (!targetSalePrice || isNaN(Number(targetSalePrice))) return setError('Valid target sale price is required');
 if (Number(batteryHealth) < 0 || Number(batteryHealth) > 100) return setError('Invalid battery health');

 const updatePayload = {
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
 targetSalePrice: parseInt(targetSalePrice),
 status: phone.status,
 };

 try {
 await upsertPhone({ id: phone.id, ...updatePayload });
 reloadData();
 toast.success(`${model} updated`);
 handleClose();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Failed to update unit');
 }
 }, [phone, deviceType, imei, serialNumber, model, storage, color, condition, batteryHealth, icloudStatus, costPrice, targetSalePrice, handleClose]);

 return (
 <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
 <DialogContent className="sm:max-w-xl bg-[var(--paper)] border border-[var(--line)] p-0 overflow-hidden rounded-none shadow-[0_0_100px_rgba(0,0,0,0.5)]">
 <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--success)]/30 to-transparent" />
 <div className="bg-[var(--bg-app)] px-8 pt-8 pb-6 border-b border-[var(--line)]">
 <DialogHeader>
 <DialogTitle className="text-3xl text-[var(--ink)]">Edit Phone</DialogTitle>
 <p className="text-sm text-[var(--subtle)] mt-1.5">Update phone details and status</p>
 </DialogHeader>
 </div>

 <div className="p-8">
 {error && (
 <div className="mb-6 p-4 bg-[var(--danger)]/5 border border-[var(--danger)]/20 rounded-none text-[10px] font-bold text-[var(--danger)] flex items-center gap-3 animate-shake">
 <div className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] animate-pulse" />
 {error}
 </div>
 )}

 <div className="space-y-6">
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Device Type</Label>
 <Select value={deviceType} onValueChange={(v) => setDeviceType(v as 'phone'|'tablet'|'watch')}>
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 <SelectItem value="phone" className="text-[10px] font-medium">Phone</SelectItem>
 <SelectItem value="tablet" className="text-[10px] font-medium">Tablet (iPad)</SelectItem>
 <SelectItem value="watch" className="text-[10px] font-medium">Watch</SelectItem>
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Serial Number {deviceType !== 'phone' && <span className="text-[var(--accent)]">*</span>}</Label>
 <Input
 value={serialNumber}
 onChange={(e) => setSerialNumber(e.target.value.trim())}
 disabled={deviceType === 'phone'}
 placeholder={deviceType === 'phone' ? 'For tablets/watches' : 'Serial (no IMEI)'}
 className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--success)] focus-visible:ring-0 text-[11px] disabled:opacity-40"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">IMEI {deviceType === 'phone' && <span className="text-[var(--accent)]">*</span>}</Label>
 <Input
 value={imei}
 onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
 className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--success)] focus-visible:ring-0 text-[11px] "
 />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Model</Label>
 <Select
 value={modelOther ? '__other__' : model}
 onValueChange={(v) => { if (v === '__other__') { setModelOther(true); setModel(''); } else { setModelOther(false); setModel(v); } }}
 >
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium "><SelectValue placeholder="Select model" /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 {MODEL_OPTIONS.map((m) => <SelectItem key={m} value={m} className="text-[10px] font-medium ">{m}</SelectItem>)}
 <SelectItem value="__other__" className="text-[10px] font-medium ">Other (Android / specify)…</SelectItem>
 </SelectContent>
 </Select>
 {modelOther && (
 <Input
 value={model}
 onChange={(e) => setModel(e.target.value)}
 placeholder="e.g. Samsung Galaxy S23"
 className="h-11 mt-2 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--success)] focus-visible:ring-0 text-[11px]"
 />
 )}
 </div>
 </div>

 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Storage</Label>
 <Select value={storage} onValueChange={setStorage}>
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-bold"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 {STORAGE_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-[10px] font-bold">{s}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Color</Label>
 <Select value={color} onValueChange={setColor}>
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium"><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 {COLOR_OPTIONS.map((c) => <SelectItem key={c} value={c} className="text-[10px] font-medium">{c}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="grid grid-cols-3 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Condition</Label>
 <Select value={condition} onValueChange={(v) => setCondition(v as ConditionGrade)}>
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium "><SelectValue /></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 {CONDITION_OPTIONS.map((c) => <SelectItem key={c} value={c} className="text-[10px] font-medium">{CONDITION_LABELS[c]}</SelectItem>)}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Battery %</Label>
 <Input type="number" max="100" min="0" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--success)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">iCloud Status</Label>
 <Select value={icloudStatus} onValueChange={(v) => setIcloudStatus(v as 'clean'|'locked')}>
 <SelectTrigger className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus:ring-0 text-[11px] font-medium "><SelectValue/></SelectTrigger>
 <SelectContent className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)]">
 <SelectItem value="clean" className="text-[10px] font-medium">Clean</SelectItem>
 <SelectItem value="locked" className="text-[10px] font-medium text-[var(--danger)]">Locked</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="grid grid-cols-2 gap-6">
 <div className="space-y-2">
 <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">Cost Price</Label>
 <Input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--success)] focus-visible:ring-0 text-[11px] font-bold" />
 </div>
 <div className="space-y-2">
 <Label className="text-[9px] font-bold text-[var(--accent)] ">Sale Price</Label>
 <Input type="number" value={targetSalePrice} onChange={(e) => setTargetSalePrice(e.target.value)} className="h-11 rounded-none bg-[var(--bg-app)] border-[var(--accent)]/40 text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:ring-0 text-[11px] font-bold underline decoration-[var(--accent)]/20" />
 </div>
 </div>
 </div>

 <div className="flex justify-end gap-4 pt-8 border-t border-[var(--line)] mt-10">
 <Button variant="ghost" onClick={handleClose} className="rounded-full h-12 px-8 text-[11px] font-bold text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--bg-app)] transition-all">Cancel</Button>
 <Button onClick={handleSubmit} className="bg-[var(--success)] hover:bg-[#008F5E] text-[var(--bg-app)] rounded-full h-12 px-10 text-[11px] font-medium shadow-2xl shadow-[var(--success)]/10 transition-all active:scale-95">
 Save Changes
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>
 );
}
