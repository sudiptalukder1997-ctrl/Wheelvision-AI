import React, { useRef } from 'react';
import { RUN_COLORS, angleToXY, runsToDistance } from '@/lib/api';
import { TID } from '@/constants/testIds';

// Field positions in degrees (clockwise from straight, RH batter perspective):
// straight 0, mid off -45, cover -75, point -100, third man -140 (behind),
// fine leg 140 (leg side behind), square leg 100, mid wicket 65, mid on 45.
const FIELD_POSITIONS_RH = [
  { name: 'STRAIGHT', deg: 0, r: 0.95 },
  { name: 'MID OFF', deg: -45, r: 0.85 },
  { name: 'COVER', deg: -75, r: 0.95 },
  { name: 'POINT', deg: -100, r: 0.95 },
  { name: 'THIRD MAN', deg: -140, r: 0.92 },
  { name: 'FINE LEG', deg: 140, r: 0.92 },
  { name: 'SQUARE LEG', deg: 100, r: 0.95 },
  { name: 'MID WICKET', deg: 65, r: 0.95 },
  { name: 'MID ON', deg: 45, r: 0.85 },
];

function rotPoint(cx, cy, deg, dist) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + dist * Math.cos(rad), y: cy + dist * Math.sin(rad) };
}

export default function WagonWheel({ shots, batterHand = 'RH', filter, onFieldClick, selectedShotType }) {
  const svgRef = useRef(null);
  const W = 360, H = 360;
  const cx = W / 2, cy = H / 2;
  const ovalRx = W * 0.46;
  const ovalRy = H * 0.46;
  const innerR = W * 0.22; // 30-yard circle (dashed)

  const flipForLH = batterHand === 'LH';
  const positions = FIELD_POSITIONS_RH.map((p) => ({
    ...p,
    deg: flipForLH ? -p.deg : p.deg,
  }));

  const handleClick = (e) => {
    if (!onFieldClick) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    // angle from centre
    const dx = p.x - cx;
    const dy = p.y - cy;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90; // 0 = up
    const norm = ((angle + 540) % 360) - 180; // -180..180
    const dist = Math.min(1, Math.sqrt(dx * dx + dy * dy) / ovalRx);
    onFieldClick({ angle: norm, distance: dist });
  };

  const filteredShots = filter == null ? shots : shots.filter((s) => s.runs === filter);

  return (
    <div className="relative w-full" data-testid={TID.wagonWheel}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none touch-none"
        onClick={handleClick}
        style={{ cursor: onFieldClick ? 'crosshair' : 'default' }}
      >
        <defs>
          <radialGradient id="fieldGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#052612" />
            <stop offset="60%" stopColor="#031809" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* boundary oval */}
        <ellipse cx={cx} cy={cy} rx={ovalRx} ry={ovalRy} fill="url(#fieldGrad)" stroke="#22C55E" strokeWidth="1.5" opacity="0.85" />

        {/* infield 30-yard dashed */}
        <ellipse cx={cx} cy={cy} rx={innerR * 1.05} ry={innerR} fill="none" stroke="#22C55E" strokeWidth="1" strokeDasharray="4 5" opacity="0.5" />

        {/* off / leg side labels */}
        <text x={cx - ovalRx + 8} y={cy + 4} fill="#4ADE80" fontSize="9" fontWeight="bold" letterSpacing="2" fontFamily="JetBrains Mono">{flipForLH ? 'LEG' : 'OFF'}</text>
        <text x={cx + ovalRx - 28} y={cy + 4} fill="#4ADE80" fontSize="9" fontWeight="bold" letterSpacing="2" fontFamily="JetBrains Mono">{flipForLH ? 'OFF' : 'LEG'}</text>

        {/* pitch */}
        <rect x={cx - 9} y={cy - 36} width="18" height="72" fill="#0a3d20" stroke="#22C55E" strokeWidth="1" opacity="0.95" />
        {/* stumps */}
        {[-3, 0, 3].map((dx, i) => (
          <line key={`bs-${i}`} x1={cx + dx} y1={cy - 36} x2={cx + dx} y2={cy - 31} stroke="#fff" strokeWidth="1" />
        ))}
        {[-3, 0, 3].map((dx, i) => (
          <line key={`ts-${i}`} x1={cx + dx} y1={cy + 31} x2={cx + dx} y2={cy + 36} stroke="#fff" strokeWidth="1" />
        ))}
        {/* batter circle */}
        <circle cx={cx} cy={cy + 24} r={3} fill="#22C55E" filter="url(#glow)" />

        {/* field position labels */}
        {positions.map((p) => {
          const pt = rotPoint(cx, cy, p.deg, ovalRx * p.r);
          return (
            <text
              key={p.name}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#A1A1AA"
              fontSize="8"
              fontFamily="JetBrains Mono"
              fontWeight="700"
              letterSpacing="1.5"
            >
              {p.name}
            </text>
          );
        })}

        {/* shot lines */}
        {filteredShots.map((s, i) => {
          const target = rotPoint(cx, cy, s.angle || 0, ovalRx * runsToDistance(s.runs, s.shot_type));
          const color = RUN_COLORS[s.runs] || '#888';
          const isBoundary = s.runs === 4 || s.runs === 6;
          return (
            <g key={s.id || i} className="animate-draw-line">
              <line
                x1={cx}
                y1={cy}
                x2={target.x}
                y2={target.y}
                stroke={color}
                strokeWidth={isBoundary ? 2.2 : 1.4}
                strokeLinecap="round"
                opacity={isBoundary ? 1 : 0.85}
                filter={isBoundary ? 'url(#glow)' : undefined}
              />
              <circle cx={target.x} cy={target.y} r={isBoundary ? 4 : 2.6} fill={color} filter={isBoundary ? 'url(#glow)' : undefined} />
              {isBoundary && (
                <text x={target.x} y={target.y - 7} textAnchor="middle" fontSize="10" fontWeight="900" fill={color} fontFamily="JetBrains Mono" filter="url(#glow)">
                  {s.runs}
                </text>
              )}
            </g>
          );
        })}

        {/* batter hand indicator */}
        <text x={cx} y={H - 6} textAnchor="middle" fill="#4ADE80" fontSize="9" fontFamily="JetBrains Mono" fontWeight="700" letterSpacing="2">
          {batterHand} BATTER {selectedShotType ? `· ${selectedShotType.toUpperCase()}` : ''}
        </text>
      </svg>
    </div>
  );
}
