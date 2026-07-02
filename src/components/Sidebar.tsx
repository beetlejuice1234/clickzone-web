import { LayoutDashboard, Package, ShoppingCart, ReceiptText, Users, Loader2, Lock, Unlock, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'customers';

interface SidebarProps {
 activePage: Page;
 onNavigate: (page: Page) => void;
}

const menuItems: { id: Page; label: string; icon: typeof Package; ownerOnly?: boolean }[] = [
 { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
 { id: 'inventory', label: 'Inventory', icon: Package },
 { id: 'pos', label: 'Point of Sale', icon: ShoppingCart },
 { id: 'sales', label: 'Sales Log', icon: ReceiptText },
 { id: 'customers', label: 'Customers', icon: Users, ownerOnly: true },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
 // Sync engine removed in the web rebuild (Supabase is the single source of truth).
 // Keep a static "online" indicator; live status can return in a later phase. TODO(Phase 6+).
 const syncStatus: 'idle' | 'syncing' | 'error' | 'offline' = 'idle';
 const { isAdmin, logout } = useAuth();
 const { theme, toggleTheme } = useTheme();
 
 return (
 <aside className="fixed left-0 top-0 h-screen w-60 bg-[var(--bg-app)] border-r border-[var(--line)] flex flex-col z-40">
 <div className="h-16 flex items-center px-6 border-b border-[var(--line)]">
 <div className="flex items-center gap-3">
 <img src="/logo.jpeg" alt="ClickZone" className="h-10 w-auto object-contain" />
 <span className="text-xl font-bold text-[var(--ink)] tracking-tight">ClickZone</span>
 </div>
 </div>

 <nav className="flex-1 px-3 py-6 space-y-1">
 <p className="px-4 mb-2 text-xs text-[var(--subtle)] font-medium">Navigation</p>
 {menuItems.filter((item) => !item.ownerOnly || isAdmin).map((item) => {
 const isActive = activePage === item.id;
 return (
 <button
 key={item.id}
 onClick={() => onNavigate(item.id)}
 className={cn(
 'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-none group relative border',
 isActive
 ? 'bg-[var(--paper)] text-[var(--ink)] border-[var(--line)]'
 : 'text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--paper)] border-transparent'
 )}
 >
 <item.icon size={16} className={isActive ? 'text-[var(--ink)]' : 'text-[var(--subtle)] group-hover:text-[var(--ink)]'} />
 <span>{item.label}</span>
 </button>
 );
 })}
 </nav>

 <div className="p-4 space-y-3 mt-auto border-t border-[var(--line)] bg-[var(--bg-app)]">
 <div className={cn(
 'flex items-center gap-2 px-3 py-2 border border-[var(--line)] text-xs font-medium bg-[var(--paper)]',
 syncStatus === 'idle' && 'text-[var(--success)]',
 syncStatus === 'syncing' && 'text-[var(--accent)]',
 syncStatus === 'error' && 'text-[var(--danger)]',
 syncStatus === 'offline' && 'text-[var(--subtle)]',
 )}>
 {syncStatus === 'syncing' && <Loader2 size={12} className="animate-spin" />}
 <div className={cn("w-1.5 h-1.5 shrink-0", 
 syncStatus === 'idle' ? "bg-[var(--success)]" :
 syncStatus === 'syncing' ? "bg-[var(--accent)]" :
 syncStatus === 'error' ? "bg-[var(--danger)]" : "bg-[var(--subtle)]"
 )} />
 <span>
 {syncStatus === 'idle' && 'System Online'}
 {syncStatus === 'syncing' && 'Syncing...'}
 {syncStatus === 'error' && 'Sync Error'}
 {syncStatus === 'offline' && 'Offline'}
 </span>
 </div>

 <button
 onClick={toggleTheme}
 className="w-full mb-3 flex items-center gap-3 px-3 py-2 text-[10px] font-bold text-[var(--subtle)] hover:text-[var(--ink)] hover:bg-[var(--line)] border border-[var(--line)] transition-all"
 >
 {theme === 'dark' ? (
 <>
 <Sun size={14} className="text-[var(--accent)]" />
 <span>LIGHT MODE</span>
 </>
 ) : (
 <>
 <Moon size={14} className="text-[var(--accent)]" />
 <span>DARK MODE</span>
 </>
 )}
 </button>
 
 <button
 onClick={logout}
 className="w-full group p-2 bg-[var(--paper)] border border-[var(--line)] flex items-center gap-3 transition-none hover:bg-[var(--line)]"
 >
 <div className={cn(
 "w-8 h-8 flex items-center justify-center border",
 isAdmin ? "bg-[var(--ink)] text-[var(--bg-app)] border-[var(--ink)]" : "bg-[var(--bg-app)] text-[var(--subtle)] border-[var(--line)]"
 )}>
 {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
 </div>
 <div className="flex-1 text-left min-w-0 pr-2">
 <p className="text-sm font-medium text-[var(--ink)]">{isAdmin ? 'Owner' : 'Staff'}</p>
 <p className="text-xs text-[var(--subtle)]">Sign out</p>
 </div>
 </button>
 </div>
 </aside>
 );
}
