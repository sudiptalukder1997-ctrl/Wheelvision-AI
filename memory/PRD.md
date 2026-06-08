# WheelVision AI — PRD

## Original Problem Statement
Build a Cricket Batting Analysis web app called WheelVision AI — Cricket Shot Analyser.
Design: pro broadcast feel, dark green/black, monospace, mobile-first PWA.

Full spec (summary):
- Live stats dashboard (balls, runs, SR, 4s, 6s, dots)
- Interactive Wagon Wheel SVG (field positions, infield circle, LH/RH toggle, shot lines color-coded by runs)
- Shot controls (type + runs), filter by run, shot log w/ delete + clear
- Video upload + MoveNet auto-detection (Phase 2)
- Live camera mode w/ pose detection (Phase 2)
- AI coaching (Claude Sonnet 4.5 via Emergent LLM key)
- Session history + progress graphs (Phase 2 for graphs)
- Sharing (web share + report PDF — PDF in Phase 2)
- Coach dashboard (Academy)
- Subscription tiers (Free / Pro £9.99 / Academy £49) via Stripe in GBP
- PWA + offline (basic SW), multi-language (Phase 2)

## Architecture
- Backend: FastAPI + MongoDB + emergentintegrations (LLM + Stripe).
- Auth: Emergent-managed Google OAuth → session_token cookie + Bearer fallback.
- Frontend: React 19 + Tailwind + shadcn/ui + sonner + lucide-react.
- PWA: manifest + minimal service worker.

## User Personas
- Club batter logging shots in nets.
- Cricket coach managing multiple players (Academy).
- Casual fan tracking weekend matches.

## Implementation Status (Phase 1 - Feb 2026)
DONE:
- Backend models + endpoints (auth, sessions, shots, coaching, stripe checkout/status/webhook).
- Frontend pages: Landing, Dashboard, History, Coach, Pricing, PaymentReturn.
- Wagon Wheel SVG with field labels + tap-to-log + RH/LH flip.
- Stats panel, run distribution chart, shot log, coaching panel.
- Stripe £9.99 / £49 monthly checkout (test mode) with success polling.
- PWA: manifest.json + service worker + icons.
- Sign in/out flow via Emergent OAuth.

## Implementation Status (Phase 2 — Biomechanical AI Upgrade, Feb 2026)
DONE:
- MoveNet Thunder pose detection lazy-loaded via @tensorflow-models/pose-detection.
- Biomechanics engine (/lib/biomechanics.js): computeFeatures (wrist_angle, elbow_angle, shoulder_rotation, body_lean, keypoint_confidence), computeMotion (wrist velocity + upward trajectory), detectSwing (15° + 8 frames + decel), classifyShot (front/back foot + wrist_angle → shot + wagon angle + runs), finalConfidence + confidenceTier (green/amber/red).
- LiveCamera: skeleton overlay, ghost silhouette guide, PERFECT POSITION readiness, sensitivity slider, vibration on detect, 90%+ auto-confirm, 4-second confirmation card with CORRECT/EDIT, EditShotSheet quick corrections, MoveNet Thunder via WebGL.
- VideoAnalyzer: upload 1–3 min clip, frame-sampling (stride 5), per-shot freeze frames with skeleton + angles, auto-triggered biomech AI coaching after analysis.
- ConfirmationCard with confidence traffic light + 4-second auto-confirm progress.
- Backend: /api/profile/biomech, /api/predictions/log (recalcs personal_thresholds every 10 corrections), /api/sessions/{id}/coaching/biomech (Claude Sonnet biomech coaching prompt with 5 sections: technical assessment, biomechanical weakness, bowling attack threat, two drills, batting style profile).
- Dashboard: AI accuracy badge ("AI X% · Y preds"), Pro-gated entry points to LiveCamera and VideoAnalyzer (Free users redirect to /pricing).

DEFERRED (Phase 3):
- Multi-language (HI/UR/SI/TA).
- PDF report generation.
- Progress graphs over time.
- Coach inviting players + side-by-side compare.
- Offline shot logging w/ background sync.

## Backlog (Prioritized)
P0:
- End-to-end testing pass (auth, shot CRUD, coaching, Stripe).
P1:
- Progress trend graphs (Recharts) on History.
- Per-clip combined wagon wheel after video upload (when MoveNet ships).
P2:
- MoveNet auto-detection.
- Live camera mode with vibration / bottom sheet.
- Multi-language.
- PDF reports.
- Coach invite + compare.
