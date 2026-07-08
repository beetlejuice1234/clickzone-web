import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatLKR, MODEL_OPTIONS } from '@/lib/utils';
import { usePhones } from '@/lib/api';
import { toast } from 'sonner';

export interface ExchangePayload {
  type: 'phone' | 'accessory';
  // Phone trade-in
  tradeInImei: string;
  tradeInModel: string;              // phone model OR accessory name (shown in the POS summary)
  tradeInValuation: number;
  tradeInCondition: string;
  tradeInBatteryHealth?: number;
  tradeInTargetSalePrice?: number;
  tradeInNotes?: string;
  customerName: string;
  customerNic: string;
  customerWhatsapp?: string;
  // Accessory trade-in
  tradeInSku?: string;               // optional; blank → a TRADEIN-xxxx sku is generated server-side
  tradeInQuantity?: number;
}

interface ExchangeModalProps {
  open: boolean;
  onClose: () => void;
  cartSubtotal: number;
  onConfirm: (exchange: ExchangePayload) => void;
}

export default function ExchangeModal({ open, onClose, cartSubtotal, onConfirm }: ExchangeModalProps) {
  const { phones } = usePhones();

  const [type, setType] = useState<'phone' | 'accessory'>('phone');

  // Phone fields
  const [imei, setImei] = useState('');
  const [model, setModel] = useState('');
  const [modelOther, setModelOther] = useState(false); // "Other" → free-text model (Android/etc.)
  const [condition, setCondition] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerNic, setCustomerNic] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [valuation, setValuation] = useState('');
  const [targetSalePrice, setTargetSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [imeiWarning, setImeiWarning] = useState('');
  const [prevSoldBill, setPrevSoldBill] = useState('');

  // Accessory fields
  const [accName, setAccName] = useState('');
  const [accSku, setAccSku] = useState('');
  const [accQty, setAccQty] = useState('1');

  const numValuation = parseFloat(valuation) || 0;
  const netPayable = cartSubtotal - numValuation;

  // Auto-fill when IMEI matches an existing phone in inventory (phone mode only)
  useEffect(() => {
    if (type !== 'phone' || imei.length !== 15) {
      setImeiWarning('');
      setPrevSoldBill('');
      return;
    }
    const match = phones.find(p => p.imei === imei);
    if (match) {
      setModel(match.model);
      setModelOther(!(MODEL_OPTIONS as readonly string[]).includes(match.model));
      if (match.condition) setCondition(match.condition);
      if (match.batteryHealth) setBatteryHealth(String(match.batteryHealth));
      if (match.status === 'sold') {
        setPrevSoldBill(match.imei);
        setImeiWarning(`⚠ This phone was previously sold from ClickZone. It will be re-ingested as a trade-in.`);
      } else if (match.status === 'in-stock') {
        setImeiWarning(`⚠ This IMEI is currently IN STOCK in your inventory. Cannot trade in an unsold unit.`);
      } else {
        setImeiWarning('');
        setPrevSoldBill('');
      }
    } else {
      setImeiWarning('');
      setPrevSoldBill('');
    }
  }, [imei, phones, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (numValuation < 0) { toast.error('Valuation cannot be negative'); return; }
    if (numValuation > cartSubtotal) { toast.error('Trade-in value exceeds cart total'); return; }

    if (type === 'accessory') {
      if (!accName.trim()) { toast.error('Accessory name is required'); return; }
      const qty = Math.max(1, parseInt(accQty) || 1);
      onConfirm({
        type: 'accessory',
        tradeInImei: '',
        tradeInModel: accName.trim(),
        tradeInValuation: numValuation,
        tradeInCondition: condition,
        tradeInTargetSalePrice: targetSalePrice ? parseInt(targetSalePrice) : undefined,
        tradeInNotes: notes,
        customerName,
        customerNic,
        customerWhatsapp,
        tradeInSku: accSku.trim() ? accSku.trim().toUpperCase() : undefined,
        tradeInQuantity: qty,
      });
      handleClose();
      return;
    }

    // Phone trade-in
    if (!imei || !/^\d{15}$/.test(imei)) { toast.error('IMEI must be exactly 15 digits'); return; }
    const match = phones.find(p => p.imei === imei);
    if (match && match.status === 'in-stock') {
      toast.error('This IMEI is currently in stock — cannot trade in an unsold unit.');
      return;
    }
    if (!model) { toast.error('Model is required'); return; }
    if (!condition) { toast.error('Condition is required'); return; }
    if (!customerName) { toast.error('Customer Name is required'); return; }
    if (!customerNic) { toast.error('Customer NIC is required'); return; }

    onConfirm({
      type: 'phone',
      tradeInImei: imei,
      tradeInModel: model,
      tradeInValuation: numValuation,
      tradeInCondition: condition,
      tradeInBatteryHealth: batteryHealth ? parseInt(batteryHealth) : undefined,
      tradeInTargetSalePrice: targetSalePrice ? parseInt(targetSalePrice) : undefined,
      tradeInNotes: notes,
      customerName,
      customerNic,
      customerWhatsapp,
    });
    handleClose();
  };

  const handleClose = () => {
    setType('phone');
    setImei(''); setModel(''); setModelOther(false); setCondition(''); setBatteryHealth('');
    setCustomerName(''); setCustomerNic(''); setCustomerWhatsapp('');
    setValuation(''); setTargetSalePrice(''); setNotes('');
    setImeiWarning(''); setPrevSoldBill('');
    setAccName(''); setAccSku(''); setAccQty('1');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-[620px] bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold uppercase tracking-widest text-[var(--ink)]">Add Trade-In</DialogTitle>
          <DialogDescription className="text-[10px] uppercase text-[var(--subtle)] tracking-widest font-bold">
            Customer Exchange Details
          </DialogDescription>
        </DialogHeader>

        {/* Type toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(['phone', 'accessory'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'h-10 text-[11px] font-bold uppercase rounded-xl border-2 transition-all',
                type === t
                  ? 'bg-[var(--terracotta)] text-white border-[var(--terracotta)]'
                  : 'bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--ink)]'
              )}
            >
              {t === 'phone' ? 'Phone' : 'Accessory'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type === 'phone' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Trade-In IMEI *</Label>
                <Input
                  value={imei}
                  onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  placeholder="15-digit IMEI (auto-fills if found in system)"
                  className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"
                />
                {imeiWarning && (
                  <p className={`text-[10px] font-bold px-2 py-1 rounded-xl border ${prevSoldBill ? 'text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/30' : 'text-[var(--danger)] bg-[var(--danger)]/5 border-[var(--danger)]/20'}`}>
                    {imeiWarning}
                  </p>
                )}
                {imei.length === 15 && !phones.find(p => p.imei === imei) && (
                  <p className="text-[10px] text-[var(--subtle)] font-bold">New IMEI — not in your system. Fill details manually.</p>
                )}
              </div>

              <div className="space-y-2 col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Model *</Label>
                <Select
                  value={modelOther ? '__other__' : model}
                  onValueChange={(v) => { if (v === '__other__') { setModelOther(true); setModel(''); } else { setModelOther(false); setModel(v); } }}
                >
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[300px]">
                    {MODEL_OPTIONS.map(m => (
                      <SelectItem key={m} value={m} className="rounded-xl text-[10px] font-medium">{m}</SelectItem>
                    ))}
                    <SelectItem value="__other__" className="rounded-xl text-[10px] font-medium">Other (Android / specify)…</SelectItem>
                  </SelectContent>
                </Select>
                {modelOther && (
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. Samsung Galaxy S23"
                    className="mt-2 bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Condition *</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)]">
                    <SelectItem value="excellent" className="rounded-xl">Excellent</SelectItem>
                    <SelectItem value="good" className="rounded-xl">Good</SelectItem>
                    <SelectItem value="fair" className="rounded-xl">Fair</SelectItem>
                    <SelectItem value="poor" className="rounded-xl">Poor</SelectItem>
                    <SelectItem value="parts-only" className="rounded-xl">Parts Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Battery Health %</Label>
                <Input type="number" min="0" max="100" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} placeholder="%" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Customer Name *</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Doe" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Customer NIC * <span className="text-[var(--danger)]">(Legal Req.)</span></Label>
                <Input value={customerNic} onChange={(e) => setCustomerNic(e.target.value)} placeholder="NIC Number" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">WhatsApp</Label>
                <Input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} placeholder="Optional" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Valuation (LKR) *</Label>
                <Input type="number" min="0" value={valuation} onChange={(e) => setValuation(e.target.value)} placeholder="0" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Resale Price (LKR)</Label>
                <Input type="number" min="0" value={targetSalePrice} onChange={(e) => setTargetSalePrice(e.target.value)} placeholder="What you plan to sell it for" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
                {targetSalePrice && numValuation > 0 && (
                  <p className="text-[9px] text-[var(--success)] font-bold">Potential Profit: {formatLKR(parseInt(targetSalePrice) - numValuation)}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Accessory Name *</Label>
                <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. LITO USB-C Cable" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">SKU</Label>
                <Input value={accSku} onChange={(e) => setAccSku(e.target.value)} placeholder="Optional — match to stack qty" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
                <p className="text-[9px] text-[var(--subtle)] font-bold">If it matches an existing SKU, stock is increased. Blank = new item.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Quantity</Label>
                <Input type="number" min="1" value={accQty} onChange={(e) => setAccQty(e.target.value)} className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Valuation (LKR) *</Label>
                <Input type="number" min="0" value={valuation} onChange={(e) => setValuation(e.target.value)} placeholder="0" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Condition</Label>
                <Input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Optional" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Customer Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">WhatsApp</Label>
                <Input value={customerWhatsapp} onChange={(e) => setCustomerWhatsapp(e.target.value)} placeholder="Optional" className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional details..." className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)] min-h-[60px]" />
          </div>

          {/* Net Payable Preview */}
          <div className="bg-[var(--bg-app)] border border-[var(--line)] p-3 space-y-1">
            <div className="flex justify-between text-[11px] text-[var(--subtle)]">
              <span>Cart Subtotal:</span>
              <span>{formatLKR(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-[var(--danger)]">
              <span>Trade-in Value:</span>
              <span>-{formatLKR(numValuation)}</span>
            </div>
            <div className="border-t border-[var(--line)] my-1"></div>
            <div className="flex justify-between font-bold">
              <span className="text-[var(--ink)] text-[11px]">Net Payable:</span>
              <span className={`text-sm ${netPayable < 0 ? 'text-[var(--danger)]' : 'text-[var(--brand)]'}`}>
                {formatLKR(Math.max(0, netPayable))}
              </span>
            </div>
            {netPayable < 0 && (
              <p className="text-[10px] text-[var(--danger)] font-bold uppercase tracking-widest text-right">
                Trade-in value exceeds cart total
              </p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={handleClose} className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl hover:bg-[var(--bg-app)]">
              CANCEL
            </Button>
            <Button type="submit" className="bg-[var(--terracotta)] text-white rounded-xl hover:bg-[var(--terracotta-hover)]">
              CONFIRM EXCHANGE
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
