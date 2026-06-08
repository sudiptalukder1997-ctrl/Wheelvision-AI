import React from 'react';
import { Camera, Sun, Ruler, User, X } from 'lucide-react';

export default function CameraSetupGuide({ onContinue, onCancel, title = 'CAMERA SETUP' }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">{title}</div>
          <div className="font-display font-black text-2xl tracking-tighter mt-0.5">FOR BEST AI ACCURACY</div>
        </div>
        {onCancel && (
          <button onClick={onCancel} data-testid="setup-cancel-btn" className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* visual diagram */}
      <div className="broadcast-card p-4 relative aspect-[16/9] flex items-center justify-center">
        <svg viewBox="0 0 320 180" className="w-full h-full">
          {/* pitch */}
          <rect x="120" y="120" width="80" height="36" fill="#0a3d20" stroke="#22C55E" strokeWidth="1" />
          {/* batter silhouette */}
          <g transform="translate(140 70)">
            <circle cx="20" cy="10" r="8" fill="#22C55E" />
            <rect x="14" y="18" width="12" height="28" rx="4" fill="#22C55E" />
            <line x1="20" y1="46" x2="14" y2="70" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
            <line x1="20" y1="46" x2="26" y2="70" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
            <line x1="22" y1="24" x2="40" y2="20" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
            <line x1="16" y1="24" x2="6" y2="40" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* phone */}
          <g transform="translate(255 80)">
            <rect width="22" height="40" rx="3" fill="#000" stroke="#A1A1AA" strokeWidth="1.5" />
            <rect x="4" y="6" width="14" height="22" fill="#22C55E" opacity="0.4" />
            <text x="11" y="44" textAnchor="middle" fontSize="6" fontFamily="JetBrains Mono" fill="#A1A1AA">PHONE</text>
          </g>
          {/* arrow */}
          <line x1="200" y1="90" x2="252" y2="90" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4 4" />
          <polygon points="252,90 246,87 246,93" fill="#22C55E" />
          <text x="226" y="84" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill="#4ADE80" fontWeight="700" letterSpacing="2">3–4 m · SIDE ON</text>
          {/* label */}
          <text x="160" y="170" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fill="#A1A1AA" letterSpacing="2">FULL BODY IN FRAME</text>
        </svg>
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-[10px] uppercase tracking-widest text-primary font-bold">SIDE-ON VIEW</div>
      </div>

      {/* tips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { icon: Camera, t: 'Side on to the batter', s: 'Not front or behind.' },
          { icon: Ruler, t: '3–4 metres away', s: 'Waist height ideally.' },
          { icon: User, t: 'Full body in frame', s: 'Head to toe, no cropping.' },
          { icon: Sun, t: 'Good lighting', s: 'Avoid harsh backlight.' },
        ].map((tip) => (
          <div key={tip.t} className="flex items-start gap-2 p-2 rounded border border-white/10 bg-white/[0.02]">
            <div className="w-7 h-7 rounded bg-primary/10 border border-primary/30 flex items-center justify-center">
              <tip.icon className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground">{tip.t}</div>
              <div className="text-[10px] text-muted-foreground">{tip.s}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onContinue}
        data-testid="setup-continue-btn"
        className="w-full py-2.5 rounded bg-primary text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-primary/90"
      >
        CONTINUE
      </button>
    </div>
  );
}
