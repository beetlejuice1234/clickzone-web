import { LayoutDashboard, Package, ShoppingCart, ReceiptText, FileText, Users, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'quotations' | 'customers';

interface SidebarProps {
 activePage: Page;
 onNavigate: (page: Page) => void;
}

const menuItems: { id: Page; label: string; icon: typeof Package; ownerOnly?: boolean }[] = [
 { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
 { id: 'inventory', label: 'Inventory', icon: Package },
 { id: 'pos', label: 'Point of Sale', icon: ShoppingCart },
 { id: 'sales', label: 'Sales Log', icon: ReceiptText },
 { id: 'quotations', label: 'Quotations', icon: FileText },
 { id: 'customers', label: 'Customers', icon: Users, ownerOnly: true },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
 const { isAdmin, logout } = useAuth();

 return (
 <aside className="fixed left-0 top-0 h-screen w-60 bg-[var(--teal)] text-[var(--cream)] flex flex-col z-40">
 <div className="h-16 flex items-center px-6 border-b border-white/10">
 <span className="font-display text-2xl font-semibold text-[var(--cream)] tracking-tight">ClickZone</span>
 </div>

 <nav className="flex-1 px-3 py-6 space-y-1.5">
 <p className="px-4 mb-2 text-[10px] uppercase tracking-[0.15em] text-[var(--cream)]/45 font-semibold">Navigation</p>
 {menuItems.filter((item) => !item.ownerOnly || isAdmin).map((item) => {
 const isActive = activePage === item.id;
 return (
 <button
 key={item.id}
 onClick={() => onNavigate(item.id)}
 className={cn(
 'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-xl transition-all group',
 isActive
 ? 'bg-[var(--cream)] text-[var(--teal)] shadow-sm'
 : 'text-[var(--cream)]/70 hover:text-[var(--cream)] hover:bg-white/10'
 )}
 >
 <item.icon size={17} className={isActive ? 'text-[var(--teal)]' : 'text-[var(--cream)]/60 group-hover:text-[var(--cream)]'} />
 <span>{item.label}</span>
 </button>
 );
 })}
 </nav>

 <div className="p-4 space-y-3 mt-auto border-t border-white/10">
 <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 text-xs font-medium text-[var(--cream)]/80">
 <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--success)] shadow-[0_0_8px_var(--success)]" />
 <span>System Online</span>
 </div>

 <button
 onClick={logout}
 className="w-full group p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-3 transition-all"
 >
 <div className={cn(
 'w-8 h-8 rounded-lg flex items-center justify-center',
 isAdmin ? 'bg-[var(--cream)] text-[var(--teal)]' : 'bg-white/10 text-[var(--cream)]/70'
 )}>
 {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
 </div>
 <div className="flex-1 text-left min-w-0 pr-2">
 <p className="text-sm font-semibold text-[var(--cream)]">{isAdmin ? 'Owner' : 'Staff'}</p>
 <p className="text-xs text-[var(--cream)]/50">Sign out</p>
 </div>
 </button>
 </div>
 </aside>
 );
}
