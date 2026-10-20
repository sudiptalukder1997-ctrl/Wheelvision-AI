import json
from datetime import date
from pathlib import Path

import pytest

from talent_matching import agents, pipeline
from talent_matching.models import Candidate, CompanyType, Decision, RoleSpec, Stint

ROOT = Path(__file__).resolve().parents[1]
TODAY = date(2026, 10, 20)


@pytest.fixture
def spec():
    return RoleSpec.load(ROOT / "role_spec.json")


@pytest.fixture
def results(spec):
    cands = [Candidate.model_validate(x) for x in json.loads((ROOT / "samples/candidates.json").read_text())]
    return {e.candidate.id: e for e in pipeline.run(cands, spec, TODAY)}


@pytest.mark.parametrize("cid,decision,reason", [
    ("c01", Decision.SHORTLIST, None),
    ("c02", Decision.REJECT, "Service stint: Infosys"),
    ("c03", Decision.REJECT, "B2C: Swiggy"),
    ("c04", Decision.REJECT, "Experience"),
    ("c05", Decision.REJECT, "Hands-on GenAI experience 0 months"),
    ("c06", Decision.REJECT, "Service stint: Fractal Analytics"),
    ("c07", Decision.HOLD, None),
    ("c08", Decision.REJECT, None),
])
def test_sample_decisions(results, cid, decision, reason):
    e = results[cid]
    assert e.decision == decision
    if reason:
        assert any(r.startswith(reason) for r in e.knockout.reasons)


def test_lenient_service_policy_lets_old_short_stint_through(spec):
    spec.service_policy = "lenient"
    cands = [Candidate.model_validate(x) for x in json.loads((ROOT / "samples/candidates.json").read_text())]
    res = {e.candidate.id: e for e in pipeline.run(cands, spec, TODAY)}
    assert res["c02"].decision == Decision.SHORTLIST        # 22 months, ended 2015
    assert res["c06"].decision == Decision.REJECT           # 58 months at Fractal: too long


def test_keyword_stuffing_flagged(results):
    assert any(f.startswith("Keyword stuffing") for f in results["c05"].flags)


def test_manager_drift_flagged(results):
    assert any(f.startswith("Manager drift") for f in results["c08"].flags)


def test_internships_and_overlaps_not_double_counted():
    c = Candidate(id="x", name="x", stints=[
        Stint(company="Zoho", title="Intern", start="2014-01", end="2014-06", employment_type="internship"),
        Stint(company="Zoho", title="SE", start="2015-01", end="2016-12"),
        Stint(company="Freelance", title="Consultant", start="2016-06", end="2017-05", employment_type="freelance"),
    ])
    assert agents.total_years(c, TODAY) == pytest.approx(29 / 12)


def test_ai_months_floor_at_genai_era(spec):
    c = Candidate(id="x", name="x", stints=[
        Stint(company="Atlan", title="SE", start="2019-01", end="2022-12",
              bullets=["Shipped RAG search to enterprise customers"]),
    ])
    assert agents.ai_months(c, spec, TODAY) == 12   # counted from 2022-01 only


def test_poc_only_does_not_count_as_ai_experience(spec):
    c = Candidate(id="x", name="x", stints=[
        Stint(company="Atlan", title="SE", start="2022-01", bullets=["Explored LangChain in a POC"]),
    ])
    assert agents.ai_months(c, spec, TODAY) == 0


@pytest.mark.parametrize("name,ctype", [
    ("Tata Consultancy Services Ltd", CompanyType.SERVICES),
    ("Fractal Analytics Pvt. Ltd.", CompanyType.SERVICES),
    ("Freshworks Inc", CompanyType.B2B_SAAS),
    ("Swiggy", CompanyType.B2C),
    ("Goldman Sachs", CompanyType.GCC),
    ("Microsoft", CompanyType.BIG_TECH),
])
def test_company_lookup(name, ctype):
    from talent_matching import company_kb
    assert company_kb.lookup(name) == ctype
