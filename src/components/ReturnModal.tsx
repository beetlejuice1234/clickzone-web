import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { formatLKR, cn } from '@/lib/utils';
import { returnItem, usePhones } from '@/lib/api';
import type { SaleRecord } from '@/types';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleRecord | null;
  onSuccess: () => void;
}

type ReturnMode = 'exchange' | 'refund';
// The customer rarely wants cash — the balance is almost always settled against another device.
// So device-swap ("exchange") is the default path; a straight refund is the exception.
type Direction = 'store-credit' | 'refunded' | 'zeroed' | 'customer-paid';

const DIRECTION_LABEL: Record<Direction, string> = {
  'store-credit': 'Store credit (customer keeps balance here)',
  'refunded': 'Cash refund (pay difference from drawer)',
  'zeroed': 'Zeroed / goodwill (shop keeps the balance)',
  'customer-paid': 'Customer pays the extra',
};

export function ReturnModal({ isOpen, onClose, sale, onSuccess }: ReturnModalProps) {
  const { phones } = usePhones();
  const [mode, setMode] = useState<ReturnMode>('exchange');
  const [selectedItemIdx, setSelectedItemIdx] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [condition, setCondition] = useState<string>("");

  // refund-mode fields
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [restock, setRestock] = useState<boolean>(true);

  // exchange-mode fields
  const [replacementImei, setReplacementImei] = useState<string>("");
  const [replacementValue, setReplacementValue] = useState<string>("");
  const [direction, setDirection] = useState<Direction>('store-credit');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnedItem = selectedItemIdx === "" ? null : sale?.items[parseInt(selectedItemIdx)] ?? null;
  const returnedValue = returnedItem?.finalPrice ?? 0;

  // Active stock the customer can swap into (exclude the phone being returned).
  const availablePhones = useMemo(
    () => phones.filter(p => p.status === 'in-stock' && p.imei && p.imei !== returnedItem?.identifier),
    [phones, returnedItem]
  );
  const replPhone = availablePhones.find(p => p.imei === replacementImei) ?? null;
  const replValue = replacementValue !== "" ? Number(replacementValue) : (replPhone?.targetSalePrice ?? 0);
  const delta = returnedValue - replValue; // > 0 customer is owed; < 0 customer owes

  // Which settlement directions make sense for the current price gap.
  const allowedDirections: Direction[] = useMemo(() => {
    if (delta < 0) return ['customer-paid'];
    if (delta > 0) return ['store-credit', 'refunded', 'zeroed'];
    return ['store-credit', 'zeroed'];
  }, [delta]);
  const effectiveDirection: Direction = allowedDirections.includes(direction) ? direction : allowedDirections[0];

  if (!sale) return null;

  const selectReplacement = (imei: string) => {
    setReplacementImei(imei);
    const p = availablePhones.find(x => x.imei === imei);
    setReplacementValue(p?.targetSalePrice ? String(p.targetSalePrice) : "");
  };

  const resetAndClose = () => {
    setMode('exchange'); setSelectedItemIdx(""); setReason(""); setCondition("");
    setRefundAmount(""); setRefundMethod("cash"); setRestock(true);
    setReplacementImei(""); setReplacementValue(""); setDirection('store-credit');
    onClose();
  };

  const submitRefund = async () => {
    if (selectedItemIdx === "" || !refundAmount || !reason || !condition) {
      toast.error("Please fill all required fields");
      return;
    }
    const item = sale.items[parseInt(selectedItemIdx)];
    setIsSubmitting(true);
    try {
      await returnItem({
        original_sale_id: sale.id,
        return_type: 'return',
        item_type: item.type,
        identifier: item.identifier,
        quantity: item.quantity || 1,
        refund_amount: parseFloat(refundAmount),
        reason,
        condition_on_return: condition,
        refund_method: refundMethod,
        restock,
      });
      toast.success("Refund processed");
      onSuccess();
      resetAndClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Return failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitExchange = async () => {
    if (selectedItemIdx === "" || !reason || !condition) {
      toast.error("Please fill all required fields");
      return;
    }
    if (returnedItem?.type !== 'phone') {
      toast.error("Device exchange applies to a phone line only");
      return;
    }
    if (!replacementImei) {
      toast.error("Pick the replacement phone the customer takes");
      return;
    }
    // Cash refund is the rare exception — make it deliberate.
    if (effectiveDirection === 'refunded'
      && !window.confirm(`Pay ${formatLKR(Math.max(delta, 0))} cash from the drawer to the customer?`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await returnItem({
        original_sale_id: sale.id,
        return_type: 'trade-in-return',
        item_type: 'phone',
        identifier: returnedItem.identifier,
        replacement_identifier: replacementImei,
        replacement_value: replValue,
        difference_direction: effectiveDirection,
        reason,
        condition_on_return: condition,
        customer_whatsapp: sale.customerWhatsapp || undefined,
      });
      toast.success(`Exchange done · ${res.difference_direction} ${formatLKR(Math.abs(res.delta ?? 0))}`);
      onSuccess();
      resetAndClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exchange failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-[460px] bg-[var(--paper)] border-[var(--line)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--ink)]">Process Return</DialogTitle>
          <p className="text-[10px] text-[var(--subtle)]">Bill ID: {sale.billId}</p>
        </DialogHeader>

        {/* Mode toggle — device swap is the default, cash refund is the exception */}
        <div className="grid grid-cols-2 gap-2">
          {(['exchange', 'refund'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-3 py-2 text-[10px] font-bold uppercase rounded-xl border transition-all",
                mode === m
                  ? "bg-[var(--brand)] text-[var(--bg-app)] border-[var(--brand)]"
                  : "bg-[var(--bg-app)] text-[var(--subtle)] border-[var(--line)] hover:border-[var(--ink)]"
              )}
            >
              {m === 'exchange' ? 'Exchange for device' : 'Cash / refund'}
            </button>
          ))}
        </div>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[var(--subtle)]">
              {mode === 'exchange' ? 'Phone being returned' : 'Select item'}
            </Label>
            <Select value={selectedItemIdx} onValueChange={setSelectedItemIdx}>
              <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                <SelectValue placeholder="Select an item to return" />
              </SelectTrigger>
              <SelectContent>
                {sale.items.map((item, idx) => (
                  <SelectItem key={idx} value={String(idx)} disabled={mode === 'exchange' && item.type !== 'phone'}>
                    {item.name} ({item.identifier}) - {formatLKR(item.finalPrice)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === 'refund' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-[var(--subtle)]">Refund Amount (LKR)</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="bg-[var(--bg-app)] border-[var(--line)]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-[var(--subtle)]">Refund Method</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="credit">Store Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold text-[var(--subtle)]">Replacement phone (from stock)</Label>
                <Select value={replacementImei} onValueChange={selectReplacement}>
                  <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                    <SelectValue placeholder={availablePhones.length ? "Pick the phone the customer takes" : "No in-stock phones available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePhones.map(p => (
                      <SelectItem key={p.id} value={p.imei}>
                        {p.model} ({p.imei}) - {formatLKR(p.targetSalePrice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-[var(--subtle)]">Returned value</Label>
                  <div className="h-10 flex items-center px-3 border border-[var(--line)] bg-[var(--bg-app)] text-[11px] font-bold text-[var(--ink)]">
                    {formatLKR(returnedValue)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold text-[var(--subtle)]">Replacement value (LKR)</Label>
                  <Input
                    type="number"
                    value={replacementValue}
                    onChange={(e) => setReplacementValue(e.target.value)}
                    placeholder="e.g. 45000"
                    className="bg-[var(--bg-app)] border-[var(--line)]"
                  />
                </div>
              </div>

              {/* Price gap + where the leftover goes */}
              <div className="border border-[var(--line)] bg-[var(--bg-app)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--subtle)]">Difference</span>
                  <span className={cn("text-sm font-bold", delta > 0 ? "text-[var(--success)]" : delta < 0 ? "text-[var(--danger)]" : "text-[var(--ink)]")}>
                    {delta > 0 ? 'Owe customer ' : delta < 0 ? 'Customer owes ' : 'Even '}{formatLKR(Math.abs(delta))}
                  </span>
                </div>
                <Select value={effectiveDirection} onValueChange={(v) => setDirection(v as Direction)}>
                  <SelectTrigger className="bg-[var(--paper)] border-[var(--line)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedDirections.map(d => (
                      <SelectItem key={d} value={d}>{DIRECTION_LABEL[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[var(--subtle)]">Return Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                <SelectValue placeholder="Why is it being returned?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="defective">Defective / Faulty</SelectItem>
                <SelectItem value="wrong_item">Wrong Item Sent</SelectItem>
                <SelectItem value="customer_change">Customer Changed Mind</SelectItem>
                <SelectItem value="damaged_shipping">Damaged in Shipping</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[var(--subtle)]">
              {mode === 'exchange' ? 'Returned phone condition' : 'Item Condition'}
            </Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                <SelectValue placeholder="Current condition of item" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sealed">Still Sealed</SelectItem>
                <SelectItem value="open-box">Open Box (Like New)</SelectItem>
                <SelectItem value="used-excellent">Used (Excellent)</SelectItem>
                <SelectItem value="used-fair">Used (Fair)</SelectItem>
                <SelectItem value="damaged">Damaged / Non-functional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'refund' && (
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="restock"
                checked={restock}
                onCheckedChange={(checked) => setRestock(checked as boolean)}
              />
              <Label htmlFor="restock" className="text-[10px] font-bold text-[var(--ink)] cursor-pointer">
                Restock item to inventory?
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={resetAndClose}
            className="text-[10px] font-bold border border-[var(--line)]"
          >
            Cancel
          </Button>
          <Button
            onClick={mode === 'exchange' ? submitExchange : submitRefund}
            disabled={isSubmitting}
            className="bg-[var(--terracotta)] hover:bg-[var(--terracotta-hover)] text-white text-[10px] font-bold"
          >
            {isSubmitting ? "Processing..." : mode === 'exchange' ? "Confirm Exchange" : "Confirm Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
