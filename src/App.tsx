import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import MobileNav from '@/components/MobileNav';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import Inventory from '@/pages/Inventory';
import POS from '@/pages/POS';
import SalesLog from '@/pages/SalesLog';
import Customers from '@/pages/Customers';
import AddUnitModal from '@/components/AddUnitModal';
import { useMobile } from '@/hooks/useMobile';

import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Sun, Moon } from 'lucide-react';

type Page = 'dashboard' | 'inventory' | 'pos' | 'sales' | 'customers';

const pageToPath: Record<Page, string> = {
  dashboard: '/dashboard',
  inventory: '/inventory',
  pos: '/pos',
  sales: '/sales',
  customers: '/customers',
};

const pathToPage: Record<string, Page> = {
  '/dashboard': 'dashboard',
  '/inventory': 'inventory',
  '/pos': 'pos',
  '/sales': 'sales',
  '/customers': 'customers',
};

const pageTitles: Record<Page, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  pos: 'Point of Sale',
  sales: 'Sales Log',
  customers: 'Customers',
};

// Context handed to routed pages that need the shared "Add Stock" action (Inventory).
type LayoutContext = { onAddStock: () => void };
export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}

function Layout() {
  const isMobile = useMobile();
  const { requireAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const activePage: Page = pathToPage[location.pathname] ?? 'pos';

  const handleNavigate = useCallback((page: Page) => {
    navigate(pageToPath[page]);
  }, [navigate]);

  const onAddStock = useCallback(() => {
    requireAdmin(() => setAddModalOpen(true));
  }, [requireAdmin]);

  const routedContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={activePage}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="min-h-full"
      >
        <Outlet context={{ onAddStock } satisfies LayoutContext} />
      </motion.div>
    </AnimatePresence>
  );

  if (isMobile) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
        {/* Mobile Header */}
        <header className="h-16 bg-[var(--bg-app)] border-b border-[var(--line)] flex items-center justify-between px-6 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Logo" className="h-8 w-auto object-contain" />
            <AnimatePresence mode="popLayout">
              <motion.h1
                key={activePage}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.15 }}
                className="text-xl font-bold text-[var(--ink)]"
              >
                {pageTitles[activePage]}
              </motion.h1>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="h-9 w-9 bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] flex items-center justify-center active:scale-95 transition-all"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {activePage === 'inventory' && (
              <button
                onClick={onAddStock}
                className="h-9 w-9 bg-[var(--accent)] rounded-none flex items-center justify-center active:scale-95 transition-transform"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--bg-app)" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Content */}
        <main className="flex-1 overflow-auto overflow-x-hidden pb-24">
          {routedContent}
        </main>

        {/* Bottom Nav */}
        <MobileNav activePage={activePage} onNavigate={handleNavigate} />

        <AddUnitModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
        <Toaster position="top-center" richColors closeButton />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="min-h-screen flex">
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <div className="flex-1 ml-60 flex flex-col min-h-screen">
        <Header
          onAddNew={onAddStock}
          title={pageTitles[activePage]}
          showAddButton={activePage === 'inventory'}
        />
        <main className="flex-1 overflow-auto overflow-x-hidden">
          {routedContent}
        </main>
      </div>
      <AddUnitModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

// Inventory needs the shared "Add Stock" handler from the layout context.
function InventoryRoute() {
  const { onAddStock } = useLayoutContext();
  return <Inventory onAddStock={onAddStock} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/pos" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<InventoryRoute />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/sales" element={<SalesLog />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="*" element={<Navigate to="/pos" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
