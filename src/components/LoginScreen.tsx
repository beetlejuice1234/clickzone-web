import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { toast.error(error.message); return; }
      // onAuthStateChange in AuthProvider takes over from here.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-[var(--teal)] flex items-center justify-center shadow-sm">
            <span className="font-display text-2xl font-semibold text-[var(--cream)]">CZ</span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold text-[var(--teal)] tracking-tight">ClickZone POS</h1>
            <p className="text-[10px] text-[var(--subtle)] tracking-[0.2em] mt-1.5 uppercase">Management Access</p>
          </div>
        </div>

        <div className="bg-[var(--paper)] border border-[var(--line)] rounded-2xl p-8 shadow-[0_10px_40px_rgba(1,62,55,0.08)]">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[var(--subtle)] tracking-wide uppercase">Email</label>
              <Input
                type="email" autoComplete="username" placeholder="you@clickzone.test" value={email}
                onChange={e => setEmail(e.target.value)} autoFocus
                className="h-11 rounded-xl border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink)] focus-visible:border-[var(--teal)] focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[var(--subtle)] tracking-wide uppercase">Password</label>
              <Input
                type="password" autoComplete="current-password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-11 rounded-xl border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink)] focus-visible:border-[var(--teal)] focus-visible:ring-0"
              />
            </div>
            <Button
              type="submit" disabled={busy}
              className="w-full bg-[var(--terracotta)] hover:bg-[var(--terracotta-hover)] text-white h-11 text-[10px] font-bold tracking-widest rounded-xl active:scale-[0.99] transition-all shadow-sm"
            >
              {busy ? 'SIGNING IN…' : 'SIGN IN'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-[var(--subtle)] opacity-70 mt-6 tracking-wider">
          ClickZone Mobiles · Kandy
        </p>
      </motion.div>
    </div>
  );
}
