"""
WheelVision AI - Cricket Batting Analysis Backend
"""
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

app = FastAPI(title="WheelVision AI API")
api_router = APIRouter(prefix="/api")

# ===================== Models =====================
class Shot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    runs: int
    shot_type: str  # Drive, Pull, Cut, Sweep, Flick, Defend
    x: float  # normalized 0..1 from centre
    y: float
    angle: float = 0.0
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Session(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    name: str = "Session"
    batter_hand: str = "RH"  # RH or LH
    shots: List[Shot] = Field(default_factory=list)
    coaching: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CreateSessionRequest(BaseModel):
    name: Optional[str] = "Session"
    batter_hand: Optional[str] = "RH"

class AddShotRequest(BaseModel):
    runs: int
    shot_type: str
    x: float
    y: float
    angle: float = 0.0

class UpdateSessionRequest(BaseModel):
    name: Optional[str] = None
    batter_hand: Optional[str] = None

class CheckoutRequest(BaseModel):
    tier: str  # 'pro' or 'academy'
    origin_url: str

class BiomechPayload(BaseModel):
    wrist_angle: float = 0.0
    elbow_angle: float = 0.0
    shoulder_rotation: float = 0.0
    wrist_velocity: float = 0.0
    body_lean: float = 0.0
    foot_position: str = "unknown"  # 'front', 'back', 'unknown'

class PredictionLog(BaseModel):
    session_id: Optional[str] = None
    biomech: BiomechPayload
    predicted_direction: str  # shot_type e.g. 'Cover Drive'
    predicted_angle: float = 0.0
    predicted_runs: int = 0
    actual_direction: Optional[str] = None
    actual_angle: Optional[float] = None
    actual_runs: Optional[int] = None
    correct: bool = True
    confidence: float = 0.0

# ===================== Helpers =====================
async def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """Get current user from session_token cookie or Authorization header."""
    session_token = request.cookies.get('session_token')
    if not session_token:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            session_token = auth[7:]
    if not session_token:
        return None
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        return None
    expires_at = session_doc.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    return user_doc

async def require_user(request: Request) -> Dict[str, Any]:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ===================== Auth =====================
@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    """Exchange Emergent session_id for a session_token and create/update user."""
    body = await request.json()
    session_id = body.get('session_id') or request.headers.get('X-Session-ID')
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()
    email = data['email']
    name = data['name']
    picture = data.get('picture', '')
    session_token = data['session_token']

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing['user_id']
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "tier": "free",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user_doc}

@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

@api_router.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    session_token = request.cookies.get('session_token')
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    return {"ok": True}

# ===================== Sessions =====================
@api_router.post("/sessions")
async def create_session(req: CreateSessionRequest, request: Request):
    user = await require_user(request)
    session = Session(user_id=user['user_id'], name=req.name or "Session", batter_hand=req.batter_hand or "RH")
    doc = session.model_dump()
    await db.sessions.insert_one(doc)
    return session

@api_router.get("/sessions")
async def list_sessions(request: Request):
    user = await require_user(request)
    docs = await db.sessions.find({"user_id": user['user_id']}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    user = await require_user(request)
    doc = await db.sessions.find_one({"id": session_id, "user_id": user['user_id']}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Session not found")
    return doc

@api_router.patch("/sessions/{session_id}")
async def update_session(session_id: str, req: UpdateSessionRequest, request: Request):
    user = await require_user(request)
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    updates['updated_at'] = datetime.now(timezone.utc).isoformat()
    result = await db.sessions.update_one(
        {"id": session_id, "user_id": user['user_id']},
        {"$set": updates},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Session not found")
    doc = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    return doc

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    user = await require_user(request)
    await db.sessions.delete_one({"id": session_id, "user_id": user['user_id']})
    return {"ok": True}

# ===================== Shots =====================
@api_router.post("/sessions/{session_id}/shots")
async def add_shot(session_id: str, req: AddShotRequest, request: Request):
    user = await require_user(request)
    # Enforce free tier limit (10 shots) server-side
    sess = await db.sessions.find_one({"id": session_id, "user_id": user['user_id']}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Session not found")
    tier = user.get('tier', 'free')
    if tier == 'free' and len(sess.get('shots', [])) >= 10:
        raise HTTPException(402, "Free tier limit: 10 shots per session. Upgrade to Pro for unlimited shots.")
    shot = Shot(
        runs=req.runs,
        shot_type=req.shot_type,
        x=req.x,
        y=req.y,
        angle=req.angle,
    )
    await db.sessions.update_one(
        {"id": session_id, "user_id": user['user_id']},
        {"$push": {"shots": shot.model_dump()}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return shot

@api_router.delete("/sessions/{session_id}/shots/{shot_id}")
async def delete_shot(session_id: str, shot_id: str, request: Request):
    user = await require_user(request)
    await db.sessions.update_one(
        {"id": session_id, "user_id": user['user_id']},
        {"$pull": {"shots": {"id": shot_id}}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}

@api_router.post("/sessions/{session_id}/shots/clear")
async def clear_shots(session_id: str, request: Request):
    user = await require_user(request)
    await db.sessions.update_one(
        {"id": session_id, "user_id": user['user_id']},
        {"$set": {"shots": [], "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}

# ===================== AI Coaching =====================
@api_router.post("/sessions/{session_id}/coaching")
async def analyze_session(session_id: str, request: Request):
    user = await require_user(request)
    if user.get('tier', 'free') == 'free':
        raise HTTPException(402, "AI Coaching is a Pro feature. Upgrade to unlock.")
    sess = await db.sessions.find_one({"id": session_id, "user_id": user['user_id']}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Session not found")
    shots = sess.get('shots', [])
    if len(shots) < 3:
        raise HTTPException(400, "Need at least 3 shots to analyze.")

    stats = _aggregate_shot_stats(shots)
    prompt = _build_basic_coaching_prompt(sess, shots, stats)
    coaching_text = await _run_llm_coaching(
        session_key=f"coach-{session_id}",
        system_message="You are a world-class cricket batting analyst with a punchy broadcast style.",
        prompt=prompt,
    )

    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"coaching": coaching_text, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"coaching": coaching_text}

def _aggregate_shot_stats(shots: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate per-session stats from a list of shot dicts."""
    total_balls = len(shots)
    total_runs = sum(s.get('runs', 0) for s in shots)
    fours = sum(1 for s in shots if s.get('runs') == 4)
    sixes = sum(1 for s in shots if s.get('runs') == 6)
    dots = sum(1 for s in shots if s.get('runs') == 0)
    sr = (total_runs / total_balls * 100) if total_balls else 0
    by_type: Dict[str, Dict[str, int]] = {}
    for s in shots:
        st = s.get('shot_type', 'Unknown')
        by_type.setdefault(st, {"count": 0, "runs": 0})
        by_type[st]['count'] += 1
        by_type[st]['runs'] += s.get('runs', 0)
    off_runs = sum(s.get('runs', 0) for s in shots if (s.get('angle') or 0) < 0)
    leg_runs = sum(s.get('runs', 0) for s in shots if (s.get('angle') or 0) > 0)
    return {
        "total_balls": total_balls, "total_runs": total_runs, "fours": fours,
        "sixes": sixes, "dots": dots, "sr": sr, "by_type": by_type,
        "off_runs": off_runs, "leg_runs": leg_runs,
        "off_pct": (off_runs / total_runs * 100) if total_runs else 0,
        "leg_pct": (leg_runs / total_runs * 100) if total_runs else 0,
        "top_zone": max(by_type.items(), key=lambda kv: kv[1]['runs'])[0] if by_type else "—",
    }

def _aggregate_biomech_preds(preds: List[Dict[str, Any]]) -> Dict[str, float]:
    """Compute average biomechanical signals across predictions."""
    if not preds:
        return {"avg_wrist": 0.0, "avg_elbow": 0.0, "avg_shoulder": 0.0, "avg_velocity": 0.0, "avg_lean": 0.0}
    n = len(preds)
    def mean(key: str) -> float:
        return sum(p.get('biomech', {}).get(key, 0) for p in preds) / n
    return {
        "avg_wrist": mean('wrist_angle'),
        "avg_elbow": mean('elbow_angle'),
        "avg_shoulder": mean('shoulder_rotation'),
        "avg_velocity": mean('wrist_velocity'),
        "avg_lean": mean('body_lean'),
    }

def _build_basic_coaching_prompt(sess: Dict[str, Any], shots: List[Dict[str, Any]], stats: Dict[str, Any]) -> str:
    breakdown = "\n".join([f"- {k}: {v['count']} shots, {v['runs']} runs" for k, v in stats['by_type'].items()])
    positions = "\n".join([f"- {s['shot_type']} -> angle {s.get('angle', 0):.0f}°, {s['runs']} runs" for s in shots[:50]])
    return (
        f"You are an elite cricket batting coach analyzing a session. Batter is {sess.get('batter_hand', 'RH')}-handed.\n\n"
        f"SESSION STATS:\n"
        f"- Balls faced: {stats['total_balls']}\n"
        f"- Runs: {stats['total_runs']}\n"
        f"- Strike rate: {stats['sr']:.1f}\n"
        f"- 4s: {stats['fours']}, 6s: {stats['sixes']}, Dots: {stats['dots']}\n\n"
        f"SHOT BREAKDOWN BY TYPE:\n{breakdown}\n\n"
        f"FIELD POSITIONS (each shot as angle deg from straight, runs):\n{positions}\n\n"
        "Provide a tight, broadcast-style analysis with EXACTLY these four sections, each headed in CAPS:\n"
        "1) STRONGEST SCORING AREA — name the field zone they dominate.\n"
        "2) WEAKNESS / GAP — name the zone or shot type they avoid or score poorly in.\n"
        "3) ONE TACTICAL RECOMMENDATION — a single, specific action.\n"
        "4) OVERALL ASSESSMENT — 2 short sentences.\n\n"
        "Keep total response under 220 words. Use confident, direct language."
    )

def _build_biomech_coaching_prompt(sess: Dict[str, Any], stats: Dict[str, Any], avgs: Dict[str, float]) -> str:
    breakdown = "\n".join([f"- {k}: {v['count']} shots, {v['runs']} runs" for k, v in stats['by_type'].items()])
    return (
        f"You are an elite cricket batting coach. Analyse this batter's session data.\n\n"
        f"SESSION: {sess.get('name')} · Batter: {sess.get('batter_hand')}-handed\n"
        f"BALLS: {stats['total_balls']} · RUNS: {stats['total_runs']} · SR: {stats['sr']:.1f} · 4s: {stats['fours']} · 6s: {stats['sixes']}\n"
        f"OFF-SIDE: {stats['off_pct']:.0f}% of runs · LEG-SIDE: {stats['leg_pct']:.0f}% of runs\n"
        f"MOST PRODUCTIVE ZONE / SHOT: {stats['top_zone']}\n\n"
        f"BIOMECHANICAL AVERAGES (from MoveNet Thunder pose tracking):\n"
        f"- avg wrist angle at impact: {avgs['avg_wrist']:.1f}°\n"
        f"- avg elbow angle: {avgs['avg_elbow']:.1f}° (extension)\n"
        f"- avg shoulder rotation: {avgs['avg_shoulder']:.1f}°\n"
        f"- avg wrist velocity: {avgs['avg_velocity']:.1f}\n"
        f"- avg body lean (hip-shoulder line): {avgs['avg_lean']:.1f}°\n\n"
        f"SHOT BREAKDOWN:\n{breakdown}\n\n"
        "Provide a full coaching report with EXACTLY these five sections (each headed in CAPS):\n"
        "1) TECHNICAL ASSESSMENT — name their dominant shot pattern and what the angle data shows about technique.\n"
        "2) BIOMECHANICAL WEAKNESS — call out the specific body position weakness shown by the angle data.\n"
        "3) BOWLING ATTACK THAT WOULD TROUBLE THEM — describe the line/length/pace.\n"
        "4) TWO SPECIFIC DRILLS — to improve their weakest zone (use bullet points).\n"
        "5) BATTING STYLE PROFILE — one of: aggressive / balanced / defensive — with a short reason.\n\n"
        "Keep total response under 320 words. Use confident, direct, broadcast-style language."
    )

async def _run_llm_coaching(session_key: str, system_message: str, prompt: str) -> str:
    """Send the coaching prompt to Claude via emergentintegrations.
    Always returns a string (initialized to empty before the LLM call)."""
    coaching_text = ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_key,
            system_message=system_message,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=prompt)
        result = await chat.send_message(msg)
        coaching_text = result if isinstance(result, str) else str(result)
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(500, f"AI coaching failed: {e}")
    return coaching_text

# ===================== Biomechanical Predictions & Personal AI =====================
# Default personal thresholds (rough means by shot type). These get refined per user
# after every 10 corrections.
DEFAULT_THRESHOLDS = {
    "Straight Drive": {"wrist_angle": 0, "tolerance": 30, "wagon_angle": 0},
    "Cover Drive":    {"wrist_angle": 45, "tolerance": 20, "wagon_angle": 35},
    "Off Drive":      {"wrist_angle": 20, "tolerance": 15, "wagon_angle": 15},
    "On Drive":       {"wrist_angle": -25, "tolerance": 20, "wagon_angle": -25},
    "Cut":            {"wrist_angle": 55, "tolerance": 25, "wagon_angle": 85},
    "Square Cut":     {"wrist_angle": 80, "tolerance": 15, "wagon_angle": 90},
    "Pull":           {"wrist_angle": -70, "tolerance": 30, "wagon_angle": -90},
    "Hook":           {"wrist_angle": -80, "tolerance": 25, "wagon_angle": -110},
    "Flick":          {"wrist_angle": -45, "tolerance": 20, "wagon_angle": -50},
    "Glance":         {"wrist_angle": -60, "tolerance": 20, "wagon_angle": -130},
    "Sweep":          {"wrist_angle": -100, "tolerance": 25, "wagon_angle": -130},
    "Defend":         {"wrist_angle": 0, "tolerance": 10, "wagon_angle": 0},
}

def _recalc_personal_thresholds(corrections: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    """Compute per-direction mean wrist_angle from this user's correction history."""
    thresholds: Dict[str, Dict[str, float]] = {}
    by_dir: Dict[str, List[float]] = {}
    for c in corrections:
        actual = c.get('actual_direction')
        if not actual:
            continue
        wa = c.get('biomech', {}).get('wrist_angle')
        if wa is None:
            continue
        by_dir.setdefault(actual, []).append(float(wa))
    for direction, vals in by_dir.items():
        if not vals:
            continue
        mean = sum(vals) / len(vals)
        # std-ish tolerance: max deviation, bounded
        tol = max(10.0, min(45.0, max(abs(v - mean) for v in vals) if len(vals) > 1 else 15.0))
        thresholds[direction] = {"wrist_angle": round(mean, 2), "tolerance": round(tol, 2)}
    return thresholds

@api_router.get("/profile/biomech")
async def get_biomech_profile(request: Request):
    user = await require_user(request)
    uid = user['user_id']
    # Compute live accuracy from predictions log
    total = await db.predictions.count_documents({"user_id": uid})
    correct = await db.predictions.count_documents({"user_id": uid, "correct": True})
    corr_count = await db.predictions.count_documents({"user_id": uid, "correct": False})
    accuracy = (correct / total * 100.0) if total else 0.0
    profile = user.get('biomech_profile') or {}
    thresholds = profile.get('personal_thresholds') or {}
    return {
        "personal_thresholds": thresholds,
        "default_thresholds": DEFAULT_THRESHOLDS,
        "total_predictions": total,
        "correct_predictions": correct,
        "corrections": corr_count,
        "ai_accuracy": round(accuracy, 1),
        "samples_needed_for_next_recalc": max(0, 10 - (corr_count % 10)) if corr_count > 0 else 10,
    }

@api_router.post("/predictions/log")
async def log_prediction(payload: PredictionLog, request: Request):
    user = await require_user(request)
    uid = user['user_id']
    doc = payload.model_dump()
    doc['user_id'] = uid
    doc['timestamp'] = datetime.now(timezone.utc).isoformat()
    await db.predictions.insert_one(doc)

    # If this was a correction (correct=False), maybe recalc thresholds
    recalculated = False
    if not payload.correct:
        corr_count = await db.predictions.count_documents({"user_id": uid, "correct": False})
        if corr_count > 0 and corr_count % 10 == 0:
            cursor = db.predictions.find({"user_id": uid, "correct": False}, {"_id": 0}).sort("timestamp", -1).limit(100)
            corrections = await cursor.to_list(100)
            thresholds = _recalc_personal_thresholds(corrections)
            await db.users.update_one(
                {"user_id": uid},
                {"$set": {
                    "biomech_profile.personal_thresholds": thresholds,
                    "biomech_profile.last_recalc_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            recalculated = True

    # Live accuracy
    total = await db.predictions.count_documents({"user_id": uid})
    correct = await db.predictions.count_documents({"user_id": uid, "correct": True})
    accuracy = (correct / total * 100.0) if total else 0.0
    return {
        "ok": True,
        "recalculated_thresholds": recalculated,
        "ai_accuracy": round(accuracy, 1),
        "total_predictions": total,
    }

@api_router.post("/sessions/{session_id}/coaching/biomech")
async def biomech_coaching(session_id: str, request: Request):
    user = await require_user(request)
    if user.get('tier', 'free') == 'free':
        raise HTTPException(402, "Biomechanical coaching is a Pro feature.")
    sess = await db.sessions.find_one({"id": session_id, "user_id": user['user_id']}, {"_id": 0})
    if not sess:
        raise HTTPException(404, "Session not found")
    shots = sess.get('shots', [])
    if len(shots) < 3:
        raise HTTPException(400, "Need at least 3 shots for biomechanical analysis.")

    preds = await db.predictions.find(
        {"user_id": user['user_id'], "session_id": session_id},
        {"_id": 0},
    ).to_list(500)

    stats = _aggregate_shot_stats(shots)
    avgs = _aggregate_biomech_preds(preds)
    prompt = _build_biomech_coaching_prompt(sess, stats, avgs)

    coaching_text = await _run_llm_coaching(
        session_key=f"biomech-{session_id}",
        system_message="You are an elite cricket batting coach analysing biomechanical data with punchy, broadcast-grade language.",
        prompt=prompt,
    )

    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"coaching": coaching_text, "coaching_kind": "biomech", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {
        "coaching": coaching_text,
        "summary": {
            "balls": stats['total_balls'], "runs": stats['total_runs'], "sr": round(stats['sr'], 1),
            "off_pct": round(stats['off_pct'], 1), "leg_pct": round(stats['leg_pct'], 1),
            "top_zone": stats['top_zone'],
            "avg_wrist_angle": round(avgs['avg_wrist'], 1),
            "avg_elbow_angle": round(avgs['avg_elbow'], 1),
            "avg_shoulder_rotation": round(avgs['avg_shoulder'], 1),
            "avg_wrist_velocity": round(avgs['avg_velocity'], 1),
            "avg_body_lean": round(avgs['avg_lean'], 1),
        },
    }

# ===================== Stripe Payments =====================
TIERS = {
    "pro": {"amount": 9.99, "currency": "gbp", "name": "WheelVision Pro Monthly"},
    "academy": {"amount": 49.00, "currency": "gbp", "name": "WheelVision Academy Monthly"},
}

@api_router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request):
    user = await require_user(request)
    if req.tier not in TIERS:
        raise HTTPException(400, "Invalid tier")
    pkg = TIERS[req.tier]
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
        host_url = str(request.base_url)
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        success_url = f"{req.origin_url}/payment-return?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{req.origin_url}/pricing"
        checkoutrequest = CheckoutSessionRequest(
            amount=float(pkg['amount']),
            currency=pkg['currency'],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": user['user_id'],
                "email": user['email'],
                "tier": req.tier,
            },
        )
        session = await stripe_checkout.create_checkout_session(checkoutrequest)
        # Record transaction
        await db.payment_transactions.insert_one({
            "session_id": session.session_id,
            "user_id": user['user_id'],
            "email": user['email'],
            "tier": req.tier,
            "amount": pkg['amount'],
            "currency": pkg['currency'],
            "payment_status": "initiated",
            "metadata": {"tier": req.tier},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"url": session.url, "session_id": session.session_id}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Stripe error")
        raise HTTPException(500, f"Checkout failed: {e}")

@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request):
    await require_user(request)
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        host_url = str(request.base_url)
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        status = await stripe_checkout.get_checkout_status(session_id)
        # Update transaction
        txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if txn and txn.get('payment_status') != 'paid' and status.payment_status == 'paid':
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid", "status": status.status, "completed_at": datetime.now(timezone.utc).isoformat()}},
            )
            # Upgrade user tier
            tier = txn.get('tier', 'pro')
            await db.users.update_one({"user_id": txn['user_id']}, {"$set": {"tier": tier}})
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "amount_total": status.amount_total,
            "currency": status.currency,
        }
    except Exception as e:
        logging.exception("Stripe status error")
        raise HTTPException(500, f"Status check failed: {e}")

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        host_url = str(request.base_url)
        webhook_url = f"{host_url}api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        evt = await stripe_checkout.handle_webhook(body, sig)
        if evt and evt.session_id and evt.payment_status == 'paid':
            txn = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0})
            if txn and txn.get('payment_status') != 'paid':
                await db.payment_transactions.update_one(
                    {"session_id": evt.session_id},
                    {"$set": {"payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}},
                )
                await db.users.update_one(
                    {"user_id": txn['user_id']},
                    {"$set": {"tier": txn.get('tier', 'pro')}},
                )
        return {"received": True}
    except Exception as e:
        logging.exception("Webhook error")
        return JSONResponse(status_code=200, content={"received": False, "error": str(e)})

# ===================== Health =====================
@api_router.get("/")
async def root():
    return {"app": "WheelVision AI", "status": "ok"}

# ===================== Mount =====================
app.include_router(api_router)

cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
if cors_origins == ['*'] or '*' in cors_origins:
    # Cannot use "*" with credentials; allow any origin via regex instead.
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
