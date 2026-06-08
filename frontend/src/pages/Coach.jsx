import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Coach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAcademy = user?.tier === 'academy';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">COACH DASHBOARD</div>
        <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">MANAGE YOUR PLAYERS</h2>
        <p className="text-xs text-muted-foreground mt-1">See every player&apos;s wagon wheel in one place, compare side by side, send AI feedback notes.</p>
      </div>

      {!isAcademy ? (
        <div className="broadcast-card p-6 text-center space-y-3">
          <Lock className="w-8 h-8 text-primary mx-auto" />
          <div className="font-display font-bold tracking-tight text-foreground">Academy tier required</div>
          <div className="text-xs text-muted-foreground max-w-sm mx-auto">
            The Coach Dashboard is part of the <span className="text-primary font-bold">Academy</span> tier — manage unlimited players, compare wagon wheels and send AI notes.
          </div>
          <button onClick={() => navigate('/pricing')} className="px-4 py-2 rounded bg-primary text-black font-black uppercase tracking-widest text-xs">UPGRADE TO ACADEMY</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map((i) => (
            <div key={i} className="broadcast-card p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center"><Users className="w-4 h-4 text-primary" /></div>
                <div>
                  <div className="font-bold text-foreground">Player {i}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">No sessions yet</div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-3">Invite players (coming soon)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
