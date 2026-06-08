import React from 'react';
import { RUN_COLORS, RUN_VALUES, SHOT_TYPES } from '@/lib/api';
import { TID } from '@/constants/testIds';
import { Crosshair, Hand, Video } from 'lucide-react';

export default function ShotControls({
  shotType,
  setShotType,
  runs,
  setRuns,
  mode,
  setMode,
  batterHand,
  setBatterHand,
  onLogShot,
  onClear,
  canLog,
}) {
  return (
    <div className="broadcast-card p-3 sm:p-4 space-y-3">
      {/* Mode and hand */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mr-1">MODE</div>
        <button
          data-testid={TID.modeManual}
          onClick={() => setMode('manual')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest border transition-all ${
            mode === 'manual' ? 'bg-primary text-black border-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Crosshair className="w-3 h-3" /> Manual
        </button>
        <button
          data-testid={TID.modeAuto}
          onClick={() => setMode('auto')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest border transition-all ${
            mode === 'auto' ? 'bg-primary text-black border-primary' : 'border-white/10 text-muted-foreground hover:text-foreground'
          }`}
        >
          <Video className="w-3 h-3" /> Auto (Soon)
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            data-testid={TID.handToggle}
            onClick={() => setBatterHand(batterHand === 'RH' ? 'LH' : 'RH')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 hover:border-primary/40 text-[11px] font-bold uppercase tracking-widest text-foreground"
          >
            <Hand className="w-3 h-3" /> {batterHand}
          </button>
        </div>
      </div>

      {/* Shot type */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-1.5">SHOT TYPE</div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {SHOT_TYPES.map((t) => (
            <button
              key={t}
              data-testid={TID.shotType(t)}
              onClick={() => setShotType(t)}
              className={`py-2 rounded text-[11px] font-bold uppercase tracking-widest border transition-all ${
                shotType === t
                  ? 'bg-primary text-black border-primary glow-border'
                  : 'border-white/10 text-foreground hover:border-primary/40 hover:bg-white/5'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Runs */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-1.5">RUNS</div>
        <div className="grid grid-cols-6 gap-1.5">
          {RUN_VALUES.map((n) => {
            const active = runs === n;
            return (
              <button
                key={n}
                data-testid={TID.runBtn(n)}
                onClick={() => setRuns(n)}
                style={{
                  borderColor: active ? RUN_COLORS[n] : undefined,
                  background: active ? RUN_COLORS[n] : undefined,
                  color: active ? '#000' : RUN_COLORS[n],
                  boxShadow: active ? `0 0 16px ${RUN_COLORS[n]}66` : undefined,
                }}
                className="py-2 rounded font-black text-base border border-white/10 transition-all hover:bg-white/5"
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          data-testid={TID.logShotBtn}
          onClick={onLogShot}
          disabled={!canLog}
          className="flex-1 min-w-[140px] py-2.5 rounded bg-primary text-black font-black uppercase tracking-widest text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + LOG SHOT
        </button>
        <button
          data-testid={TID.clearShotsBtn}
          onClick={onClear}
          className="px-3 py-2.5 rounded border border-destructive/40 text-destructive text-xs font-bold uppercase tracking-widest hover:bg-destructive/10"
        >
          Clear all
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Tip: tap field on Wagon Wheel for precise placement, or just hit LOG SHOT.
      </div>
    </div>
  );
}
