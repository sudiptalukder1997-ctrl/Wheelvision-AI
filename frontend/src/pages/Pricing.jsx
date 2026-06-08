import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Check, Crown, Sparkles, Loader2 } from 'lucide-react';
import { TID } from '@/constants/testIds';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const TIERS = [
  {
    id: 'free',
    name: 'FREE',
    price: '£0',
    pitch: 'Start logging shots in the net',
    bullets: ['10 shots per session', 'Wagon Wheel & live stats', 'Manual shot logging', 'No history, no AI coaching'],
    cta: null,
  },
  {
    id: 'pro',
    name: 'PRO',
    price: '£9.99',
    pitch: 'For serious club players',
    bullets: ['Unlimited shots', 'Full session history', 'AI batting coaching', 'Shareable wagon wheel'],
    cta: 'pro',
    highlight: true,
  },
  {
    id: 'academy',
    name: 'ACADEMY',
    price: '£49',
    pitch: 'For coaches & teams',
    bullets: ['Everything in Pro', 'Coach dashboard', 'Unlimited players', 'PDF reports', 'Priority support'],
    cta: 'academy',
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);

  const startLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const upgrade = async (tier) => {
    if (!user) { startLogin(); return; }
    setBusy(tier);
    try {
      const r = await api.post('/payments/checkout', {
        tier,
        origin_url: window.location.origin,
      });
      window.location.href = r.data.url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Checkout failed');
      setBusy(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-8 space-y-6">
      <div className="text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">SUBSCRIPTION TIERS</div>
        <h2 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-1">CHOOSE YOUR TIER</h2>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-xl mx-auto">Test mode payments — Stripe is wired up but uses test cards. Use <span className="text-foreground font-bold">4242 4242 4242 4242</span> in checkout.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => {
          const isCurrent = (user?.tier || 'free') === t.id;
          return (
            <div
              key={t.id}
              className={`relative broadcast-card p-5 flex flex-col ${
                t.highlight ? 'border-primary/60 glow-border' : ''
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-primary text-black text-[10px] uppercase tracking-[0.25em] font-black">
                  MOST POPULAR
                </div>
              )}
              <div className="flex items-center gap-2">
                {t.id === 'pro' && <Sparkles className="w-4 h-4 text-primary" />}
                {t.id === 'academy' && <Crown className="w-4 h-4 text-primary" />}
                <div className="font-display font-black text-2xl tracking-tighter">{t.name}</div>
              </div>
              <div className="mt-2">
                <div className="font-display font-black text-5xl tracking-tighter text-foreground">{t.price}<span className="text-base text-muted-foreground font-normal">{t.id !== 'free' ? '/mo' : ''}</span></div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mt-1">{t.pitch}</div>
              </div>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                {t.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-foreground/90">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> <span className="text-xs leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {t.cta ? (
                  <button
                    data-testid={t.id === 'pro' ? TID.upgradePro : TID.upgradeAcademy}
                    onClick={() => upgrade(t.cta)}
                    disabled={busy || isCurrent}
                    className={`w-full py-2.5 rounded font-black uppercase tracking-[0.2em] text-xs transition-all ${
                      t.highlight
                        ? 'bg-primary text-black hover:bg-primary/90'
                        : 'border border-primary/40 text-primary hover:bg-primary/10'
                    } disabled:opacity-50`}
                  >
                    {busy === t.cta ? <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Redirecting</span> :
                      isCurrent ? 'CURRENT TIER' : `UPGRADE TO ${t.name}`}
                  </button>
                ) : (
                  <button
                    onClick={() => (user ? navigate('/dashboard') : startLogin())}
                    className="w-full py-2.5 rounded border border-white/10 text-foreground font-bold uppercase tracking-widest text-xs hover:bg-white/5"
                  >
                    {isCurrent ? 'CURRENT TIER' : 'GET STARTED'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
