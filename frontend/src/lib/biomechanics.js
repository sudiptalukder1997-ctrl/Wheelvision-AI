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
    left_wrist_pos: lWrist ? { x: lWrist.x, y: lWrist.y, score: lWrist.score } : null,
    right_wrist_pos: rWrist ? { x: rWrist.x, y: rWrist.y, score: rWrist.score } : null,
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

// Detect a real batting swing in the recent history. Strict filters:
//   1. BOTH wrists must move rapidly together (not just one arm).
//   2. Velocity threshold raised 3× from prior naive default.
//   3. "Ready position" — at least 8 prior frames must be relatively still BEFORE the swing.
//   4. ≥15° wrist angle change within the swing window.
//   5. Rapid accel→decel signature.
// `velocityThreshold` here is the new (already 3×) value passed in by the caller.
export function detectSwing(historyFrames, velocityThreshold = 12.0, opts = {}) {
  const READY_FRAMES = opts.readyFrames ?? 8;
  const SWING_WIN = 8;
  if (!historyFrames || historyFrames.length < READY_FRAMES + SWING_WIN) return null;
  const recent = historyFrames.slice(-SWING_WIN);
  const ready = historyFrames.slice(-(READY_FRAMES + SWING_WIN), -SWING_WIN);

  // ------- READY POSITION CHECK -------
  // average wrist velocity in the ready window must be low (still standing).
  const readyVels = [];
  for (let i = 1; i < ready.length; i++) {
    const a = ready[i - 1]?.wrist_pos;
    const b = ready[i]?.wrist_pos;
    if (!a || !b) continue;
    readyVels.push(Math.hypot(b.x - a.x, b.y - a.y));
  }
  if (readyVels.length < READY_FRAMES - 2) return null;
  const meanReadyVel = readyVels.reduce((s, v) => s + v, 0) / readyVels.length;
  // "Still" = mean ready velocity is at most ~25% of the swing threshold.
  if (meanReadyVel * 100 > velocityThreshold * 0.25) return null;

  // ------- WRIST ANGLE CHANGE -------
  const angles = recent.map((f) => f.wrist_angle).filter((v) => v != null);
  if (angles.length < 6) return null;
  if (Math.max(...angles) - Math.min(...angles) < 15) return null;

  // ------- BOTH WRISTS MOVE RAPIDLY (same time) -------
  const lVels = [];
  const rVels = [];
  for (let i = 1; i < recent.length; i++) {
    const la = recent[i - 1]?.left_wrist_pos;
    const lb = recent[i]?.left_wrist_pos;
    const ra = recent[i - 1]?.right_wrist_pos;
    const rb = recent[i]?.right_wrist_pos;
    if (la && lb) lVels.push(Math.hypot(lb.x - la.x, lb.y - la.y));
    if (ra && rb) rVels.push(Math.hypot(rb.x - ra.x, rb.y - ra.y));
  }
  if (lVels.length < 4 || rVels.length < 4) return null;
  const peakL = Math.max(...lVels);
  const peakR = Math.max(...rVels);
  // both peaks must exceed half the velocity threshold (so they're both moving)
  const halfThresh = velocityThreshold / 2;
  if (peakL * 100 < halfThresh || peakR * 100 < halfThresh) return null;
  // both peaks must occur in the same half of the window (synchronised swing).
  const peakIdxL = lVels.indexOf(peakL);
  const peakIdxR = rVels.indexOf(peakR);
  if (Math.abs(peakIdxL - peakIdxR) > 2) return null;

  // ------- COMBINED VELOCITY THRESHOLD (3× harsher than legacy) -------
  // Use the dominant wrist for velocity profile (legacy behaviour expected by callers).
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

  // ------- ACCEL → DECEL -------
  const afterPeak = vels.slice(peakIdx + 1);
  if (afterPeak.length < 1) return null;
  if (!afterPeak.some((v) => v < peak * 0.5)) return null;

  const peakFrame = recent[peakIdx + 1] || recent[recent.length - 1];
  const motion = computeMotion(recent);
  return {
    peak_frame: peakFrame,
    motion,
    angle_change: Math.max(...angles) - Math.min(...angles),
    both_wrist_peaks: { left: peakL * 100, right: peakR * 100 },
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

export function classifyShot({ wrist_angle, elbow_angle, body_lean, velocity, upward, trajectory, personalThresholds, cameraView = 'side', batterHand = 'RH' }) {
  // FRONT-ON view: the swing direction on screen maps directly to the wagon-wheel angle.
  // For RH batter: screen-right (positive dx in trajectory) is leg side; left is off side.
  // For LH batter: flipped.
  if (cameraView === 'front') {
    return classifyFrontOn({ trajectory, velocity, upward, elbow_angle, body_lean, batterHand });
  }
  // SIDE-ON view: existing wrist-angle based classifier
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

  // Realistic cricket runs mapping based on the new (3× higher) velocity scale.
  // Target distribution: ~35-40% dots, 25-30% 1-2s, 15-20% 3-4s, ≤10% 6s.
  // Default to 1 run if classifier confidence < 70.
  const runs = pickRunsFromVelocity({ velocity, upward, confidence, defendIntent: best?.name === 'Defend' });

  return {
    shotType: best?.name || 'Unknown',
    wagonAngle: best?.wagon ?? 0,
    confidence: Math.round(confidence),
    runs,
    footPosition,
    upward,
  };
}

// Shared run-bucket function — calibrated for the new 3× velocity scale.
// velocity is in our "px-per-frame * 100" units (same as before).
export function pickRunsFromVelocity({ velocity, upward, confidence, defendIntent }) {
  // Default to a single when AI confidence is low — biases toward realistic 1-run.
  if ((confidence ?? 0) < 70 && !defendIntent) return 1;
  // Brand-new realistic thresholds (was: >3 → 1, >7 → 2, >12 → 3, >18 → 4). Now stricter:
  if (velocity > 36 && upward) return 6;        // maximum + upward = six
  if (velocity > 30) return 4;                  // fast wrist speed = four
  if (velocity > 20) return 2;                  // medium = two
  if (velocity > 10) return 1;                  // slow = single
  if (defendIntent) return 0;
  // very slow / minimal swing = dot
  return 0;
}

// Front-on classifier — uses screen-space trajectory as the primary direction signal.
function classifyFrontOn({ trajectory, velocity, upward, elbow_angle, body_lean, batterHand }) {
  // Our trajectory convention: 0° = up, +90° = right (screen), -90° = left (screen).
  // RH batter front-on: screen-right = leg side (positive wagon), screen-left = off side (negative wagon).
  // LH batter: mirror — flip sign of trajectory.
  const flip = batterHand === 'LH' ? -1 : 1;
  const t = ((trajectory ?? 0) * flip);
  // Wagon angle: clamp to [-180,180]
  let wagon = t;
  if (wagon > 180) wagon -= 360;
  if (wagon < -180) wagon += 360;

  // Pick shot type from wagon zone + foot + upward
  const footPosition = body_lean > 8 ? 'front' : body_lean < -4 ? 'back' : 'any';
  let shotType = 'Drive';
  const absW = Math.abs(wagon);

  if (upward && absW > 60) {
    shotType = wagon > 0 ? 'Hook' : 'Lofted Off';
  } else if (upward) {
    shotType = wagon > 0 ? 'Lofted On' : 'Lofted Off';
  } else if (absW < 25) {
    shotType = footPosition === 'back' ? 'Defend' : 'Straight Drive';
  } else if (wagon >= 25 && wagon < 65) {
    // leg side in front of square
    shotType = footPosition === 'front' ? 'On Drive' : 'Flick';
  } else if (wagon >= 65 && wagon < 120) {
    // square leg
    shotType = footPosition === 'back' ? 'Pull' : 'Flick';
  } else if (wagon >= 120) {
    shotType = 'Glance';
  } else if (wagon <= -25 && wagon > -65) {
    shotType = footPosition === 'front' ? 'Cover Drive' : 'Off Drive';
  } else if (wagon <= -65 && wagon > -120) {
    shotType = footPosition === 'back' ? 'Square Cut' : 'Cut';
  } else if (wagon <= -120) {
    shotType = 'Cut';
  }

  // Runs — use the shared realistic mapping.
  // Confidence is computed below; default to 1 when uncertain.
  const directional = Math.min(1, absW / 90);
  const speedy = Math.min(1, velocity / 28);
  const conf = Math.max(20, Math.min(100, Math.round((directional * 0.55 + speedy * 0.45) * 100)));
  const runs = pickRunsFromVelocity({ velocity, upward, confidence: conf, defendIntent: shotType === 'Defend' });

  return {
    shotType,
    wagonAngle: Math.round(wagon),
    confidence: conf,
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

// ---------- Realism validator ----------
// Given a list of shots, return an array of warnings that should be shown in the review UI.
// Each warning has { code, severity ('warn' | 'error'), message }.
export function realismCheck(shots, { videoDurationSec } = {}) {
  const warnings = [];
  const n = shots.length;
  if (n === 0) return warnings;
  const totalRuns = shots.reduce((a, s) => a + (s.runs || 0), 0);
  const sr = (totalRuns / n) * 100;
  const dots = shots.filter((s) => (s.runs || 0) === 0).length;
  const boundaries = shots.filter((s) => (s.runs || 0) >= 4).length;
  const dotPct = (dots / n) * 100;
  const boundaryPct = (boundaries / n) * 100;

  if (sr > 200) {
    warnings.push({
      code: 'high_strike_rate',
      severity: 'warn',
      message: '⚠️ Unusual results detected. The AI may have miscounted shots due to camera angle or lighting. Would you like to review and correct the detected shots?',
    });
  }
  if (dotPct < 20 && n >= 6) {
    warnings.push({
      code: 'low_dot_pct',
      severity: 'warn',
      message: '⚠️ Very few dot balls detected — this may indicate over-detection. Please review.',
    });
  }
  if (boundaryPct > 50 && n >= 6) {
    warnings.push({
      code: 'too_many_boundaries',
      severity: 'warn',
      message: '⚠️ More than 50% of shots are boundaries — please verify these detections are real.',
    });
  }
  if (videoDurationSec && videoDurationSec > 0) {
    const perMin = (n / (videoDurationSec / 60));
    if (perMin > 15) {
      warnings.push({
        code: 'too_many_per_minute',
        severity: 'warn',
        message: `⚠️ ${perMin.toFixed(1)} shots per minute detected — too many. Please check camera angle and lighting.`,
      });
    }
  }
  return warnings;
}
