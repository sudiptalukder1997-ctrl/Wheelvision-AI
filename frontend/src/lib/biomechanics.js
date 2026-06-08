// Biomechanics engine — pure functions to convert pose keypoints + velocities into a predicted shot.
// All angles are in degrees; wagon-wheel angle uses our convention: 0° = straight (12 o'clock),
// negative = off side (for RH batter, left half), positive = leg side (right half).

export const KEYPOINT_INDEX = {
  nose: 0,
  left_eye: 1, right_eye: 2, left_ear: 3, right_ear: 4,
  left_shoulder: 5, right_shoulder: 6,
  left_elbow: 7, right_elbow: 8,
  left_wrist: 9, right_wrist: 10,
  left_hip: 11, right_hip: 12,
  left_knee: 13, right_knee: 14,
  left_ankle: 15, right_ankle: 16,
};

const TRACKED = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
];

export function pickKeypoint(kps, name) {
  const k = kps[KEYPOINT_INDEX[name]];
  if (!k) return null;
  return { x: k.x, y: k.y, score: k.score ?? 0 };
}

export function distance(a, b) {
  if (!a || !b) return 0;
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Angle of vector (b - a) in degrees, 0° = up (-y), clockwise positive.
export function vectorAngle(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // 0 = straight up. atan2 with -dy gives upward as positive.
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return deg;
}

// Interior angle at vertex b between a-b-c (in degrees, 0..180)
export function jointAngle(a, b, c) {
  if (!a || !b || !c) return 0;
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const n1 = Math.hypot(v1.x, v1.y);
  const n2 = Math.hypot(v2.x, v2.y);
  if (!n1 || !n2) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// Compute biomech features from keypoints array (TensorFlow pose-detection output).
// dominantSide picks the wrist that is moving most (caller can override).
export function computeFeatures(keypoints, batterHand = 'RH') {
  const lShoulder = pickKeypoint(keypoints, 'left_shoulder');
  const rShoulder = pickKeypoint(keypoints, 'right_shoulder');
  const lElbow = pickKeypoint(keypoints, 'left_elbow');
  const rElbow = pickKeypoint(keypoints, 'right_elbow');
  const lWrist = pickKeypoint(keypoints, 'left_wrist');
  const rWrist = pickKeypoint(keypoints, 'right_wrist');
  const lHip = pickKeypoint(keypoints, 'left_hip');
  const rHip = pickKeypoint(keypoints, 'right_hip');
  const nose = pickKeypoint(keypoints, 'nose');

  const midShoulder = (lShoulder && rShoulder) ? {
    x: (lShoulder.x + rShoulder.x) / 2,
    y: (lShoulder.y + rShoulder.y) / 2,
  } : null;
  const midHip = (lHip && rHip) ? {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2,
  } : null;

  // body lean: angle of hip->shoulder line vs vertical (0° = upright; >0 leaning forward in image)
  const bodyLean = vectorAngle(midHip, midShoulder);

  // shoulder rotation: angle of shoulder line vs horizontal
  const shoulderRotation = (lShoulder && rShoulder)
    ? (Math.atan2(rShoulder.y - lShoulder.y, rShoulder.x - lShoulder.x) * 180) / Math.PI
    : 0;

  // pick dominant wrist (the one with higher score)
  const wrist = (rWrist?.score ?? 0) >= (lWrist?.score ?? 0) ? rWrist : lWrist;
  const elbow = (rWrist?.score ?? 0) >= (lWrist?.score ?? 0) ? rElbow : lElbow;
  const shoulder = (rWrist?.score ?? 0) >= (lWrist?.score ?? 0) ? rShoulder : lShoulder;

  // wrist angle from shoulder->wrist vector (0° = up)
  const wristAngle = vectorAngle(shoulder, wrist);
  // elbow extension angle (180° = fully extended)
  const elbowAngle = jointAngle(shoulder, elbow, wrist);

  // confidence: mean score across tracked keypoints
  const tracked = TRACKED.map((n) => pickKeypoint(keypoints, n));
  const validScores = tracked.filter(Boolean).map((k) => k.score);
  const keypointConfidence = validScores.length
    ? (validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0;

  return {
    wrist_angle: roundTo(wristAngle, 1),
    elbow_angle: roundTo(elbowAngle, 1),
    shoulder_rotation: roundTo(shoulderRotation, 1),
    body_lean: roundTo(bodyLean, 1),
    nose_y: nose?.y ?? null,
    wrist_pos: wrist ? { x: wrist.x, y: wrist.y } : null,
    keypoint_confidence: roundTo(keypointConfidence, 3),
    batter_hand: batterHand,
  };
}

function roundTo(n, d) { const p = 10 ** d; return Math.round(n * p) / p; }

// Frame-by-frame velocity tracking — caller passes in a circular buffer of last N feature frames.
// Returns wrist velocity & trajectory angle.
export function computeMotion(historyFrames) {
  if (!historyFrames || historyFrames.length < 2) return { wrist_velocity: 0, trajectory: 0, upward: false };
  const last = historyFrames[historyFrames.length - 1];
  const first = historyFrames[0];
  if (!last?.wrist_pos || !first?.wrist_pos) return { wrist_velocity: 0, trajectory: 0, upward: false };
  const dx = last.wrist_pos.x - first.wrist_pos.x;
  const dy = last.wrist_pos.y - first.wrist_pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dtFrames = historyFrames.length;
  const vel = dist / Math.max(1, dtFrames);
  const trajectory = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const upward = dy < -Math.abs(dx) * 0.4; // significant upward component
  return { wrist_velocity: roundTo(vel * 100, 2), trajectory: roundTo(trajectory, 1), upward };
}

// Detect a swing in the recent history: needs rapid acceleration followed by deceleration
// AND >= 15° wrist position change in <=8 consecutive frames.
export function detectSwing(historyFrames, velocityThreshold = 4.0) {
  if (!historyFrames || historyFrames.length < 8) return null;
  const recent = historyFrames.slice(-8);
  const angles = recent.map((f) => f.wrist_angle).filter((v) => v != null);
  if (angles.length < 6) return null;
  const minA = Math.min(...angles);
  const maxA = Math.max(...angles);
  if (maxA - minA < 15) return null;

  // velocities per pair
  const vels = [];
  for (let i = 1; i < recent.length; i++) {
    const a = recent[i - 1]?.wrist_pos;
    const b = recent[i]?.wrist_pos;
    if (!a || !b) continue;
    vels.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  if (vels.length < 4) return null;
  const peakIdx = vels.indexOf(Math.max(...vels));
  const peak = vels[peakIdx];
  if (peak * 100 < velocityThreshold) return null;
  // Need decel after peak: at least one later velocity must be < peak * 0.5
  const afterPeak = vels.slice(peakIdx + 1);
  if (afterPeak.length < 1) return null;
  const decelerated = afterPeak.some((v) => v < peak * 0.5);
  if (!decelerated) return null;

  // Compute aggregated features at the peak frame
  const peakFrame = recent[peakIdx + 1] || recent[recent.length - 1];
  const motion = computeMotion(recent);
  return {
    peak_frame: peakFrame,
    motion,
    angle_change: maxA - minA,
  };
}

// Classify shot from biomechanical signals — returns {shotType, wagonAngle, confidence, runs}
// Uses default thresholds; if personalThresholds are provided, they override.
const TWO_PI = 360;

function normAngle(a) {
  let x = a % TWO_PI;
  if (x > 180) x -= TWO_PI;
  if (x < -180) x += TWO_PI;
  return x;
}

const SHOT_MAP = [
  // name, wrist range (normAngle), footPositionPref, wagonAngle base, requireHigh, requireUpward
  { name: 'Straight Drive', minA: -30, maxA: 30, foot: 'front', wagon: 0,    high: false, up: false },
  { name: 'Cover Drive',    minA: 30,  maxA: 70, foot: 'front', wagon: 45,   high: false, up: false },
  { name: 'Off Drive',      minA: 10,  maxA: 30, foot: 'front', wagon: 20,   high: false, up: false },
  { name: 'On Drive',       minA: -50, maxA: -10, foot: 'front', wagon: -30, high: false, up: false },
  { name: 'Lofted Off',     minA: 70,  maxA: 110, foot: 'front', wagon: 75,  high: true,  up: true },
  { name: 'Lofted On',      minA: -110, maxA: -70, foot: 'front', wagon: -75, high: true,  up: true },
  { name: 'Cut',            minA: 30,  maxA: 80, foot: 'back',  wagon: 85,   high: false, up: false },
  { name: 'Square Cut',     minA: 70,  maxA: 110, foot: 'back', wagon: 95,   high: false, up: false },
  { name: 'Flick',          minA: -80, maxA: -30, foot: 'back', wagon: -50,  high: false, up: false },
  { name: 'Glance',         minA: -100, maxA: -50, foot: 'back', wagon: -130, high: false, up: false },
  { name: 'Pull',           minA: -120, maxA: -60, foot: 'back', wagon: -90, high: false, up: true },
  { name: 'Hook',           minA: -140, maxA: -90, foot: 'back', wagon: -115, high: true,  up: true },
  { name: 'Defend',         minA: -20, maxA: 20, foot: 'any',   wagon: 0,    high: false, up: false },
];

export function classifyShot({ wrist_angle, elbow_angle, body_lean, velocity, upward, personalThresholds }) {
  const wa = normAngle(wrist_angle);
  const footPosition = body_lean > 8 ? 'front' : body_lean < -4 ? 'back' : 'any';

  // Score each shot candidate by closeness to range + foot + upward match
  let best = null;
  let bestScore = -Infinity;
  for (const s of SHOT_MAP) {
    let score = 0;
    // wrist angle proximity
    if (wa >= s.minA && wa <= s.maxA) {
      score += 40;
    } else {
      const dist = Math.min(Math.abs(wa - s.minA), Math.abs(wa - s.maxA));
      score += Math.max(0, 30 - dist);
    }
    // foot position
    if (s.foot === 'any' || s.foot === footPosition) score += 20;
    else score -= 10;
    // upward swing matches
    if (s.up && upward) score += 15;
    if (s.high && elbow_angle > 150) score += 10;
    // personal thresholds nudge
    if (personalThresholds?.[s.name]) {
      const pt = personalThresholds[s.name];
      const dist = Math.abs(normAngle(wa - (pt.wrist_angle ?? s.wagon)));
      if (dist <= (pt.tolerance ?? 20)) score += 20;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }

  // Confidence = normalised best score
  const confidence = Math.max(0, Math.min(100, bestScore));

  // Estimate runs from velocity (px/frame * 100)
  let runs = 0;
  if (velocity > 18) runs = upward ? 6 : 4;
  else if (velocity > 12) runs = 3;
  else if (velocity > 7) runs = 2;
  else if (velocity > 3) runs = 1;
  else runs = 0;

  // Pull/Hook get a slight runs boost (broadcast assumption)
  if ((best?.name === 'Pull' || best?.name === 'Hook') && runs === 3) runs = 4;
  if (best?.name === 'Defend' && runs < 1) runs = 0;

  return {
    shotType: best?.name || 'Unknown',
    wagonAngle: best?.wagon ?? 0,
    confidence: Math.round(confidence),
    runs,
    footPosition,
    upward,
  };
}

// Combine kp confidence + classifier confidence into final % (0-100)
export function finalConfidence(keypointConfidence, classifierConfidence, personalBoost = 0) {
  const a = Math.max(0, Math.min(1, keypointConfidence));
  const b = Math.max(0, Math.min(1, classifierConfidence / 100));
  const blend = 0.45 * a + 0.45 * b + 0.10 * personalBoost;
  return Math.round(Math.max(0, Math.min(1, blend)) * 100);
}

export function confidenceTier(c) {
  if (c >= 90) return { tier: 'green', label: 'AUTO CONFIRM', color: '#22C55E' };
  if (c >= 70) return { tier: 'amber', label: 'CONFIRM?', color: '#EAB308' };
  return { tier: 'red', label: 'PLEASE CORRECT', color: '#EF4444' };
}
