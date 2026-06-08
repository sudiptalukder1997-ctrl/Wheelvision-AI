import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TID } from '@/constants/testIds';
import { ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function History() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (user === null) return;
    (async () => {
      try {
        const r = await api.get('/sessions');
        setSessions(r.data || []);
      } finally { setLoading(false); }
    })();
  }, [user]);

  const remove = async (id) => {
    if (!confirm('Delete this session?')) return;
    await api.delete(`/sessions/${id}`);
    setSessions((s) => s.filter((x) => x.id !== id));
    toast.success('Session deleted');
  };

  const tier = user?.tier || 'free';
  const showLock = tier === 'free';

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">SESSION HISTORY</div>
          <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">YOUR PAST SESSIONS</h2>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{sessions.length} total</div>
      </div>

      {showLock && (
        <div className="broadcast-card p-3 text-xs text-muted-foreground border border-primary/30">
          History view shows your latest session only on the Free tier. <button onClick={() => navigate('/pricing')} className="text-primary font-bold uppercase tracking-widest ml-1">Upgrade →</button>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground uppercase tracking-widest">Loading…</div>
      ) : sessions.length === 0 ? (
        <div className="broadcast-card p-6 text-center text-xs text-muted-foreground">No sessions yet — start logging on the Dashboard.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(showLock ? sessions.slice(0, 1) : sessions).map((s, i) => {
            const total = s.shots?.length || 0;
            const runs = (s.shots || []).reduce((a, x) => a + x.runs, 0);
            const sr = total ? ((runs / total) * 100).toFixed(1) : '0.0';
            return (
              <div key={s.id} data-testid={TID.sessionItem(i)} className="broadcast-card p-3 group hover:border-primary/40 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-bold text-foreground tracking-tight">{s.name}</div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{new Date(s.created_at).toLocaleString()}</div>
                  </div>
                  <button onClick={() => remove(s.id)} className="opacity-40 hover:opacity-100 hover:text-destructive" aria-label="delete"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balls</div><div className="font-display font-black text-xl tabular-nums">{total}</div></div>
                  <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Runs</div><div className="font-display font-black text-xl tabular-nums text-primary glow-text">{runs}</div></div>
                  <div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">S/R</div><div className="font-display font-black text-xl tabular-nums text-primary">{sr}</div></div>
                </div>
                <button onClick={() => navigate('/dashboard')} className="mt-3 w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-[11px] uppercase tracking-widest text-muted-foreground">
                  <span>Open in dashboard</span><ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
