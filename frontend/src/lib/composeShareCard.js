// Compose branded shareable images from freeze frames captured by the video analyser.
// Returns a Blob ready for the Web Share API, or a data URL fallback for download.

const BRAND = {
  primary: '#22C55E',
  primaryDark: '#054322',
  bg: '#000000',
  white: '#fafafa',
  muted: '#A1A1AA',
  font: '"JetBrains Mono", ui-monospace, monospace',
};

// Single-shot portrait 1080x1350 (Instagram 4:5)
export async function composeSingleCard(shot, { batterName = 'WHEELVISION AI' } = {}) {
  const W = 1080, H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // backdrop
  paintBackdrop(ctx, W, H);

  // brand header strip
  paintHeader(ctx, W, 0, batterName);

  // freeze frame (centered, 960x540)
  const imgW = 960, imgH = 540;
  const imgX = (W - imgW) / 2, imgY = 160;
  ctx.save();
  ctx.shadowColor = BRAND.primary;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = BRAND.primary;
  ctx.lineWidth = 3;
  ctx.strokeRect(imgX, imgY, imgW, imgH);
  ctx.restore();
  if (shot.freezeUrl) {
    try {
      const img = await loadImage(shot.freezeUrl);
      ctx.drawImage(img, imgX, imgY, imgW, imgH);
    } catch (err) { console.warn('freeze image load failed', err); }
  } else {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(imgX, imgY, imgW, imgH);
  }

  // big run badge top-right
  paintRunBadge(ctx, shot.runs ?? 0, imgX + imgW - 100, imgY + 32);

  // shot name + confidence
  ctx.fillStyle = BRAND.white;
  ctx.font = `900 76px ${BRAND.font}`;
  ctx.shadowColor = BRAND.primary; ctx.shadowBlur = 16;
  ctx.fillText((shot.shotType || 'SHOT').toUpperCase(), 60, 820);
  ctx.shadowBlur = 0;

  ctx.fillStyle = BRAND.primary;
  ctx.font = `700 36px ${BRAND.font}`;
  ctx.fillText(`${shot.confidence || 0}% AI CONFIDENCE`, 60, 870);

  // stat row — wrist, elbow, lean, velocity
  const f = shot.features || {};
  paintStatRow(ctx, 60, 950, W - 120, [
    { label: 'WRIST', val: `${Math.round(f.wrist_angle ?? 0)}°` },
    { label: 'ELBOW', val: `${Math.round(f.elbow_angle ?? 0)}°` },
    { label: 'LEAN', val: `${Math.round(f.body_lean ?? 0)}°` },
    { label: 'VELOCITY', val: `${Math.round(shot.velocity ?? 0)}` },
  ]);

  // wagon-wheel mini diagram
  paintMiniWagonWheel(ctx, W / 2, 1190, 110, shot.wagonAngle ?? 0, shot.runs ?? 0);

  // footer
  paintFooter(ctx, W, H);

  return canvasToBlob(canvas);
}

// 6-up square composite 1080x1080 (Instagram square)
export async function composeBestSixGrid(shots, { batterName = 'WHEELVISION AI', sessionStats } = {}) {
  const W = 1080, H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  paintBackdrop(ctx, W, H);
  paintHeader(ctx, W, 0, batterName, { title: 'BEST SIX · HIGHLIGHTS' });

  // grid 3x2
  const cellW = 320, cellH = 200;
  const gap = 16;
  const startX = (W - (cellW * 3 + gap * 2)) / 2;
  const startY = 180;
  for (let i = 0; i < 6; i++) {
    const r = Math.floor(i / 3), c = i % 3;
    const x = startX + c * (cellW + gap);
    const y = startY + r * (cellH + gap + 60);
    const shot = shots[i];
    if (!shot) {
      ctx.fillStyle = '#0a0a0a';
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeRect(x, y, cellW, cellH);
      continue;
    }
    if (shot.freezeUrl) {
      try {
        const img = await loadImage(shot.freezeUrl);
        ctx.drawImage(img, x, y, cellW, cellH);
      } catch (err) { console.warn('grid image load failed', err); }
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(x, y, cellW, cellH);
    }
    ctx.strokeStyle = BRAND.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellW, cellH);
    // run badge
    paintRunBadge(ctx, shot.runs ?? 0, x + cellW - 56, y + 16, 40);
    // shot label below
    ctx.fillStyle = BRAND.white;
    ctx.font = `700 22px ${BRAND.font}`;
    ctx.fillText((shot.shotType || '').toUpperCase(), x, y + cellH + 32);
    ctx.fillStyle = BRAND.primary;
    ctx.font = `700 16px ${BRAND.font}`;
    ctx.fillText(`${shot.confidence || 0}% · ${Math.round(shot.features?.wrist_angle ?? 0)}°`, x, y + cellH + 54);
  }

  // session stat row at the bottom
  if (sessionStats) {
    paintStatRow(ctx, 60, H - 180, W - 120, [
      { label: 'BALLS', val: `${sessionStats.balls ?? 0}` },
      { label: 'RUNS', val: `${sessionStats.runs ?? 0}` },
      { label: 'S/R', val: `${sessionStats.sr ?? 0}` },
      { label: '6s', val: `${sessionStats.sixes ?? 0}` },
      { label: '4s', val: `${sessionStats.fours ?? 0}` },
    ]);
  }

  paintFooter(ctx, W, H);
  return canvasToBlob(canvas);
}

// ---- paint helpers ----

function paintBackdrop(ctx, W, H) {
  // base
  ctx.fillStyle = BRAND.bg;
  ctx.fillRect(0, 0, W, H);
  // radial glow corners
  const g1 = ctx.createRadialGradient(W * 0.1, 0, 0, W * 0.1, 0, W * 0.6);
  g1.addColorStop(0, 'rgba(34,197,94,0.18)');
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.9, H, 0, W * 0.9, H, W * 0.7);
  g2.addColorStop(0, 'rgba(5,67,34,0.45)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
  // subtle scanlines
  ctx.fillStyle = 'rgba(34,197,94,0.04)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

function paintHeader(ctx, W, _y, name, { title } = {}) {
  // logo block
  ctx.fillStyle = BRAND.primary;
  ctx.fillRect(48, 48, 56, 56);
  ctx.fillStyle = '#000';
  ctx.font = `900 40px ${BRAND.font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('W', 64, 78);
  // name
  ctx.fillStyle = BRAND.white;
  ctx.font = `900 32px ${BRAND.font}`;
  ctx.fillText(name.toUpperCase(), 120, 70);
  ctx.fillStyle = BRAND.muted;
  ctx.font = `700 16px ${BRAND.font}`;
  ctx.fillText(title || 'CRICKET SHOT ANALYSER', 120, 96);
  ctx.textBaseline = 'alphabetic';
  // live dot
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(W - 80, 76, 8, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = BRAND.white;
  ctx.font = `700 16px ${BRAND.font}`;
  ctx.fillText('LIVE', W - 60, 80);
}

function paintRunBadge(ctx, runs, x, y, size = 80) {
  const colors = { 0: '#6B7280', 1: '#06B6D4', 2: '#22C55E', 3: '#EAB308', 4: '#F97316', 6: '#A855F7' };
  const c = colors[runs] || '#22C55E';
  ctx.save();
  ctx.shadowColor = c; ctx.shadowBlur = 18;
  ctx.fillStyle = c;
  ctx.fillRect(x, y, size, size);
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.font = `900 ${Math.round(size * 0.7)}px ${BRAND.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(runs), x + size / 2, y + size / 2 + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function paintStatRow(ctx, x, y, w, stats) {
  const colW = w / stats.length;
  stats.forEach((s, i) => {
    const cx = x + i * colW + colW / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = BRAND.muted;
    ctx.font = `700 18px ${BRAND.font}`;
    ctx.fillText(s.label, cx, y);
    ctx.fillStyle = BRAND.primary;
    ctx.shadowColor = BRAND.primary; ctx.shadowBlur = 12;
    ctx.font = `900 48px ${BRAND.font}`;
    ctx.fillText(s.val, cx, y + 48);
    ctx.shadowBlur = 0;
  });
  ctx.textAlign = 'left';
}

function paintMiniWagonWheel(ctx, cx, cy, r, angleDeg, runs) {
  const colors = { 0: '#6B7280', 1: '#06B6D4', 2: '#22C55E', 3: '#EAB308', 4: '#F97316', 6: '#A855F7' };
  // oval
  ctx.save();
  ctx.strokeStyle = BRAND.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.95, 0, 0, Math.PI * 2);
  ctx.stroke();
  // infield dashed
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.45, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // pitch
  ctx.fillStyle = BRAND.primaryDark;
  ctx.fillRect(cx - 5, cy - 24, 10, 48);
  ctx.strokeRect(cx - 5, cy - 24, 10, 48);
  // shot line
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const tx = cx + r * 0.95 * Math.cos(rad);
  const ty = cy + r * 0.95 * Math.sin(rad);
  const color = colors[runs] || '#22C55E';
  ctx.strokeStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function paintFooter(ctx, W, H) {
  ctx.fillStyle = BRAND.muted;
  ctx.font = `700 18px ${BRAND.font}`;
  ctx.textAlign = 'center';
  ctx.fillText('WHEELVISION.AI · CRICKET SHOT ANALYSER', W / 2, H - 36);
  ctx.textAlign = 'left';
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
  });
}

// Share helper — uses Web Share API where possible, otherwise downloads.
export async function shareImageBlob(blob, { filename = 'wheelvision.jpg', text = 'My WheelVision AI session' } = {}) {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'WheelVision AI' });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      console.warn('share failed, falling back to download', err);
    }
  }
  // fallback download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
