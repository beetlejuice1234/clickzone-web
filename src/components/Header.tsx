import { Plus, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useStores } from '@/lib/api';
import { useStoreScope } from '@/lib/store';

interface HeaderProps {
 onAddNew: () => void;
 title: string;
 showAddButton?: boolean;
}

export default function Header({
 onAddNew,
 title,
 showAddButton = true,
}: HeaderProps) {
 const { isAdmin } = useAuth();
 const { stores } = useStores();
 const activeStoreId = useStoreScope((s) => s.activeStoreId);
 const setActiveStore = useStoreScope((s) => s.setActiveStore);

 return (
 <header className="h-16 bg-[var(--bg-app)]/90 backdrop-blur border-b border-[var(--line)] flex items-center justify-between px-8 sticky top-0 z-30">
 <h1 className="font-display text-2xl font-semibold text-[var(--teal)]">
 {title}
 </h1>

 <div className="flex items-center gap-3">
 {/* Owner-only store switcher — staff are pinned to their store by the DB views. */}
 {isAdmin && (
 <div className="flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl bg-[var(--paper)] border border-[var(--line)]">
 <Store size={14} className="text-[var(--subtle)]" />
 <select
 value={activeStoreId ?? '__all__'}
 onChange={(e) => setActiveStore(e.target.value === '__all__' ? null : e.target.value)}
 className="h-full bg-transparent text-[var(--ink)] text-[11px] font-semibold pr-1 focus:outline-none cursor-pointer"
 aria-label="Active store"
 >
 <option value="__all__">All Stores</option>
 {stores.map((s: { id: string; name: string }) => (
 <option key={s.id} value={s.id}>{s.name}</option>
 ))}
 </select>
 </div>
 )}

 {showAddButton && (
 <button
 onClick={onAddNew}
 className="h-9 px-5 rounded-xl bg-[var(--teal)] text-[var(--cream)] text-[11px] font-semibold flex items-center gap-2 hover:brightness-110 transition-all shadow-sm"
 >
 <Plus size={16} />
 Add Stock
 </button>
 )}
 </div>
 </header>
 );
}
