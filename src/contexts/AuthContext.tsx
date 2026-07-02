/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import LoginScreen from '@/components/LoginScreen';
import { useStoreScope } from '@/lib/store';

type Role = 'owner' | 'staff';

interface AuthContextType {
  user: User | null;
  role: Role | null;
  storeId: string | null;
  /** True only for a real owner login — drives cost/profit VISIBILITY. */
  isAdmin: boolean;
  /** True if a short-lived staff PIN-override capability is currently active. */
  hasOverride: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  /** Legacy ergonomics kept for the existing UI. */
  login: () => void;   // opens the PIN-override prompt (staff terminal unlock)
  logout: () => void;  // full sign-out
  /** Run `cb` if owner (or a valid staff override); otherwise prompt for the override PIN. */
  requireAdmin: (cb: () => void) => void;
  requireOwner: (cb: () => void) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // PIN-override capability (NOT a role change) — short-lived, from verify_override_pin RPC.
  const [overrideUntil, setOverrideUntil] = useState<number | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const isOwner = role === 'owner';
  const hasOverride = overrideUntil != null && overrideUntil > Date.now();
  const isAdmin = isOwner; // cost/profit visibility = real owner only

  // Load the caller's role + store from their profiles row (RLS: profiles_self_read).
  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) { setRole(null); setStoreId(null); return; }
    const { data, error } = await supabase
      .from('profiles').select('role, store_id').eq('id', u.id).single();
    if (error || !data) { setRole('staff'); setStoreId(null); useStoreScope.getState().setActiveStore(null); return; }
    const r = (data.role as Role) ?? 'staff';
    setRole(r);
    setStoreId((data.store_id as string) ?? null);
    // Non-owner sessions never scope by switcher — clear any persisted owner selection.
    if (r !== 'owner') useStoreScope.getState().setActiveStore(null);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, s) => {
      setSession(s);
      await loadProfile(s?.user ?? null);
      setOverrideUntil(null); // any auth change clears a staff override
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = useCallback(async () => {
    setOverrideUntil(null);
    await supabase.auth.signOut();
  }, []);

  const requireAdmin = useCallback((cb: () => void) => {
    if (role === 'owner' || (overrideUntil != null && overrideUntil > Date.now())) {
      cb();
    } else {
      pendingAction.current = cb;
      setPinOpen(true);
    }
  }, [role, overrideUntil]);

  const login = useCallback(() => { pendingAction.current = null; setPinOpen(true); }, []);
  const logout = useCallback(() => { void signOut(); }, [signOut]);

  const submitPin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('verify_override_pin', { pin });
      if (error) throw error;
      if (data?.granted) {
        const until = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 15 * 60 * 1000;
        setOverrideUntil(until);
        setPinOpen(false);
        setPin('');
        toast.success('Override unlocked (temporary)');
        const cb = pendingAction.current; pendingAction.current = null;
        if (cb) cb();
      } else {
        toast.error('Incorrect PIN');
        setPin('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PIN verification failed');
    } finally {
      setSubmitting(false);
    }
  }, [pin]);

  const value: AuthContextType = {
    user: session?.user ?? null, role, storeId, isAdmin, hasOverride,
    signIn, signOut, login, logout, requireAdmin, requireOwner: requireAdmin,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="text-[var(--subtle)] text-xs tracking-widest animate-pulse">LOADING…</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {!session ? <LoginScreen /> : children}

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="sm:max-w-xs bg-[var(--paper)] rounded-xl border border-[var(--line)] p-8 shadow-[0_0_100px_rgba(0,0,0,0.5)]">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-[var(--ink)] font-bold text-xl ">
              <div className="w-8 h-8 rounded-xl bg-[var(--bg-app)] border border-[var(--line)] flex items-center justify-center">
                <Lock size={16} className="text-[var(--accent)]" />
              </div>
              Owner Override
            </DialogTitle>
          </DialogHeader>
          <div className="text-[9px] text-[var(--subtle)] mt-3 mb-8 ">Temporary unlock // Not a role change</div>
          <form onSubmit={submitPin} className="space-y-8">
            <div className="relative group">
              <div className="absolute -top-2 left-4 bg-[var(--paper)] px-2 z-10 border-x border-[var(--line)]">
                <span className="text-[8px] font-bold text-[var(--subtle)] group-focus-within:text-[var(--accent)]">Override PIN</span>
              </div>
              <Input
                type="password" placeholder="****" value={pin} onChange={e => setPin(e.target.value)} autoFocus
                className="text-center text-4xl h-16 rounded-xl border-[var(--line)] focus-visible:border-[var(--accent)] focus-visible:ring-0 bg-[var(--bg-app)] text-[var(--accent)] transition-all font-bold"
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full bg-[var(--accent)] hover:brightness-90 text-[var(--bg-app)] h-12 text-[10px] font-medium rounded-full shadow-xl shadow-[var(--accent)]/10 transition-all active:scale-95">
              {submitting ? 'Verifying…' : 'Verify Override'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
