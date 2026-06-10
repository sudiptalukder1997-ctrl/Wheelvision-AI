import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { AlertTriangle, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TestModeBanner() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user || user.role !== 'owner' || !user.impersonate_tier) return null;

  const exit = async () => {
    setBusy(true);
    try {
      const r = await api.post('/admin/impersonate', { tier: null });
      setUser(r.data);
      toast.success('Owner access restored');
    } catch (err) {
      console.error('exit impersonation failed', err);
      toast.error('Could not exit test mode');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="test-mode-banner"
      className="sticky top-0 z-50 w-full bg-red-600 text-white border-b-2 border-red-300"
      style={{ boxShadow: '0 0 24px rgba(239,68,68,0.6)' }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-3 flex-wrap">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <div className="text-[11px] sm:text-xs font-black uppercase tracking-[0.18em] flex-1 leading-tight">
          TEST MODE — Viewing as <span className="underline">{user.impersonate_tier}</span> user
          <span className="hidden sm:inline text-white/80 normal-case font-normal tracking-normal ml-2">
            · all paid features will hit real limits
          </span>
        </div>
        <button
          data-testid="exit-test-mode-btn"
          onClick={exit}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white text-red-700 font-black uppercase tracking-widest text-[10px] hover:bg-white/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          EXIT TEST MODE
        </button>
      </div>
    </div>
  );
}
