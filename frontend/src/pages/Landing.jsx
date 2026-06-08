import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TID } from '@/constants/testIds';
import { Activity, Sparkles, Target, Crown, ArrowRight } from 'lucide-react';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const startLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const onPrimary = () => (user ? navigate('/dashboard') : startLogin());

  return (
    <div className="relative min-h-[calc(100vh-65px)] overflow-hidden">
      {/* hero backdrop */}
      <div className="absolute inset-0 -z-10 bg-grid opacity-30" />
      <div
        className="absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1595210382266-2d0077c1f541?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1ODh8MHwxfHNlYXJjaHwyfHxjcmlja2V0JTIwYmF0c21hbiUyMGFjdGlvbnxlbnwwfHx8fDE3ODA5NTgwMTd8MA&ixlib=rb-4.1.0&q=85)",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'grayscale(60%) brightness(0.4)',
        }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/85 to-black" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 lg:py-28">
        <div className="flex items-center gap-2 mb-5">
          <div className="rec-dot" />
          <div className="text-[10px] uppercase tracking-[0.4em] text-primary font-bold">LIVE · BROADCAST MODE</div>
        </div>
        <h1 className="font-display font-black text-foreground leading-[0.9] tracking-tighter text-5xl sm:text-6xl md:text-7xl">
          WHEEL<span className="text-primary glow-text">VISION</span> AI
        </h1>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-xl tracking-wide">
          A broadcast-grade cricket shot analyser in your pocket. Plot every shot on a real wagon wheel,
          watch your strike rate update like a Sky Sports overlay, and get instant AI coaching after every session.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            data-testid={TID.loginBtn}
            onClick={onPrimary}
            className="group inline-flex items-center gap-2 px-5 py-3 rounded bg-primary text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-primary/90 transition-all glow-border"
          >
            {user ? 'OPEN DASHBOARD' : 'SIGN IN WITH GOOGLE'}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={() => navigate('/pricing')}
            data-testid={TID.navPricing}
            className="inline-flex items-center gap-2 px-5 py-3 rounded border border-white/15 text-foreground font-bold uppercase tracking-[0.2em] text-xs hover:bg-white/5"
          >
            <Crown className="w-4 h-4 text-primary" /> See Tiers
          </button>
        </div>

        {/* feature row */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { icon: Target, title: 'Wagon Wheel', body: 'Tap-to-log shots on a real cricket field with field positions, LH/RH support and instant boundary glow.' },
            { icon: Activity, title: 'Broadcast Stats', body: 'Live balls, runs, strike rate, 4s, 6s and dots — styled like a real TV scoreboard.' },
            { icon: Sparkles, title: 'AI Coaching', body: 'Claude Sonnet analyses your shots and tells you your strongest zone, your weakness and one tactical fix.' },
          ].map((f, i) => (
            <div key={i} className="broadcast-card p-4">
              <f.icon className="w-5 h-5 text-primary" />
              <div className="mt-2 font-display font-bold text-foreground tracking-tight">{f.title}</div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
