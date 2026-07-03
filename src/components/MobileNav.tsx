import { LayoutDashboard, Package, ShoppingCart, ReceiptText, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'customers';

interface MobileNavProps {
 activePage: Page;
 onNavigate: (page: Page) => void;
}

const navItems: { id: Page; label: string; icon: typeof Package; ownerOnly?: boolean }[] = [
 { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
 { id: 'inventory', label: 'Stock', icon: Package },
 { id: 'pos', label: 'Sell', icon: ShoppingCart },
 { id: 'sales', label: 'Sales', icon: ReceiptText },
 { id: 'customers', label: 'People', icon: Users, ownerOnly: true },
];

export default function MobileNav({ activePage, onNavigate }: MobileNavProps) {
 const { isAdmin } = useAuth();
 const items = navItems.filter((item) => !item.ownerOnly || isAdmin);
 return (
 <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-app)] border-t border-[var(--line)] px-2 pb-safe">
 <div className="flex items-end justify-around">
 {items.map((item) => {
 const isActive = activePage === item.id;
 return (
 <button
 key={item.id}
 onClick={() => onNavigate(item.id)}
 className={cn(
 'flex flex-col items-center gap-0.5 px-4 py-3 rounded-xl transition-none relative min-w-[64px]',
 isActive ? 'text-[var(--ink)]' : 'text-[var(--subtle)] active:scale-90'
 )}
 >
 {isActive && (
 <motion.div
 layoutId="mobile-nav-pill"
 className="absolute inset-0 bg-[var(--paper)] border-t-2 border-[var(--brand)]"
 transition={{ type: 'spring', stiffness: 380, damping: 30 }}
 />
 )}
 <span className="relative z-10">
 <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
 </span>
 <span className={cn('relative z-10 text-[10px] font-semibold tracking-wide', isActive ? 'text-[var(--ink)]' : 'text-[var(--subtle)]')}>
 {item.label}
 </span>
 </button>
 );
 })}
 </div>
 </nav>
 );
}
