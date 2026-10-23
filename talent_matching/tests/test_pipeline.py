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
    ("c02", Decision.SHORTLIST, None),                        # one early, short Infosys stint: allowed
    ("c03", Decision.REJECT, "B2C: Swiggy"),
    ("c04", Decision.REJECT, "Experience"),
    ("c05", Decision.REJECT, "Hands-on GenAI experience 0 months"),
    ("c06", Decision.REJECT, "Service stint: Fractal Analytics"),
    ("c07", Decision.HOLD, None),
    ("c08", Decision.REJECT, None),
    ("c09", Decision.SHORTLIST, None),                        # Senior title, staff-level scope
    ("c10", Decision.SHORTLIST, None),                        # LlamaIndex/CrewAI instead of LangChain
    ("c11", Decision.REJECT, "Service stint: Accenture, TCS"),  # two stints, the later one is major
])
def test_sample_decisions(results, cid, decision, reason):
    e = results[cid]
    assert e.decision == decision
    if reason:
        assert any(r.startswith(reason) for r in e.knockout.reasons)


def test_strict_service_policy_rejects_any_stint(spec):
    spec.service_policy = "strict"
    cands = [Candidate.model_validate(x) for x in json.loads((ROOT / "samples/candidates.json").read_text())]
    res = {e.candidate.id: e for e in pipeline.run(cands, spec, TODAY)}
    assert res["c02"].decision == Decision.REJECT


def test_early_service_stint_noted_for_recruiter(results):
    assert any(f.startswith("Early service stint at Infosys") for f in results["c02"].flags)


def _profile(first_company, second_company="Freshworks"):
    bullets = ["Shipped LangGraph agents with RAG to 200 enterprise customers"]
    return Candidate(id="x", name="x", stints=[
        Stint(company=first_company, title="SE", start="2014-01", end="2015-06"),
        Stint(company=second_company, title="Senior SE", start="2015-07", bullets=bullets),
    ])


def test_service_stint_must_be_the_first_job(spec):
    early = pipeline.evaluate(_profile("Infosys"), spec, TODAY)
    late = pipeline.evaluate(Candidate(id="y", name="y", stints=[
        Stint(company="Freshworks", title="SE", start="2012-01", end="2013-12"),
        Stint(company="Infosys", title="SE", start="2014-01", end="2015-06"),
        Stint(company="Atlan", title="Senior SE", start="2015-07",
              bullets=["Shipped LangGraph agents with RAG to 200 enterprise customers"]),
    ]), spec, TODAY)
    assert early.knockout.passed
    assert not late.knockout.passed


def test_senior_with_staff_scope_gets_staff_title_credit(results):
    # c09 is "Senior Software Engineer" but leads cross-team architecture
    assert results["c09"].scores["staff_scope"] >= 22


def test_langchain_langgraph_preferred_over_alternatives(results):
    assert 0 < results["c10"].scores["stack"] < results["c09"].scores["stack"]


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
