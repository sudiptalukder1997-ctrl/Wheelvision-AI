import React, { useMemo, useState } from 'react';
import { confidenceTier, realismCheck } from '@/lib/biomechanics';
import { RUN_COLORS, RUN_VALUES } from '@/lib/api';
import { Check, Trash2, Edit3, Filter, X, AlertTriangle, Loader2 } from 'lucide-react';

const ALL_SHOT_TYPES = [
  'Drive', 'Pull', 'Cut', 'Sweep', 'Flick', 'Defend',
  'Straight Drive', 'Cover Drive', 'Off Drive', 'On Drive',
  'Square Cut', 'Hook', 'Glance', 'Lofted Off', 'Lofted On',
];

export default function ShotReviewSheet({
  open,
  shots,
  onChange,        // (nextShots) => void
  onConfirm,       // (finalShots) => Promise<void>
  onSkip,          // skip review, commit as-is
  onCancel,        // close without committing
  durationSec,
  committing,
}) {
  const [quickReview, setQuickReview] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const filtered = useMemo(() => quickReview ? shots.filter((s) => s.confidence < 80) : shots, [shots, quickReview]);
  const warnings = useMemo(() => realismCheck(shots, { videoDurationSec: durationSec }), [shots, durationSec]);

  if (!open) return null;

  const totals = {
    n: shots.length,
    runs: shots.reduce((a, s) => a + (s.runs || 0), 0),
    dots: shots.filter((s) => (s.runs || 0) === 0).length,
    fours: shots.filter((s) => (s.runs || 0) === 4).length,
    sixes: shots.filter((s) => (s.runs || 0) === 6).length,
  };
  const sr = totals.n ? Math.round((totals.runs / totals.n) * 100) : 0;
  const dotPct = totals.n ? Math.round((totals.dots / totals.n) * 100) : 0;

  const removeShot = (id) => onChange(shots.filter((s) => s.id !== id));
  const editShot = (id, patch) => onChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">REVIEW BEFORE FINALISING</div>
            <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tighter">CHECK DETECTED SHOTS</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="quick-review-toggle"
              onClick={() => setQuickReview((q) => !q)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest border transition-all ${
                quickReview ? 'bg-primary text-black border-primary' : 'border-white/15 text-foreground hover:bg-white/5'
              }`}
            >
              <Filter className="w-3 h-3" /> QUICK REVIEW (&lt;80%)
            </button>
            <button onClick={onCancel} data-testid="review-cancel-btn" className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { label: 'SHOTS', value: totals.n },
            { label: 'RUNS', value: totals.runs },
            { label: 'S/R', value: sr },
            { label: 'DOT %', value: `${dotPct}%` },
            { label: '4s · 6s', value: `${totals.fours} · ${totals.sixes}` },
          ].map((t) => (
            <div key={t.label} className="broadcast-card p-2.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{t.label}</div>
              <div className="font-display font-black text-xl tabular-nums">{t.value}</div>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2" data-testid="review-warnings">
            {warnings.map((w) => (
              <div key={w.code} className="flex items-start gap-2 p-2.5 rounded border border-yellow-500/40 bg-yellow-500/10">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-xs text-yellow-100">{w.message}</div>
              </div>
            ))}
          </div>
        )}

        {/* Shots list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-xs text-muted-foreground uppercase tracking-widest text-center py-6">
              {shots.length === 0 ? 'No shots detected' : 'No shots match Quick Review filter'}
            </div>
          )}
          {filtered.map((s) => {
            const ct = confidenceTier(s.confidence);
            const isEditing = editingId === s.id;
            return (
              <div key={s.id} className="broadcast-card overflow-hidden" data-testid={`review-row-${s.id}`}>
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2 sm:gap-3 p-2.5">
                  {/* thumbnail + timestamp */}
                  <div className="relative">
                    {s.freezeUrl ? (
                      <img src={s.freezeUrl} alt="freeze" className="w-full aspect-video object-cover rounded" />
                    ) : (
                      <div className="w-full aspect-video bg-black rounded" />
                    )}
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] tabular-nums text-primary font-bold">
                      t={formatTime(s.t)}
                    </div>
                  </div>
                  {/* body */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center font-black text-sm"
                        style={{ background: RUN_COLORS[s.runs] || '#666', color: '#000' }}
                      >
                        {s.runs}
                      </div>
                      <div className="font-display font-bold text-base tracking-tight">{s.shotType}</div>
                      <div className="text-[10px] uppercase tracking-widest font-bold ml-auto" style={{ color: ct.color }}>
                        {s.confidence}% · {ct.label}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      wrist {Math.round(s.features?.wrist_angle ?? 0)}° · elbow {Math.round(s.features?.elbow_angle ?? 0)}° · lean {Math.round(s.features?.body_lean ?? 0)}° · vel {Math.round(s.velocity || 0)}
                    </div>

                    {isEditing && (
                      <EditPanel shot={s} onSave={(patch) => { editShot(s.id, patch); setEditingId(null); }} onCancel={() => setEditingId(null)} />
                    )}
                  </div>
                  {/* actions */}
                  <div className="flex sm:flex-col gap-1.5 justify-end">
                    <button
                      data-testid={`review-edit-${s.id}`}
                      onClick={() => setEditingId(isEditing ? null : s.id)}
                      className="px-2 py-1.5 rounded border border-white/15 text-foreground text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> EDIT
                    </button>
                    <button
                      data-testid={`review-delete-${s.id}`}
                      onClick={() => removeShot(s.id)}
                      className="px-2 py-1.5 rounded border border-destructive/40 text-destructive text-[10px] font-bold uppercase tracking-widest hover:bg-destructive/10 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> DELETE
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-black/95 backdrop-blur-md py-3 -mx-3 sm:-mx-6 px-3 sm:px-6 border-t border-white/10 flex items-center gap-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mr-auto">
            {shots.length} shot{shots.length === 1 ? '' : 's'} will be saved to your session
          </div>
          <button
            data-testid="review-skip-btn"
            onClick={onSkip}
            disabled={committing}
            className="px-3 py-2 rounded border border-white/15 text-foreground text-xs font-bold uppercase tracking-widest hover:bg-white/5 disabled:opacity-50"
          >
            SKIP REVIEW
          </button>
          <button
            data-testid="review-confirm-btn"
            onClick={() => onConfirm?.(shots)}
            disabled={committing || shots.length === 0}
            className="px-3 py-2 rounded bg-primary text-black text-xs font-black uppercase tracking-widest hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
          >
            {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {committing ? 'SAVING…' : 'CONFIRM & SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPanel({ shot, onSave, onCancel }) {
  const [runs, setRuns] = useState(shot.runs ?? 0);
  const [shotType, setShotType] = useState(shot.shotType || 'Drive');
  const [angle, setAngle] = useState(shot.wagonAngle ?? 0);

  return (
    <div className="mt-2 p-2 rounded border border-primary/30 bg-primary/5 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">RUNS</div>
        <div className="grid grid-cols-6 gap-1">
          {RUN_VALUES.map((n) => {
            const active = runs === n;
            return (
              <button
                key={n}
                data-testid={`edit-run-${shot.id}-${n}`}
                onClick={() => setRuns(n)}
                style={{
                  borderColor: active ? RUN_COLORS[n] : undefined,
                  background: active ? RUN_COLORS[n] : undefined,
                  color: active ? '#000' : RUN_COLORS[n],
                }}
                className="py-1 rounded font-black text-sm border border-white/10"
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">SHOT TYPE</div>
        <select
          value={shotType}
          onChange={(e) => setShotType(e.target.value)}
          className="w-full bg-black border border-white/15 rounded px-2 py-1 text-xs text-foreground"
        >
          {ALL_SHOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          <span>WAGON ANGLE</span>
          <span className="text-primary tabular-nums">{angle}°</span>
        </div>
        <input
          type="range" min="-180" max="180" value={angle}
          onChange={(e) => setAngle(parseInt(e.target.value, 10))}
          className="w-full accent-primary"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={onCancel} className="px-2 py-1 rounded border border-white/15 text-[10px] uppercase tracking-widest">Cancel</button>
        <button onClick={() => onSave({ runs, shotType, wagonAngle: angle })} className="px-2 py-1 rounded bg-primary text-black text-[10px] font-black uppercase tracking-widest">SAVE</button>
      </div>
    </div>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}
