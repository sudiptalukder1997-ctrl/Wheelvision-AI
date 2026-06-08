import axios from 'axios';

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const RUN_COLORS = {
  0: '#6B7280',
  1: '#06B6D4',
  2: '#22C55E',
  3: '#EAB308',
  4: '#F97316',
  6: '#A855F7',
};

export const SHOT_TYPES = ['Drive', 'Pull', 'Cut', 'Sweep', 'Flick', 'Defend'];
export const RUN_VALUES = [0, 1, 2, 3, 4, 6];

// Map a (shotType, batterHand) to a base angle in degrees on the wagon wheel.
// 0° = straight (12 o'clock), positive = clockwise toward off side for RH batter.
// We use SVG coordinates where x grows right and y grows down.
// For RH batter facing up: off side is to the left, leg side to the right.
export function shotTypeToAngle(shotType, batterHand = 'RH') {
  // Angles measured clockwise from straight up (12 o'clock).
  // For RH: off side = -90 (left), leg side = +90 (right).
  let base;
  switch (shotType) {
    case 'Drive': base = 0; break;        // straight
    case 'Pull': base = 80; break;        // leg side square
    case 'Cut': base = -80; break;        // off side square (point)
    case 'Sweep': base = 130; break;      // fine leg / square leg
    case 'Flick': base = 60; break;       // mid wicket
    case 'Defend': base = 0; break;       // back to bowler
    default: base = 0;
  }
  // mirror for LH batter
  if (batterHand === 'LH') base = -base;
  // jitter so multiple shots of same type don't overlap exactly
  const jitter = (Math.random() - 0.5) * 30;
  return base + jitter;
}

export function angleToXY(angleDeg, distance) {
  // distance: 0..1 from centre to boundary
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 because 0deg = up
  return { x: 0.5 + (distance * 0.48) * Math.cos(rad), y: 0.5 + (distance * 0.48) * Math.sin(rad) };
}

export function runsToDistance(runs, shotType) {
  if (runs === 0) return shotType === 'Defend' ? 0.18 : 0.28;
  if (runs === 1) return 0.45;
  if (runs === 2) return 0.62;
  if (runs === 3) return 0.78;
  if (runs === 4) return 0.98;
  if (runs === 6) return 1.02;
  return 0.5;
}
