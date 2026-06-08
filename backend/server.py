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

    # Build stats summary
    total_balls = len(shots)
    total_runs = sum(s['runs'] for s in shots)
    fours = sum(1 for s in shots if s['runs'] == 4)
    sixes = sum(1 for s in shots if s['runs'] == 6)
    dots = sum(1 for s in shots if s['runs'] == 0)
    sr = (total_runs / total_balls * 100) if total_balls else 0
    by_type: Dict[str, Dict[str, int]] = {}
    for s in shots:
        st = s['shot_type']
        by_type.setdefault(st, {"count": 0, "runs": 0})
        by_type[st]['count'] += 1
        by_type[st]['runs'] += s['runs']

    prompt = (
        f"You are an elite cricket batting coach analyzing a session. Batter is {sess.get('batter_hand', 'RH')}-handed.\n\n"
        f"SESSION STATS:\n"
        f"- Balls faced: {total_balls}\n"
        f"- Runs: {total_runs}\n"
        f"- Strike rate: {sr:.1f}\n"
        f"- 4s: {fours}, 6s: {sixes}, Dots: {dots}\n\n"
        f"SHOT BREAKDOWN BY TYPE:\n" +
        "\n".join([f"- {k}: {v['count']} shots, {v['runs']} runs" for k, v in by_type.items()]) +
        "\n\nFIELD POSITIONS (each shot as angle deg from straight, runs):\n" +
        "\n".join([f"- {s['shot_type']} -> angle {s.get('angle', 0):.0f}°, {s['runs']} runs" for s in shots[:50]]) +
        "\n\nProvide a tight, broadcast-style analysis with EXACTLY these four sections, each headed in CAPS:\n"
        "1) STRONGEST SCORING AREA — name the field zone they dominate.\n"
        "2) WEAKNESS / GAP — name the zone or shot type they avoid or score poorly in.\n"
        "3) ONE TACTICAL RECOMMENDATION — a single, specific action.\n"
        "4) OVERALL ASSESSMENT — 2 short sentences.\n\n"
        "Keep total response under 220 words. Use confident, direct language."
    )

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"coach-{session_id}",
            system_message="You are a world-class cricket batting analyst with a punchy broadcast style.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=prompt)
        result = await chat.send_message(msg)
        coaching_text = result if isinstance(result, str) else str(result)
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(500, f"AI coaching failed: {e}")

    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"coaching": coaching_text, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"coaching": coaching_text}

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
