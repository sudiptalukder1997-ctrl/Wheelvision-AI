import React, { useState } from 'react';
import { api } from '@/lib/api';
import { TID } from '@/constants/testIds';
import { Sparkles, Lock, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function CoachingPanel({ session, shots, tier, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const isPro = tier === 'pro' || tier === 'academy';
  const enough = shots.length >= 3;

  const analyze = async () => {
    if (!isPro) { navigate('/pricing'); return; }
    if (!enough) { toast.error('Log at least 3 shots first.'); return; }
    if (!session?.id) return;
    setLoading(true);
    try {
      const r = await api.post(`/sessions/${session.id}/coaching`);
      onUpdated?.(r.data.coaching);
      toast.success('AI analysis complete');
    } catch (e) {
      const msg = e?.response?.data?.detail || 'Failed to analyze';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="broadcast-card p-3 sm:p-4 space-y-3" data-testid={TID.coachingPanel}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">AI COACHING</div>
          <div className="font-display font-bold text-foreground tracking-tight">Claude Sonnet · Batting Analyst</div>
        </div>
        <button
          data-testid={TID.analyzeBtn}
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded bg-primary text-black font-bold uppercase tracking-widest text-xs hover:bg-primary/90 disabled:opacity-40"
        >
          {isPro ? <Sparkles className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {loading ? 'Analysing…' : isPro ? 'Analyse my batting' : 'Upgrade to unlock'}
        </button>
      </div>

      {!isPro && (
        <div className="flex items-start gap-2 p-2 rounded border border-primary/30 bg-primary/5 text-xs">
          <Lock className="w-3.5 h-3.5 text-primary mt-0.5" />
          <div className="text-muted-foreground">AI coaching is part of <span className="text-primary font-bold">Pro</span>. Upgrade to unlock unlimited shots, history and AI analysis.</div>
        </div>
      )}
      {isPro && !enough && (
        <div className="flex items-start gap-2 p-2 rounded border border-yellow-500/30 bg-yellow-500/5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5" />
          <div className="text-muted-foreground">Log at least <span className="text-foreground font-bold">3 shots</span> to unlock AI analysis.</div>
        </div>
      )}

      {session?.coaching ? (
        <div className="rounded bg-[#051A0C] border border-primary/20 p-3 text-sm leading-relaxed whitespace-pre-wrap font-mono text-foreground">
          {session.coaching}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic">
          AI analysis will appear here — strengths, gaps, tactical recommendation, and an overall assessment.
        </div>
      )}
    </div>
  );
}
