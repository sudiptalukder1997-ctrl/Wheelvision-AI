import React, { useEffect, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { confidenceTier } from '@/lib/biomechanics';

// 4-second auto-confirm card shown after each shot detection.
export default function ConfirmationCard({ prediction, onConfirm, onEdit, autoConfirmMs = 4000 }) {
  const [remaining, setRemaining] = useState(autoConfirmMs);
  const ct = confidenceTier(prediction?.confidence ?? 0);

  useEffect(() => {
    setRemaining(autoConfirmMs);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, autoConfirmMs - (Date.now() - startedAt));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        onConfirm?.('auto');
      }
    }, 100);
    return () => clearInterval(id);
  }, [prediction?.id, autoConfirmMs, onConfirm]);

  if (!prediction) return null;
  const pct = 100 - Math.round((remaining / autoConfirmMs) * 100);

  return (
    <div
      data-testid="confirmation-card"
      className="fixed bottom-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-50 broadcast-card border-2"
      style={{ borderColor: ct.color, boxShadow: `0 0 24px ${ct.color}55` }}
    >
      <div className="h-1 bg-white/10 overflow-hidden rounded-t">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: ct.color }} />
      </div>
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold" style={{ color: ct.color }}>
              SHOT DETECTED · {ct.label}
            </div>
            <div className="font-display font-black text-xl tracking-tighter mt-0.5 text-foreground truncate">
              {(prediction.shotType || 'Unknown').toUpperCase()}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Predicted runs · <span className="text-foreground font-bold">{prediction.runs}</span> · Confidence{' '}
              <span style={{ color: ct.color }} className="font-bold">{prediction.confidence}%</span>
            </div>
          </div>
          <div
            className="font-display font-black text-3xl tabular-nums tracking-tighter"
            style={{ color: ct.color, textShadow: `0 0 12px ${ct.color}77` }}
          >
            {prediction.runs}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button
            data-testid="confirm-shot-btn"
            onClick={() => onConfirm?.('manual')}
            className="py-2 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> CORRECT
          </button>
          <button
            data-testid="edit-shot-btn"
            onClick={() => onEdit?.()}
            className="py-2 rounded border border-white/15 text-foreground font-bold uppercase tracking-widest text-xs hover:bg-white/5 flex items-center justify-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> EDIT
          </button>
        </div>
      </div>
    </div>
  );
}
