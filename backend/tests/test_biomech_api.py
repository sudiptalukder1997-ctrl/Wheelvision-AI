"""
WheelVision AI - Iteration 2 biomechanics API tests
Covers:
- GET /api/profile/biomech (auth gating + accuracy fields)
- POST /api/predictions/log (insertion, count, threshold recalc on 10th correction)
- POST /api/sessions/{id}/coaching/biomech (tier gating, min shots, Pro success)
"""
import os
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


# ---------- Profile biomech ----------
class TestBiomechProfile:
    def test_anonymous_401(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/profile/biomech")
        assert r.status_code == 401

    def test_pro_returns_full_shape(self, pro_client):
        r = pro_client.get(f"{BASE_URL}/api/profile/biomech")
        assert r.status_code == 200, r.text
        data = r.json()
        for key in (
            "personal_thresholds",
            "default_thresholds",
            "total_predictions",
            "correct_predictions",
            "corrections",
            "ai_accuracy",
            "samples_needed_for_next_recalc",
        ):
            assert key in data, f"missing key: {key}"
        # default thresholds is a non-empty dict with known shots
        assert isinstance(data["default_thresholds"], dict)
        assert "Cover Drive" in data["default_thresholds"]
        assert isinstance(data["personal_thresholds"], dict)
        assert isinstance(data["ai_accuracy"], (int, float))


# ---------- Prediction logging + recalc ----------
class TestPredictionLogging:
    def _log(self, client, *, correct, direction="Cover Drive", wrist_angle=45.0, runs=4):
        return client.post(
            f"{BASE_URL}/api/predictions/log",
            json={
                "session_id": None,
                "biomech": {
                    "wrist_angle": wrist_angle,
                    "elbow_angle": 120.0,
                    "shoulder_rotation": 30.0,
                    "wrist_velocity": 1.5,
                    "body_lean": 10.0,
                    "foot_position": "front",
                },
                "predicted_direction": direction,
                "predicted_angle": 35.0,
                "predicted_runs": runs,
                "actual_direction": direction,
                "actual_angle": 35.0,
                "actual_runs": runs,
                "correct": correct,
                "confidence": 0.82,
            },
        )

    def test_anonymous_log_401(self, anon_client):
        r = self._log(anon_client, correct=True)
        assert r.status_code == 401

    def test_correct_log_does_not_trigger_recalc(self, acad_client):
        # Use academy user (fresh, distinct from pro tests)
        r = self._log(acad_client, correct=True)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["recalculated_thresholds"] is False
        assert body["total_predictions"] >= 1

    def test_ninth_correction_no_recalc_then_tenth_triggers(self, pro_client):
        # Baseline: existing pro user predictions might exist; we measure delta in our own
        # test by inserting 9 corrections then 1 more.
        # Read baseline
        r0 = pro_client.get(f"{BASE_URL}/api/profile/biomech")
        baseline = r0.json()
        base_corrections = baseline["corrections"]
        base_total = baseline["total_predictions"]

        # Insert 9 corrections (correct=False) - vary wrist angle a bit per shot type
        directions = [
            ("Cover Drive", 44.0), ("Cover Drive", 46.0), ("Cover Drive", 48.0),
            ("Pull", -70.0), ("Pull", -72.0), ("Pull", -68.0),
            ("Flick", -45.0), ("Flick", -47.0), ("Flick", -44.0),
        ]
        last_resp = None
        for direction, wa in directions:
            r = self._log(pro_client, correct=False, direction=direction, wrist_angle=wa)
            assert r.status_code == 200, r.text
            last_resp = r.json()

        # The 9th correction should NOT trigger recalc IF starting fresh (mod 10).
        # If baseline already had some corrections, we account for that:
        # We need the (n where (base_corrections + n) % 10 == 0) shot to trigger.
        # The "fresh user" assumption: base_corrections == 0 for this newly seeded pro.
        # Assert based on baseline.
        if base_corrections == 0:
            assert last_resp["recalculated_thresholds"] is False, (
                f"9th correction shouldn't recalc; got {last_resp}"
            )

        # 10th correction
        r10 = self._log(pro_client, correct=False, direction="Cover Drive", wrist_angle=47.0)
        assert r10.status_code == 200, r10.text
        body10 = r10.json()
        # On a fresh pro user, this 10th False-correction triggers recalc
        if base_corrections == 0:
            assert body10["recalculated_thresholds"] is True, (
                f"10th correction must trigger recalc; got {body10}"
            )

        # Verify counts increased
        r1 = pro_client.get(f"{BASE_URL}/api/profile/biomech")
        prof = r1.json()
        assert prof["corrections"] >= base_corrections + 10
        assert prof["total_predictions"] >= base_total + 10

        # Personal thresholds must be non-empty after recalc
        if base_corrections == 0:
            pt = prof["personal_thresholds"]
            assert isinstance(pt, dict) and len(pt) > 0, f"personal_thresholds empty: {pt}"
            assert "Cover Drive" in pt
            # Mean wrist_angle should be in the 44-48 range we provided
            assert 40 <= pt["Cover Drive"]["wrist_angle"] <= 50

        # Live accuracy = correct/total*100
        total = prof["total_predictions"]
        correct = prof["correct_predictions"]
        expected = round((correct / total * 100.0) if total else 0.0, 1)
        assert prof["ai_accuracy"] == expected


# ---------- Biomech coaching endpoint ----------
class TestBiomechCoaching:
    def _seed_session_with_shots(self, client, n_shots=3, log_biomech=True):
        r = client.post(f"{BASE_URL}/api/sessions", json={"name": "TEST_biomech_coach", "batter_hand": "RH"})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        for i in range(n_shots):
            rr = client.post(
                f"{BASE_URL}/api/sessions/{sid}/shots",
                json={"runs": (i % 6) + 1, "shot_type": "Cover Drive", "x": 0.2, "y": 0.3, "angle": 35.0 + i},
            )
            assert rr.status_code == 200, rr.text
            if log_biomech:
                client.post(f"{BASE_URL}/api/predictions/log", json={
                    "session_id": sid,
                    "biomech": {
                        "wrist_angle": 45.0 + i, "elbow_angle": 120.0,
                        "shoulder_rotation": 30.0, "wrist_velocity": 1.5,
                        "body_lean": 10.0, "foot_position": "front",
                    },
                    "predicted_direction": "Cover Drive", "predicted_angle": 35.0,
                    "predicted_runs": (i % 6) + 1, "actual_direction": "Cover Drive",
                    "actual_angle": 35.0, "actual_runs": (i % 6) + 1,
                    "correct": True, "confidence": 0.85,
                })
        return sid

    def test_free_user_402(self, free_client):
        sid = self._seed_session_with_shots(free_client, n_shots=3, log_biomech=False)
        try:
            r = free_client.post(f"{BASE_URL}/api/sessions/{sid}/coaching/biomech", timeout=30)
            assert r.status_code == 402, r.text
        finally:
            free_client.delete(f"{BASE_URL}/api/sessions/{sid}")

    def test_pro_too_few_shots_400(self, pro_client):
        r = pro_client.post(f"{BASE_URL}/api/sessions", json={"name": "TEST_biomech_short"})
        sid = r.json()["id"]
        try:
            # add only 2 shots
            for i in range(2):
                pro_client.post(
                    f"{BASE_URL}/api/sessions/{sid}/shots",
                    json={"runs": 1, "shot_type": "Drive", "x": 0.1, "y": 0.1, "angle": 0.0},
                )
            r = pro_client.post(f"{BASE_URL}/api/sessions/{sid}/coaching/biomech", timeout=30)
            assert r.status_code == 400, r.text
        finally:
            pro_client.delete(f"{BASE_URL}/api/sessions/{sid}")

    def test_pro_success_and_persistence(self, pro_client):
        sid = self._seed_session_with_shots(pro_client, n_shots=4, log_biomech=True)
        try:
            r = pro_client.post(f"{BASE_URL}/api/sessions/{sid}/coaching/biomech", timeout=90)
            assert r.status_code == 200, r.text
            data = r.json()
            assert "coaching" in data and isinstance(data["coaching"], str)
            assert len(data["coaching"]) > 50
            summary = data.get("summary") or {}
            for k in ("balls", "runs", "sr", "off_pct", "leg_pct", "top_zone",
                      "avg_wrist_angle", "avg_elbow_angle", "avg_shoulder_rotation",
                      "avg_wrist_velocity", "avg_body_lean"):
                assert k in summary, f"summary missing {k}"
            assert summary["balls"] == 4

            # persistence: GET session returns coaching with kind=biomech
            r2 = pro_client.get(f"{BASE_URL}/api/sessions/{sid}")
            sess = r2.json()
            assert sess.get("coaching") == data["coaching"]
            assert sess.get("coaching_kind") == "biomech"
        finally:
            pro_client.delete(f"{BASE_URL}/api/sessions/{sid}")
