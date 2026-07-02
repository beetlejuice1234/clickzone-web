import { useState } from 'react';
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
import { formatLKR } from '@/lib/utils';
import { returnItem } from '@/lib/api';
import type { SaleRecord, SaleItem } from '@/types';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: SaleRecord | null;
  onSuccess: () => void;
}

export function ReturnModal({ isOpen, onClose, sale, onSuccess }: ReturnModalProps) {
  const [selectedItemIdx, setSelectedItemIdx] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [refundMethod, setRefundMethod] = useState<string>("cash");
  const [restock, setRestock] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!sale) return null;

  const handleSubmit = async () => {
    if (selectedItemIdx === "" || !refundAmount || !reason || !condition) {
      toast.error("Please fill all required fields");
      return;
    }

    const item = sale.items[parseInt(selectedItemIdx)];
    
    setIsSubmitting(true);
    try {
      await returnItem({
        original_sale_id: sale.id,
        item_type: item.type,
        identifier: item.identifier,
        quantity: item.quantity || 1,
        refund_amount: parseFloat(refundAmount),
        reason,
        condition_on_return: condition,
        refund_method: refundMethod,
        restock,
        return_type: 'return',
      });

      toast.success("Return processed successfully");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Return failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-[var(--paper)] border-[var(--line)]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-[var(--ink)]">Process Return</DialogTitle>
          <p className="text-[10px] text-[var(--subtle)]">Bill ID: {sale.billId}</p>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-[var(--subtle)]">Select Item</Label>
            <Select value={selectedItemIdx} onValueChange={setSelectedItemIdx}>
              <SelectTrigger className="bg-[var(--bg-app)] border-[var(--line)]">
                <SelectValue placeholder="Select an item to return" />
              </SelectTrigger>
              <SelectContent>
                {sale.items.map((item, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {item.name} ({item.identifier}) - {formatLKR(item.finalPrice)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label className="text-[10px] font-bold text-[var(--subtle)]">Item Condition</Label>
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
        </div>

        <DialogFooter>
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-[10px] font-bold border border-[var(--line)]"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[var(--accent)] text-white text-[10px] font-bold"
          >
            {isSubmitting ? "Processing..." : "Confirm Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
