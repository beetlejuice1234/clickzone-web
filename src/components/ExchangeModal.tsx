import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatLKR, MODEL_OPTIONS, IPAD_MODELS, WATCH_MODELS, STORAGE_OPTIONS, COLOR_OPTIONS } from '@/lib/utils';
import { usePhones } from '@/lib/api';
import { toast } from 'sonner';

export interface ExchangePayload {
  type: 'phone' | 'tablet' | 'watch' | 'accessory';
  tradeInDeviceType?: 'phone' | 'tablet' | 'watch';
  // Device trade-in
  tradeInImei?: string;
  tradeInSerialNumber?: string;
  tradeInModel: string;              // model OR accessory name (shown in the POS summary)
  tradeInStorage?: string;
  tradeInColor?: string;
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

const WATCH_SIZES = ['38mm', '40mm', '41mm', '42mm', '44mm', '45mm', '46mm', '49mm'] as const;

export default function ExchangeModal({ open, onClose, cartSubtotal, onConfirm }: ExchangeModalProps) {
  const { phones } = usePhones();

  const [type, setType] = useState<'phone' | 'tablet' | 'watch' | 'accessory'>('phone');

  // Device fields
  const [imei, setImei] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [model, setModel] = useState('');
  const [modelOther, setModelOther] = useState(false); // "Other" → free-text model (Android/etc.)
  const [condition, setCondition] = useState('');
  const [batteryHealth, setBatteryHealth] = useState('');
  const [storage, setStorage] = useState('');
  const [color, setColor] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerNic, setCustomerNic] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [valuation, setValuation] = useState('');
  const [targetSalePrice, setTargetSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [identifierWarning, setIdentifierWarning] = useState('');
  const [prevSoldBill, setPrevSoldBill] = useState('');

  // Accessory fields
  const [accName, setAccName] = useState('');
  const [accSku, setAccSku] = useState('');
  const [accQty, setAccQty] = useState('1');

  const numValuation = parseFloat(valuation) || 0;
  const netPayable = cartSubtotal - numValuation;

  // Auto-fill when IMEI or Serial matches an existing device in inventory
  useEffect(() => {
    if (type === 'accessory') {
      setIdentifierWarning('');
      setPrevSoldBill('');
      return;
    }

    let match = null;
    if (type === 'phone' && imei.length === 15) {
      match = phones.find(p => p.imei === imei);
    } else if ((type === 'tablet' || type === 'watch') && serialNumber.trim().length >= 4) {
      const q = serialNumber.trim().toLowerCase();
      match = phones.find(p => p.serialNumber && p.serialNumber.trim().toLowerCase() === q);
    }

    if (match) {
      setModel(match.model);
      const isKnownModel = (
        type === 'phone' ? (MODEL_OPTIONS as readonly string[]).includes(match.model)
        : type === 'tablet' ? (IPAD_MODELS as readonly string[]).includes(match.model)
        : (WATCH_MODELS as readonly string[]).includes(match.model)
      );
      setModelOther(!isKnownModel);
      if (match.condition) setCondition(match.condition);
      if (match.batteryHealth) setBatteryHealth(String(match.batteryHealth));
      if (match.storage) setStorage(match.storage);
      if (match.color) setColor(match.color);
      if (match.status === 'sold') {
        setPrevSoldBill(match.imei || match.serialNumber || 'sold');
        setIdentifierWarning(`⚠ This unit was previously sold from ClickZone. It will be re-ingested as a trade-in.`);
      } else if (match.status === 'in-stock') {
        setIdentifierWarning(`⚠ This unit is currently IN STOCK in your inventory. Cannot trade in an unsold unit.`);
      } else {
        setIdentifierWarning('');
        setPrevSoldBill('');
      }
    } else {
      setIdentifierWarning('');
      setPrevSoldBill('');
    }
  }, [imei, serialNumber, phones, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (numValuation < 0) { toast.error('Valuation cannot be negative'); return; }
    if (numValuation > cartSubtotal) { toast.error('Trade-in value exceeds cart total'); return; }

    if (type === 'accessory') {
      if (!accName.trim()) { toast.error('Accessory name is required'); return; }
      const qty = Math.max(1, parseInt(accQty) || 1);
      onConfirm({
        type: 'accessory',
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

    // Phone / Tablet / Watch trade-in
    if (type === 'phone') {
      if (!imei || !/^\d{15}$/.test(imei)) { toast.error('IMEI must be exactly 15 digits'); return; }
      const match = phones.find(p => p.imei === imei);
      if (match && match.status === 'in-stock') {
        toast.error('This IMEI is currently in stock — cannot trade in an unsold unit.');
        return;
      }
    } else {
      // Tablet or Watch requires Serial Number
      if (!serialNumber.trim()) {
        toast.error('Serial Number is required for iPad / Apple Watch');
        return;
      }
      const match = phones.find(p => p.serialNumber && p.serialNumber.trim().toLowerCase() === serialNumber.trim().toLowerCase());
      if (match && match.status === 'in-stock') {
        toast.error('This Serial Number is currently in stock — cannot trade in an unsold unit.');
        return;
      }
    }

    if (!model) { toast.error('Model is required'); return; }
    if (!condition) { toast.error('Condition is required'); return; }
    if (!customerName) { toast.error('Customer Name is required'); return; }
    if (!customerNic) { toast.error('Customer NIC is required'); return; }

    onConfirm({
      type,
      tradeInDeviceType: type,
      tradeInImei: imei.trim() || undefined,
      tradeInSerialNumber: serialNumber.trim() ? serialNumber.trim().toUpperCase() : undefined,
      tradeInModel: model,
      tradeInValuation: numValuation,
      tradeInCondition: condition,
      tradeInBatteryHealth: batteryHealth ? parseInt(batteryHealth) : undefined,
      tradeInTargetSalePrice: targetSalePrice ? parseInt(targetSalePrice) : undefined,
      tradeInStorage: storage || undefined,
      tradeInColor: color || undefined,
      tradeInNotes: notes,
      customerName,
      customerNic,
      customerWhatsapp,
    });
    handleClose();
  };

  const handleClose = () => {
    setType('phone');
    setImei(''); setSerialNumber(''); setModel(''); setModelOther(false); setCondition(''); setBatteryHealth('');
    setStorage(''); setColor('');
    setCustomerName(''); setCustomerNic(''); setCustomerWhatsapp('');
    setValuation(''); setTargetSalePrice(''); setNotes('');
    setIdentifierWarning(''); setPrevSoldBill('');
    setAccName(''); setAccSku(''); setAccQty('1');
    onClose();
  };

  const activeModels = (
    type === 'phone' ? MODEL_OPTIONS
    : type === 'tablet' ? IPAD_MODELS
    : WATCH_MODELS
  );

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-[640px] bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold uppercase tracking-widest text-[var(--ink)]">Add Trade-In</DialogTitle>
          <DialogDescription className="text-[10px] uppercase text-[var(--subtle)] tracking-widest font-bold">
            Customer Exchange Details · Phone, iPad, Watch or Accessory
          </DialogDescription>
        </DialogHeader>

        {/* Type toggle */}
        <div className="grid grid-cols-4 gap-2">
          {([
            { id: 'phone', label: 'Phone' },
            { id: 'tablet', label: 'iPad / Tablet' },
            { id: 'watch', label: 'Apple Watch' },
            { id: 'accessory', label: 'Accessory' },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setType(t.id); setModel(''); setModelOther(false); }}
              className={cn(
                'h-10 text-[10px] font-bold uppercase rounded-xl border-2 transition-all px-1',
                type === t.id
                  ? 'bg-[var(--terracotta)] text-white border-[var(--terracotta)]'
                  : 'bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--ink)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {type !== 'accessory' ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Primary Identifier */}
              {type === 'phone' ? (
                <div className="space-y-2 col-span-2">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Trade-In IMEI *</Label>
                  <Input
                    value={imei}
                    onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                    placeholder="15-digit IMEI (auto-fills if found in system)"
                    className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"
                  />
                  {identifierWarning && (
                    <p className={`text-[10px] font-bold px-2 py-1 rounded-xl border ${prevSoldBill ? 'text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/30' : 'text-[var(--danger)] bg-[var(--danger)]/5 border-[var(--danger)]/20'}`}>
                      {identifierWarning}
                    </p>
                  )}
                  {imei.length === 15 && !phones.find(p => p.imei === imei) && (
                    <p className="text-[10px] text-[var(--subtle)] font-bold">New IMEI — not in your system. Fill details manually.</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Serial Number *</Label>
                    <Input
                      value={serialNumber}
                      onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                      placeholder={type === 'watch' ? 'Apple Watch Serial Number' : 'iPad Serial Number'}
                      className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)] uppercase font-mono"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">IMEI (Optional / Cellular)</Label>
                    <Input
                      value={imei}
                      onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      placeholder="Optional for cellular units"
                      className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"
                    />
                  </div>
                  {identifierWarning && (
                    <p className={`col-span-2 text-[10px] font-bold px-2 py-1 rounded-xl border ${prevSoldBill ? 'text-[var(--warning)] bg-[var(--warning)]/10 border-[var(--warning)]/30' : 'text-[var(--danger)] bg-[var(--danger)]/5 border-[var(--danger)]/20'}`}>
                      {identifierWarning}
                    </p>
                  )}
                </>
              )}

              {/* Model */}
              <div className="space-y-2 col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Model *</Label>
                <Select
                  value={modelOther ? '__other__' : model}
                  onValueChange={(v) => { if (v === '__other__') { setModelOther(true); setModel(''); } else { setModelOther(false); setModel(v); } }}
                >
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]">
                    <SelectValue placeholder={`Select ${type === 'watch' ? 'Apple Watch' : type === 'tablet' ? 'iPad' : 'phone'} model`} />
                  </SelectTrigger>
                  <SelectContent position="popper" className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[300px]">
                    {activeModels.map(m => (
                      <SelectItem key={m} value={m} className="rounded-xl text-[10px] font-medium">{m}</SelectItem>
                    ))}
                    <SelectItem value="__other__" className="rounded-xl text-[10px] font-medium">Other (Specify model)…</SelectItem>
                  </SelectContent>
                </Select>
                {modelOther && (
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={type === 'watch' ? 'e.g. Apple Watch Hermès 45mm' : type === 'tablet' ? 'e.g. Samsung Galaxy Tab S9' : 'e.g. Samsung Galaxy S23'}
                    className="mt-2 bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"
                  />
                )}
              </div>

              {/* Condition & Battery */}
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

              {/* Storage or Watch Case Size */}
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">
                  {type === 'watch' ? 'Case Size / Spec' : 'Storage'}
                </Label>
                {type === 'watch' ? (
                  <Select value={storage} onValueChange={setStorage}>
                    <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"><SelectValue placeholder="Case size" /></SelectTrigger>
                    <SelectContent position="popper" className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[300px]">
                      {WATCH_SIZES.map(s => <SelectItem key={s} value={s} className="rounded-xl text-[10px] font-medium">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={storage} onValueChange={setStorage}>
                    <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"><SelectValue placeholder="Storage" /></SelectTrigger>
                    <SelectContent position="popper" className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[300px]">
                      {STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s} className="rounded-xl text-[10px] font-medium">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Colour */}
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Colour</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]"><SelectValue placeholder="Colour" /></SelectTrigger>
                  <SelectContent position="popper" className="bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[300px]">
                    {COLOR_OPTIONS.map(c => <SelectItem key={c} value={c} className="rounded-xl text-[10px] font-medium">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Info */}
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
