import React from 'react';
import { RUN_COLORS, RUN_VALUES, SHOT_TYPES } from '@/lib/api';
import { X } from 'lucide-react';

const ALL_SHOT_TYPES = [
  ...SHOT_TYPES,
  'Straight Drive', 'Cover Drive', 'On Drive', 'Off Drive',
  'Square Cut', 'Hook', 'Glance', 'Lofted Off', 'Lofted On',
];

export default function EditShotSheet({ open, onClose, prediction, onSave }) {
  const [runs, setRuns] = React.useState(prediction?.runs ?? 0);
  const [shotType, setShotType] = React.useState(prediction?.shotType || 'Drive');
  const [angle, setAngle] = React.useState(prediction?.wagonAngle ?? 0);

  React.useEffect(() => {
    if (open && prediction) {
      setRuns(prediction.runs ?? 0);
      setShotType(prediction.shotType || 'Drive');
      setAngle(prediction.wagonAngle ?? 0);
    }
  }, [open, prediction]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        data-testid="edit-shot-sheet"
        className="w-full sm:max-w-md broadcast-card border-2 border-primary/40 p-4 rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">QUICK EDIT</div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">RUNS</div>
          <div className="grid grid-cols-6 gap-1.5">
            {RUN_VALUES.map((n) => {
              const active = runs === n;
              return (
                <button
                  key={n}
                  data-testid={`edit-run-${n}`}
                  onClick={() => setRuns(n)}
                  style={{
                    borderColor: active ? RUN_COLORS[n] : undefined,
                    background: active ? RUN_COLORS[n] : undefined,
                    color: active ? '#000' : RUN_COLORS[n],
                  }}
                  className="py-2 rounded font-black text-base border border-white/10"
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1.5">SHOT TYPE</div>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_SHOT_TYPES.map((t) => (
              <button
                key={t}
                data-testid={`edit-type-${t.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => setShotType(t)}
                className={`py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border ${
                  shotType === t ? 'bg-primary text-black border-primary' : 'border-white/10 text-foreground hover:bg-white/5'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">DIRECTION (°)</div>
            <div className="text-xs font-bold text-primary tabular-nums">{angle}°</div>
          </div>
          <input
            data-testid="edit-angle-slider"
            type="range"
            min="-180"
            max="180"
            value={angle}
            onChange={(e) => setAngle(parseInt(e.target.value, 10))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
            <span>FINE LEG</span><span>STRAIGHT</span><span>THIRD MAN</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-2.5 rounded border border-white/15 text-foreground font-bold uppercase tracking-widest text-xs hover:bg-white/5">
            CANCEL
          </button>
          <button
            data-testid="edit-save-btn"
            onClick={() => onSave?.({ runs, shotType, angle })}
            className="py-2.5 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90"
          >
            SAVE CORRECTION
          </button>
        </div>
      </div>
    </div>
  );
}
