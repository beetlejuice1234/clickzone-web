import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useStores, setStoreNextBillNo, reloadData } from '@/lib/api';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type StoreRow = { id: string; name: string; next_bill_no: number | null };

// Owner-only settings. Currently: the sequential invoice-number start per store.
// Set a number → the next sale uses it and every sale after increments. Blank → auto ids (CZ-…).
export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { stores } = useStores();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string> = {};
    (stores as StoreRow[]).forEach((s) => { init[s.id] = s.next_bill_no != null ? String(s.next_bill_no) : ''; });
    setValues(init);
  }, [open, stores]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const s of stores as StoreRow[]) {
        const raw = (values[s.id] ?? '').trim();
        const next = raw === '' ? null : parseInt(raw, 10);
        if (raw !== '' && (isNaN(next as number) || (next as number) < 0)) {
          toast.error(`Invalid number for ${s.name}`);
          setSaving(false);
          return;
        }
        const current = s.next_bill_no ?? null;
        if (next !== current) await setStoreNextBillNo(s.id, next);
      }
      reloadData();
      toast.success('Invoice settings saved');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-[var(--paper)] border border-[var(--line)] p-0 overflow-hidden rounded-xl">
        <div className="bg-[var(--bg-app)] px-8 pt-8 pb-6 border-b border-[var(--line)]">
          <DialogHeader>
            <DialogTitle className="text-3xl text-[var(--ink)]">Settings</DialogTitle>
            <p className="text-sm text-[var(--subtle)] mt-1.5">Set the next invoice number for each store</p>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6">
          {(stores as StoreRow[]).map((s) => (
            <div key={s.id} className="space-y-2">
              <Label className="text-[13px] font-medium text-[var(--ink)] mb-2 block">{s.name} — next invoice #</Label>
              <Input
                type="number"
                min="0"
                value={values[s.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [s.id]: e.target.value }))}
                placeholder="e.g. 1000 (blank = automatic)"
                className="h-11 rounded-xl bg-[var(--bg-app)] border-[var(--line)] text-[var(--ink)] focus-visible:border-[var(--brand)] focus-visible:ring-0 text-[11px] font-bold"
              />
            </div>
          ))}
          <p className="text-[10px] text-[var(--subtle)]">
            The next sale uses this number, then it increments automatically for every sale after. Leave blank to
            use automatic reference ids.
          </p>

          <div className="flex justify-end gap-4 pt-6 border-t border-[var(--line)]">
            <Button variant="ghost" onClick={onClose} className="rounded-xl h-12 px-8 text-[11px] font-bold text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--bg-app)] transition-all">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[var(--terracotta)] hover:bg-[var(--terracotta-hover)] text-white rounded-xl h-12 px-10 text-[11px] font-medium transition-all active:scale-95">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
