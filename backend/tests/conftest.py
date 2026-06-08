import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://bat-analyzer-1.preview.emergentagent.com").rstrip("/")

# Pre-seeded tokens (created by test runner before invoking pytest)
FREE_TOKEN = os.environ.get("FREE_TOKEN", "")
PRO_TOKEN = os.environ.get("PRO_TOKEN", "")
ACAD_TOKEN = os.environ.get("ACAD_TOKEN", "")


@pytest.fixture
def base_url():
    return BASE_URL


@pytest.fixture
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _client_for_token(token: str):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    })
    return s


@pytest.fixture
def free_client():
    if not FREE_TOKEN:
        pytest.skip("FREE_TOKEN missing")
    return _client_for_token(FREE_TOKEN)


@pytest.fixture
def pro_client():
    if not PRO_TOKEN:
        pytest.skip("PRO_TOKEN missing")
    return _client_for_token(PRO_TOKEN)


@pytest.fixture
def acad_client():
    if not ACAD_TOKEN:
        pytest.skip("ACAD_TOKEN missing")
    return _client_for_token(ACAD_TOKEN)
