import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function PaymentReturn() {
  const [status, setStatus] = useState('pending'); // pending | paid | failed | expired
  const [attempts, setAttempts] = useState(0);
  const navigate = useNavigate();
  const { checkAuth } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (!sessionId) { setStatus('failed'); return; }

    let cancelled = false;
    const poll = async (n) => {
      if (cancelled) return;
      try {
        const r = await api.get(`/payments/status/${sessionId}`);
        if (r.data.payment_status === 'paid') {
          setStatus('paid');
          await checkAuth();
          return;
        }
        if (r.data.status === 'expired') { setStatus('expired'); return; }
        if (n >= 6) { setStatus('failed'); return; }
        setAttempts(n + 1);
        setTimeout(() => poll(n + 1), 2000);
      } catch {
        if (n >= 6) { setStatus('failed'); return; }
        setTimeout(() => poll(n + 1), 2000);
      }
    };
    poll(0);
    return () => { cancelled = true; };
  }, [checkAuth]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="broadcast-card p-8 max-w-md w-full text-center space-y-3">
        {status === 'pending' && <>
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <div className="font-display font-bold text-xl tracking-tight">Verifying payment…</div>
          <div className="text-xs text-muted-foreground">Attempt {attempts + 1} of 6</div>
        </>}
        {status === 'paid' && <>
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto glow-text" />
          <div className="font-display font-black text-2xl tracking-tighter">PAYMENT CONFIRMED</div>
          <div className="text-xs text-muted-foreground">Your tier has been upgraded.</div>
          <button onClick={() => navigate('/dashboard')} className="mt-2 px-5 py-2.5 rounded bg-primary text-black font-black uppercase tracking-widest text-xs">GO TO DASHBOARD</button>
        </>}
        {(status === 'failed' || status === 'expired') && <>
          <XCircle className="w-10 h-10 text-destructive mx-auto" />
          <div className="font-display font-bold text-xl tracking-tight">{status === 'expired' ? 'Payment expired' : 'Could not verify'}</div>
          <button onClick={() => navigate('/pricing')} className="mt-2 px-5 py-2.5 rounded border border-white/15 text-foreground font-bold uppercase tracking-widest text-xs">BACK TO PRICING</button>
        </>}
      </div>
    </div>
  );
}
