import { Plus, Sun, Moon, Store } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
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
 const { theme, toggleTheme } = useTheme();
 const { isAdmin } = useAuth();
 const { stores } = useStores();
 const activeStoreId = useStoreScope((s) => s.activeStoreId);
 const setActiveStore = useStoreScope((s) => s.setActiveStore);

 return (
 <header className="h-16 bg-[var(--bg-app)] border-b border-[var(--line)] flex items-center justify-between px-8 sticky top-0 z-30">
 <div className="flex items-center gap-8">
 <h1 className="text-2xl font-bold text-[var(--brand)]">
 {title}
 </h1>
 </div>

 <div className="flex items-center gap-4">
 {/* Owner-only store switcher — staff are pinned to their store by the DB views. */}
 {isAdmin && (
 <div className="flex items-center gap-2">
 <Store size={14} className="text-[var(--subtle)]" />
 <select
 value={activeStoreId ?? '__all__'}
 onChange={(e) => setActiveStore(e.target.value === '__all__' ? null : e.target.value)}
 className="h-9 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] text-[11px] font-medium px-2 pr-3 focus:outline-none focus:border-[var(--brand)] cursor-pointer"
 aria-label="Active store"
 >
 <option value="__all__">All Stores</option>
 {stores.map((s: { id: string; name: string }) => (
 <option key={s.id} value={s.id}>{s.name}</option>
 ))}
 </select>
 </div>
 )}

 <button
 onClick={toggleTheme}
 className="h-9 w-9 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] flex items-center justify-center hover:bg-[var(--line)] transition-all"
 >
 {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
 </button>

  {showAddButton && (
 <button
 onClick={onAddNew}
 className="h-9 px-5 bg-[var(--brand)] text-[var(--bg-app)] text-[11px] font-medium flex items-center gap-2 hover:bg-[var(--ink)]"
 >
 <Plus size={16} />
 Add Stock
 </button>
 )}
 </div>
 </header>
 );
}
