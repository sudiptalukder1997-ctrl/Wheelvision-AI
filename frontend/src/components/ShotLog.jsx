import React from 'react';
import { RUN_COLORS } from '@/lib/api';
import { Trash2 } from 'lucide-react';

export default function ShotLog({ shots, onDelete }) {
  if (!shots.length) {
    return (
      <div className="broadcast-card p-4 text-center text-xs text-muted-foreground uppercase tracking-widest">
        No shots logged yet — start a session by tapping LOG SHOT.
      </div>
    );
  }
  return (
    <div className="broadcast-card overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">SHOT LOG</div>
        <div className="text-[10px] uppercase tracking-widest text-primary">{shots.length} balls</div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
        {shots.slice().reverse().map((s, i) => {
          const t = new Date(s.timestamp);
          return (
            <div key={s.id || i} data-testid={`shot-row-${shots.length - 1 - i}`} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5">
              <div
                className="w-7 h-7 rounded flex items-center justify-center font-black"
                style={{ background: RUN_COLORS[s.runs], color: '#000' }}
              >
                {s.runs}
              </div>
              <div className="flex-1">
                <div className="font-bold text-foreground tracking-wide">{s.shot_type}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
              <button
                data-testid={`delete-shot-${s.id}`}
                onClick={() => onDelete(s.id)}
                className="opacity-50 hover:opacity-100 hover:text-destructive"
                aria-label="delete shot"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
