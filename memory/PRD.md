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

DEFERRED (Phase 2):
- MoveNet client-side video shot detection.
- Live camera mode w/ swing detection.
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
