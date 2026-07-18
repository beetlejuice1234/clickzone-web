import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn, formatLKR } from '@/lib/utils';
import { toast } from 'sonner';

export interface RepairPayload {
  description: string;
  cost: string;   // parts cost (string, like the POS price inputs)
  price: string;  // selling price
}

interface RepairModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (repair: RepairPayload) => void;
}

// Common repairs — clicking one fills the description (still editable).
const PRESETS = ['Screen replacement', 'Battery replacement', 'Charging port', 'Software / OS', 'Water damage'];

export default function RepairModal({ open, onClose, onAdd }: RepairModalProps) {
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');

  const numCost = parseFloat(cost) || 0;
  const numPrice = parseFloat(price) || 0;

  const handleClose = () => {
    setDescription(''); setCost(''); setPrice('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) { toast.error('Describe the repair'); return; }
    if (numPrice <= 0) { toast.error('Enter a selling price'); return; }
    if (numCost < 0) { toast.error('Cost cannot be negative'); return; }
    onAdd({ description: description.trim(), cost, price });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[520px] bg-[var(--paper)] border-[var(--line)] rounded-xl text-[var(--ink)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold uppercase tracking-widest text-[var(--ink)]">Add Repair</DialogTitle>
          <DialogDescription className="text-[10px] uppercase text-[var(--subtle)] tracking-widest font-bold">
            Service line — added to the same invoice
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick picks */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDescription(p)}
                className={cn(
                  'px-3 py-1.5 text-[10px] font-bold uppercase rounded-xl border transition-all',
                  description === p
                    ? 'bg-[var(--terracotta)] text-white border-[var(--terracotta)]'
                    : 'bg-[var(--paper)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--ink)]'
                )}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. iPhone 12 screen replacement"
              className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)] min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Cost Price (parts)</Label>
              <Input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0"
                className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-[var(--subtle)]">Selling Price *</Label>
              <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                className="bg-[var(--bg-app)] border-[var(--line)] rounded-xl text-[var(--ink)]" />
            </div>
          </div>

          {numPrice > 0 && (
            <p className="text-[9px] text-[var(--success)] font-bold text-right">
              Profit on this repair: {formatLKR(Math.max(0, numPrice - numCost))}
            </p>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={handleClose}
              className="bg-[var(--paper)] border-[var(--line)] text-[var(--ink)] rounded-xl hover:bg-[var(--bg-app)]">
              CANCEL
            </Button>
            <Button type="submit" className="bg-[var(--terracotta)] text-white rounded-xl hover:bg-[var(--terracotta-hover)]">
              ADD TO CART
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
