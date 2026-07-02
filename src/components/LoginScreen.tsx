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
        <div className="flex flex-col items-center gap-3 mb-10">
          <img src="/logo.jpeg" alt="ClickZone" className="h-14 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[var(--ink)] tracking-tight">ClickZone POS</h1>
            <p className="text-[10px] text-[var(--subtle)] tracking-widest mt-1">MANAGEMENT ACCESS</p>
          </div>
        </div>

        <div className="bg-[var(--paper)] border border-[var(--line)] p-8 relative">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-[var(--subtle)] tracking-widest">EMAIL</label>
              <Input
                type="email" autoComplete="username" placeholder="you@clickzone.test" value={email}
                onChange={e => setEmail(e.target.value)} autoFocus
                className="h-11 rounded-none border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:ring-0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-[var(--subtle)] tracking-widest">PASSWORD</label>
              <Input
                type="password" autoComplete="current-password" placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-11 rounded-none border-[var(--line)] bg-[var(--bg-app)] text-[var(--ink)] focus-visible:border-[var(--accent)] focus-visible:ring-0"
              />
            </div>
            <Button
              type="submit" disabled={busy}
              className="w-full bg-[var(--accent)] hover:brightness-90 text-[var(--bg-app)] h-11 text-[10px] font-bold tracking-widest rounded-none active:scale-[0.99] transition-all"
            >
              {busy ? 'SIGNING IN…' : 'SIGN IN'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[9px] text-[var(--subtle)] opacity-60 mt-6 tracking-wider">
          ClickZone Mobiles · Kandy
        </p>
      </motion.div>
    </div>
  );
}
