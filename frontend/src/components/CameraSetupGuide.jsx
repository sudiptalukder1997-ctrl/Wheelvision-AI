import React, { useState } from 'react';
import { Camera, Sun, Ruler, User, X, Target } from 'lucide-react';
import { api } from '@/lib/api';

export default function CameraSetupGuide({ onContinue, onCancel, title = 'CAMERA SETUP', initialView = 'side' }) {
  const [view, setView] = useState(initialView === 'front' ? 'front' : 'side');

  const persistAndContinue = async () => {
    try { await api.post('/profile/camera-view', { view }); }
    catch (err) { console.warn('persist camera view failed', err); }
    onContinue?.(view);
  };

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

      {/* view toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          data-testid="view-toggle-side"
          onClick={() => setView('side')}
          className={`p-3 rounded border text-left transition-all ${
            view === 'side' ? 'border-primary bg-primary/10 glow-border' : 'border-white/10 hover:border-primary/40'
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: view === 'side' ? '#22C55E' : '#A1A1AA' }}>VIEW</div>
          <div className="font-display font-black text-base tracking-tighter">SIDE-ON</div>
          <div className="text-[10px] text-muted-foreground">Camera beside batter</div>
        </button>
        <button
          data-testid="view-toggle-front"
          onClick={() => setView('front')}
          className={`p-3 rounded border text-left transition-all ${
            view === 'front' ? 'border-primary bg-primary/10 glow-border' : 'border-white/10 hover:border-primary/40'
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: view === 'front' ? '#22C55E' : '#A1A1AA' }}>VIEW</div>
          <div className="font-display font-black text-base tracking-tighter">FRONT-ON</div>
          <div className="text-[10px] text-muted-foreground">Camera behind bowler</div>
        </button>
      </div>

      {/* diagram */}
      <div className="broadcast-card p-4 relative aspect-[16/9] flex items-center justify-center" data-testid={`setup-diagram-${view}`}>
        {view === 'side' ? <SideOnDiagram /> : <FrontOnDiagram />}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary/20 border border-primary/40 text-[10px] uppercase tracking-widest text-primary font-bold">
          {view === 'side' ? 'SIDE-ON VIEW' : 'FRONT-ON VIEW'}
        </div>
      </div>

      {/* tips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(view === 'side' ? SIDE_TIPS : FRONT_TIPS).map((tip) => (
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

      <div className="text-[10px] text-muted-foreground">
        {view === 'side'
          ? 'Side-on is best for biomechanical angles (wrist / elbow / body lean).'
          : 'Front-on is best for shot direction — wrist sweep across the screen maps straight onto the wagon wheel.'}
      </div>

      <button
        onClick={persistAndContinue}
        data-testid="setup-continue-btn"
        className="w-full py-2.5 rounded bg-primary text-black font-black uppercase tracking-[0.2em] text-xs hover:bg-primary/90"
      >
        CONTINUE WITH {view === 'side' ? 'SIDE-ON' : 'FRONT-ON'}
      </button>
    </div>
  );
}

const SIDE_TIPS = [
  { icon: Camera, t: 'Side on to the batter', s: 'Not front or behind.' },
  { icon: Ruler, t: '3–4 metres away', s: 'Waist height ideally.' },
  { icon: User, t: 'Full body in frame', s: 'Head to toe, no cropping.' },
  { icon: Sun, t: 'Good lighting', s: 'Avoid harsh backlight.' },
];

const FRONT_TIPS = [
  { icon: Target, t: 'Behind the bowler', s: 'Centred on the pitch line.' },
  { icon: Ruler, t: '8–15 metres away', s: 'Safely outside the danger area.' },
  { icon: User, t: 'Full body in frame', s: 'Shoulder + hips visible.' },
  { icon: Sun, t: 'Good lighting', s: 'Avoid harsh backlight.' },
];

function SideOnDiagram() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect x="120" y="120" width="80" height="36" fill="#0a3d20" stroke="#22C55E" strokeWidth="1" />
      <g transform="translate(140 70)">
        <circle cx="20" cy="10" r="8" fill="#22C55E" />
        <rect x="14" y="18" width="12" height="28" rx="4" fill="#22C55E" />
        <line x1="20" y1="46" x2="14" y2="70" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="20" y1="46" x2="26" y2="70" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="22" y1="24" x2="40" y2="20" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="16" y1="24" x2="6" y2="40" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="translate(255 80)">
        <rect width="22" height="40" rx="3" fill="#000" stroke="#A1A1AA" strokeWidth="1.5" />
        <rect x="4" y="6" width="14" height="22" fill="#22C55E" opacity="0.4" />
        <text x="11" y="44" textAnchor="middle" fontSize="6" fontFamily="JetBrains Mono" fill="#A1A1AA">PHONE</text>
      </g>
      <line x1="200" y1="90" x2="252" y2="90" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4 4" />
      <polygon points="252,90 246,87 246,93" fill="#22C55E" />
      <text x="226" y="84" textAnchor="middle" fontSize="7" fontFamily="JetBrains Mono" fill="#4ADE80" fontWeight="700" letterSpacing="2">3–4 m · SIDE ON</text>
      <text x="160" y="170" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fill="#A1A1AA" letterSpacing="2">FULL BODY IN FRAME</text>
    </svg>
  );
}

function FrontOnDiagram() {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      {/* pitch from bowler perspective: narrower at top, wider at bottom */}
      <polygon points="146,40 174,40 200,150 120,150" fill="#0a3d20" stroke="#22C55E" strokeWidth="1" />
      {/* batter (front-facing) */}
      <g transform="translate(160 95)">
        <circle cx="0" cy="-10" r="9" fill="#22C55E" />
        <rect x="-7" y="-1" width="14" height="28" rx="4" fill="#22C55E" />
        <line x1="-5" y1="27" x2="-8" y2="50" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="5" y1="27" x2="8" y2="50" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        {/* arms holding bat across body */}
        <line x1="-5" y1="2" x2="-15" y2="15" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="5" y1="2" x2="15" y2="15" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" />
        <line x1="-15" y1="15" x2="20" y2="38" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* stumps behind */}
      <g transform="translate(155 38)" stroke="#fff" strokeWidth="1.2">
        <line x1="0" y1="0" x2="0" y2="6" />
        <line x1="4" y1="0" x2="4" y2="6" />
        <line x1="8" y1="0" x2="8" y2="6" />
      </g>
      {/* phone (camera) at top */}
      <g transform="translate(150 5)">
        <rect width="22" height="32" rx="3" fill="#000" stroke="#A1A1AA" strokeWidth="1.5" />
        <rect x="4" y="4" width="14" height="18" fill="#22C55E" opacity="0.4" />
        <text x="11" y="36" textAnchor="middle" fontSize="6" fontFamily="JetBrains Mono" fill="#A1A1AA">CAM</text>
      </g>
      {/* line of sight */}
      <line x1="161" y1="38" x2="161" y2="80" stroke="#22C55E" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="180" y="60" fontSize="7" fontFamily="JetBrains Mono" fill="#4ADE80" fontWeight="700" letterSpacing="2">FRONT ON</text>
      {/* off / leg labels */}
      <text x="40" y="100" fontSize="8" fontFamily="JetBrains Mono" fill="#4ADE80" fontWeight="700" letterSpacing="2">OFF</text>
      <text x="270" y="100" fontSize="8" fontFamily="JetBrains Mono" fill="#4ADE80" fontWeight="700" letterSpacing="2">LEG</text>
      {/* arrows showing field direction maps to screen sides */}
      <line x1="120" y1="105" x2="60" y2="105" stroke="#22C55E" strokeWidth="1" strokeDasharray="3 3" />
      <polygon points="60,105 66,102 66,108" fill="#22C55E" />
      <line x1="200" y1="105" x2="260" y2="105" stroke="#22C55E" strokeWidth="1" strokeDasharray="3 3" />
      <polygon points="260,105 254,102 254,108" fill="#22C55E" />
      <text x="160" y="170" textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono" fill="#A1A1AA" letterSpacing="2">CAMERA BEHIND BOWLER · 8–15 m</text>
    </svg>
  );
}
