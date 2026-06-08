import React, { useMemo } from 'react';
import { TID } from '@/constants/testIds';

function Tile({ label, value, accent, tid }) {
  return (
    <div className="broadcast-card p-3 sm:p-4 relative overflow-hidden" data-testid={tid}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">{label}</div>
      <div className={`mt-1 font-display font-black tabular-nums text-3xl sm:text-4xl leading-none ${accent || 'text-foreground'}`}>{value}</div>
      <div className="absolute -bottom-3 -right-3 w-16 h-16 rounded-full bg-primary/10 blur-2xl" />
    </div>
  );
}

export default function StatsPanel({ shots }) {
  const stats = useMemo(() => {
    const total = shots.length;
    const runs = shots.reduce((a, s) => a + s.runs, 0);
    const fours = shots.filter((s) => s.runs === 4).length;
    const sixes = shots.filter((s) => s.runs === 6).length;
    const dots = shots.filter((s) => s.runs === 0).length;
    const sr = total ? ((runs / total) * 100).toFixed(1) : '0.0';
    return { total, runs, sr, fours, sixes, dots };
  }, [shots]);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
      <Tile tid={TID.statsBalls} label="BALLS" value={stats.total} />
      <Tile tid={TID.statsRuns} label="RUNS" value={stats.runs} accent="text-primary glow-text" />
      <Tile tid={TID.statsSR} label="S/R" value={stats.sr} accent="text-primary glow-text" />
      <Tile tid={TID.statsFours} label="4s" value={stats.fours} accent="text-[#F97316]" />
      <Tile tid={TID.statsSixes} label="6s" value={stats.sixes} accent="text-[#A855F7]" />
      <Tile tid={TID.statsDots} label="DOT" value={stats.dots} accent="text-muted-foreground" />
    </div>
  );
}
