"""
WheelVision AI - End-to-end backend API tests
Covers: health, auth gating, sessions CRUD, shots CRUD, free-tier shot limit,
AI coaching gating (free 402, <3 shots 400, pro >=3 success),
Stripe checkout init + payment status, manifest/SW assets.
"""
import pytest


# ---------- Health ----------
class TestHealth:
    def test_root(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/")
        assert r.status_code == 200
        data = r.json()
        assert data == {"app": "WheelVision AI", "status": "ok"}


# ---------- Auth gating ----------
class TestAuth:
    def test_me_anon_401(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_me_pro_ok(self, pro_client, base_url):
        r = pro_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["tier"] == "pro"
        assert "user_id" in data and "email" in data

    def test_me_free_ok(self, free_client, base_url):
        r = free_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200
        assert r.json()["tier"] == "free"

    def test_auth_session_invalid_id_401(self, anon_client, base_url):
        r = anon_client.post(f"{base_url}/api/auth/session", json={"session_id": "bogus_xyz"})
        assert r.status_code in (400, 401)

    def test_auth_session_missing_400(self, anon_client, base_url):
        r = anon_client.post(f"{base_url}/api/auth/session", json={})
        assert r.status_code == 400


# ---------- Sessions CRUD ----------
class TestSessions:
    def test_create_get_list_patch_delete(self, pro_client, base_url):
        # CREATE
        r = pro_client.post(f"{base_url}/api/sessions", json={"name": "TEST_qa", "batter_hand": "RH"})
        assert r.status_code == 200
        s = r.json()
        assert s["name"] == "TEST_qa"
        assert s["batter_hand"] == "RH"
        assert isinstance(s["id"], str) and len(s["id"]) > 0
        assert s["shots"] == []
        sid = s["id"]

        # GET
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert r.status_code == 200
        assert r.json()["id"] == sid

        # LIST
        r = pro_client.get(f"{base_url}/api/sessions")
        assert r.status_code == 200
        assert any(x["id"] == sid for x in r.json())

        # PATCH (change batter_hand)
        r = pro_client.patch(f"{base_url}/api/sessions/{sid}", json={"batter_hand": "LH"})
        assert r.status_code == 200
        assert r.json()["batter_hand"] == "LH"

        # GET verifies persistence
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert r.json()["batter_hand"] == "LH"

        # DELETE
        r = pro_client.delete(f"{base_url}/api/sessions/{sid}")
        assert r.status_code == 200

        # GET after delete returns 404
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert r.status_code == 404

    def test_sessions_require_auth(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/sessions")
        assert r.status_code == 401
        r = anon_client.post(f"{base_url}/api/sessions", json={"name": "x"})
        assert r.status_code == 401


# ---------- Shots CRUD ----------
class TestShots:
    def test_add_delete_clear(self, pro_client, base_url):
        r = pro_client.post(f"{base_url}/api/sessions", json={"name": "TEST_shots", "batter_hand": "RH"})
        sid = r.json()["id"]

        # add 3 shots
        ids = []
        for runs in [1, 4, 6]:
            r = pro_client.post(
                f"{base_url}/api/sessions/{sid}/shots",
                json={"runs": runs, "shot_type": "Drive", "x": 0.1, "y": 0.2, "angle": 45.0},
            )
            assert r.status_code == 200
            sh = r.json()
            assert sh["runs"] == runs
            assert sh["shot_type"] == "Drive"
            ids.append(sh["id"])

        # verify session has 3 shots
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert len(r.json()["shots"]) == 3

        # delete first
        r = pro_client.delete(f"{base_url}/api/sessions/{sid}/shots/{ids[0]}")
        assert r.status_code == 200
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert len(r.json()["shots"]) == 2

        # clear all
        r = pro_client.post(f"{base_url}/api/sessions/{sid}/shots/clear")
        assert r.status_code == 200
        r = pro_client.get(f"{base_url}/api/sessions/{sid}")
        assert r.json()["shots"] == []

        # cleanup
        pro_client.delete(f"{base_url}/api/sessions/{sid}")


# ---------- Free tier limit ----------
class TestFreeTierLimit:
    def test_11th_shot_returns_402(self, free_client, base_url):
        r = free_client.post(f"{base_url}/api/sessions", json={"name": "TEST_free_limit", "batter_hand": "RH"})
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            for i in range(10):
                r = free_client.post(
                    f"{base_url}/api/sessions/{sid}/shots",
                    json={"runs": 1, "shot_type": "Drive", "x": 0.1, "y": 0.1, "angle": 0.0},
                )
                assert r.status_code == 200, f"shot {i} failed: {r.text}"

            r = free_client.post(
                f"{base_url}/api/sessions/{sid}/shots",
                json={"runs": 1, "shot_type": "Drive", "x": 0.1, "y": 0.1, "angle": 0.0},
            )
            assert r.status_code == 402
            assert "Free tier limit" in r.json().get("detail", "")
        finally:
            free_client.delete(f"{base_url}/api/sessions/{sid}")


# ---------- Coaching gating ----------
class TestCoaching:
    def test_free_user_402(self, free_client, base_url):
        r = free_client.post(f"{base_url}/api/sessions", json={"name": "TEST_coach_free"})
        sid = r.json()["id"]
        try:
            r = free_client.post(f"{base_url}/api/sessions/{sid}/coaching")
            assert r.status_code == 402
        finally:
            free_client.delete(f"{base_url}/api/sessions/{sid}")

    def test_pro_user_too_few_shots_400(self, pro_client, base_url):
        r = pro_client.post(f"{base_url}/api/sessions", json={"name": "TEST_coach_short"})
        sid = r.json()["id"]
        try:
            # add 2 shots only
            for _ in range(2):
                pro_client.post(
                    f"{base_url}/api/sessions/{sid}/shots",
                    json={"runs": 1, "shot_type": "Drive", "x": 0.1, "y": 0.1, "angle": 0.0},
                )
            r = pro_client.post(f"{base_url}/api/sessions/{sid}/coaching")
            assert r.status_code == 400
        finally:
            pro_client.delete(f"{base_url}/api/sessions/{sid}")

    def test_pro_user_coaching_success(self, pro_client, base_url):
        r = pro_client.post(f"{base_url}/api/sessions", json={"name": "TEST_coach_ok"})
        sid = r.json()["id"]
        try:
            shots = [
                (4, "Drive", 30.0),
                (1, "Flick", -45.0),
                (6, "Pull", 90.0),
                (0, "Defend", 0.0),
                (2, "Cut", 75.0),
            ]
            for runs, st, ang in shots:
                rr = pro_client.post(
                    f"{base_url}/api/sessions/{sid}/shots",
                    json={"runs": runs, "shot_type": st, "x": 0.1, "y": 0.1, "angle": ang},
                )
                assert rr.status_code == 200

            r = pro_client.post(f"{base_url}/api/sessions/{sid}/coaching", timeout=60)
            assert r.status_code == 200, f"coaching failed: {r.text}"
            data = r.json()
            assert "coaching" in data
            assert isinstance(data["coaching"], str)
            assert len(data["coaching"]) > 50

            # verify persistence
            r2 = pro_client.get(f"{base_url}/api/sessions/{sid}")
            assert r2.json().get("coaching") == data["coaching"]
        finally:
            pro_client.delete(f"{base_url}/api/sessions/{sid}")


# ---------- Stripe ----------
class TestStripe:
    def test_checkout_initiated(self, free_client, base_url):
        origin = base_url
        r = free_client.post(
            f"{base_url}/api/payments/checkout",
            json={"tier": "pro", "origin_url": origin},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data and len(data["session_id"]) > 0

        # status
        r2 = free_client.get(f"{base_url}/api/payments/status/{data['session_id']}", timeout=30)
        assert r2.status_code == 200
        body = r2.json()
        assert "status" in body
        assert "payment_status" in body

    def test_checkout_invalid_tier(self, free_client, base_url):
        r = free_client.post(
            f"{base_url}/api/payments/checkout",
            json={"tier": "bogus", "origin_url": base_url},
        )
        assert r.status_code == 400

    def test_checkout_requires_auth(self, anon_client, base_url):
        r = anon_client.post(
            f"{base_url}/api/payments/checkout",
            json={"tier": "pro", "origin_url": base_url},
        )
        assert r.status_code == 401


# ---------- PWA assets ----------
class TestPWA:
    def test_manifest(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/manifest.json")
        assert r.status_code == 200
        data = r.json()
        assert data.get("name") == "WheelVision AI" or "WheelVision" in data.get("name", "")
        assert data.get("theme_color", "").upper() == "#22C55E"

    def test_service_worker(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/service-worker.js")
        assert r.status_code == 200
        assert "self" in r.text or "addEventListener" in r.text
