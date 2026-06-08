import React, { useMemo } from 'react';
import { RUN_COLORS, RUN_VALUES } from '@/lib/api';
import { TID } from '@/constants/testIds';

export default function RunDistribution({ shots, filter, setFilter }) {
  const dist = useMemo(() => {
    const total = shots.length || 1;
    return RUN_VALUES.map((n) => ({
      n,
      count: shots.filter((s) => s.runs === n).length,
      pct: (shots.filter((s) => s.runs === n).length / total) * 100,
    }));
  }, [shots]);

  return (
    <div className="broadcast-card p-3 sm:p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">RUN DISTRIBUTION</div>
        <button
          data-testid={TID.filterRun(null)}
          onClick={() => setFilter(null)}
          className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border ${
            filter == null ? 'border-primary text-primary' : 'border-white/10 text-muted-foreground'
          }`}
        >
          ALL
        </button>
      </div>
      <div className="space-y-1.5">
        {dist.map((d) => {
          const active = filter === d.n;
          return (
            <button
              key={d.n}
              data-testid={TID.filterRun(d.n)}
              onClick={() => setFilter(active ? null : d.n)}
              className={`w-full text-left flex items-center gap-2 group transition-all ${active ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
            >
              <div
                className="w-6 h-6 rounded flex items-center justify-center font-black text-xs"
                style={{ background: RUN_COLORS[d.n], color: '#000' }}
              >
                {d.n}
              </div>
              <div className="flex-1 h-3 rounded bg-white/5 overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${Math.max(d.pct, d.count > 0 ? 3 : 0)}%`, background: RUN_COLORS[d.n], boxShadow: active ? `0 0 12px ${RUN_COLORS[d.n]}` : undefined }}
                />
              </div>
              <div className="w-10 text-right text-[11px] tabular-nums text-foreground font-bold">{d.pct.toFixed(0)}%</div>
              <div className="w-6 text-right text-[10px] tabular-nums text-muted-foreground">{d.count}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
