"""The pipeline's agents. Each one makes a single judgment and records its evidence.

See FRAMEWORK.md §8 for the flow. Everything here is deterministic; LLM calls live in llm.py.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Dict, Iterable, List, Optional, Tuple

from . import company_kb, llm
from .models import (
    GOOD_COMPANY_TYPES, REVIEW_COMPANY_TYPES, Candidate, CompanyType, KnockoutResult,
    RoleSpec, SkillEvidence, Stint,
)

# ---------------------------------------------------------------- dates

def month_index(ym: str) -> int:
    y, m = ym.split("-")[:2]
    return int(y) * 12 + int(m) - 1


def stint_span(s: Stint, today: date) -> Tuple[int, int]:
    """Half-open [start, end) month interval; the end month counts as worked."""
    end = month_index(s.end) + 1 if s.end else today.year * 12 + today.month
    return month_index(s.start), end


def merged_months(spans: Iterable[Tuple[int, int]]) -> int:
    total, cur_s, cur_e = 0, None, None
    for s, e in sorted(spans):
        if cur_e is None or s > cur_e:
            if cur_e is not None:
                total += cur_e - cur_s
            cur_s, cur_e = s, e
        else:
            cur_e = max(cur_e, e)
    if cur_e is not None:
        total += cur_e - cur_s
    return total


def work_stints(c: Candidate) -> List[Stint]:
    return sorted((s for s in c.stints if s.employment_type != "internship"), key=lambda s: month_index(s.start))


def current_stint(c: Candidate) -> Optional[Stint]:
    stints = work_stints(c)
    if not stints:
        return None
    return next((s for s in stints if s.end is None), None) or max(stints, key=lambda s: month_index(s.end))

# ---------------------------------------------------------------- 1. sourcing

def boolean_search(spec: RoleSpec) -> Dict[str, str]:
    """Boolean strings for LinkedIn Recruiter / Naukri. Paste them in; don't scrape."""
    titles = '("staff engineer" OR "principal engineer" OR "lead engineer" OR "staff software engineer" ' \
             'OR "senior staff" OR "AI architect" OR "lead AI engineer" OR "senior software engineer")'
    core = '(LLM OR "large language model" OR GenAI OR "generative AI")'
    stack = '(RAG OR "retrieval augmented" OR LangGraph OR LangChain OR agentic OR "AI agents")'
    services = ["TCS", "Infosys", "Wipro", "Cognizant", "Accenture", "Capgemini",
                "HCL", "Tech Mahindra", "LTIMindtree", "Fractal", "Tiger Analytics"]
    # Under the lenient policy an early services job is fine, so a NOT on the whole profile would
    # drop good people. Only exclude services firms as the *current* employer then.
    exclude = "" if spec.service_policy == "lenient" else " " + " ".join(f'NOT "{n}"' for n in services)
    past = ("Past company: don't exclude, the agent checks the 'one early stint' rule"
            if spec.service_policy == "lenient" else "Past company: exclude the IT services list")
    return {
        "linkedin_recruiter": f"{titles} AND {core} AND {stack}{exclude}",
        "naukri_keywords": "LLM, RAG, LangGraph, LangChain, Agentic AI, Guardrails, Staff Engineer",
        "filters": f"Experience >= {spec.min_total_years:g} yrs; Current company: B2B SaaS / AI-native target list, "
                   f"exclude {', '.join(services)}; {past}",
    }

# ---------------------------------------------------------------- 3. company classifier

def classify_companies(c: Candidate, use_llm: bool = False) -> List[str]:
    """Fill company_type on each stint. Returns companies a human still needs to check."""
    unresolved = []
    for s in c.stints:
        if s.company_type is None:
            s.company_type = company_kb.lookup(s.company)
        if s.company_type is None and use_llm:
            s.company_type = llm.classify_company(s.company, "\n".join([s.title, *s.bullets[:4]]))
        if s.company_type is None:
            s.company_type = CompanyType.UNKNOWN
        if s.company_type in REVIEW_COMPANY_TYPES and s.employment_type != "internship":
            unresolved.append(f"{s.company} ({s.company_type.value})")
    return unresolved

# ---------------------------------------------------------------- 5. evidence

SKILL_PATTERNS: Dict[str, str] = {
    "llm": r"\bllms?\b|large language model|\bgpt-?\d|\bclaude\b|\bllama|\bmistral\b|\bgemini\b|openai|anthropic",
    "rag": r"\brag\b|retrieval[- ]augmented|vector (db|database|store|search)|pinecone|weaviate|qdrant|pgvector|"
           r"\bfaiss\b|milvus|chroma(db)?|embeddings?|hybrid search|re-?rank",
    "agentic": r"\bagent(s|ic)?\b|multi-agent|tool[- ]calling|function[- ]calling|crewai|autogen|langgraph",
    "langchain": r"langchain|\blcel\b|langsmith",
    "langgraph": r"langgraph",
    # Other orchestration frameworks: half credit in place of LangChain/LangGraph (HM: "preferable", not required)
    "orchestration_alt": r"llama ?index|crewai|autogen|semantic kernel|haystack|\bdspy\b|custom (agent )?orchestrat",
    "guardrails": r"guardrail|nemo guardrails|llama ?guard|pii (redaction|masking)|jailbreak|prompt injection|"
                  r"content moderation|hallucination (detection|check)",
    "genai": r"gen ?ai|generative ai",
    "evals": r"\bevals?\b|evaluation (harness|framework|suite)|ragas|deepeval|llm[- ]as[- ]a?[- ]?judge|promptfoo|"
             r"langsmith|langfuse|arize|observability",
}
_RX = {k: re.compile(v, re.I) for k, v in SKILL_PATTERNS.items()}
GENAI_SKILLS = ["llm", "rag", "agentic", "langchain", "langgraph", "orchestration_alt", "guardrails", "genai"]
ALT_FRAMEWORK_CREDIT = 0.5

PRODUCTION = re.compile(
    r"production|\bprod\b|shipped|launched|deployed|customers?|\busers?\b|enterprise|latency|p9[59]|\bscale|"
    r"req/s|rps|qps|\d+\s?%|\$\s?\d|\d+[km]\b|million|revenue|sla|uptime", re.I)
WEAK = re.compile(r"\bpoc\b|proof of concept|prototype|hackathon|explored|exploring|learning|course|"
                  r"certification|side project|experimented", re.I)


def bullet_strength(bullet: str) -> float:
    if WEAK.search(bullet):
        return 0.3
    if PRODUCTION.search(bullet):
        return 1.0
    return 0.6


def collect_evidence(c: Candidate) -> Dict[str, SkillEvidence]:
    """Strongest evidence per skill, with the bullet quoted so a recruiter can check it."""
    best: Dict[str, SkillEvidence] = {}
    for s in work_stints(c):
        for b in s.bullets:
            strength = bullet_strength(b)
            for skill, rx in _RX.items():
                if rx.search(b) and strength > best.get(skill, SkillEvidence(skill=skill, strength=0)).strength:
                    best[skill] = SkillEvidence(skill=skill, strength=strength, quote=b, company=s.company)
    skills_blob = " | ".join(c.skills)
    for skill, rx in _RX.items():
        if skill not in best and rx.search(skills_blob):
            best[skill] = SkillEvidence(skill=skill, strength=0.25, quote="(skills section only)")
    return best


def is_ai_stint(s: Stint) -> bool:
    return any(bullet_strength(b) >= 0.6 and any(_RX[k].search(b) for k in GENAI_SKILLS) for b in s.bullets)


def ai_months(c: Candidate, spec: RoleSpec, today: date) -> int:
    floor = month_index(spec.genai_era_start)
    spans = []
    for s in work_stints(c):
        if is_ai_stint(s):
            start, end = stint_span(s, today)
            if end > floor:
                spans.append((max(start, floor), end))
    return merged_months(spans)

# ---------------------------------------------------------------- 4. knockouts

def total_years(c: Candidate, today: date) -> float:
    return merged_months(stint_span(s, today) for s in work_stints(c)) / 12


def knockout(c: Candidate, spec: RoleSpec, today: date, years: float, ai_mo: int) -> KnockoutResult:
    r = KnockoutResult(passed=True)

    if years < spec.near_miss_years:
        r.reasons.append(f"Experience {years:.1f} yrs < {spec.min_total_years:g} required")
    elif years < spec.min_total_years:
        r.holds.append(f"Near-miss on experience: {years:.1f} yrs (need {spec.min_total_years:g})")

    stints = work_stints(c)
    services = [s for s in stints if s.company_type == CompanyType.SERVICES]
    if services:
        months = merged_months(stint_span(s, today) for s in services)
        names = ", ".join(sorted({s.company for s in services}))
        # Lenient = one early, minor stint: a single services job, as the first job, no longer than the cap
        early_minor = len(services) == 1 and services[0] is stints[0] and months <= spec.lenient_service_max_months
        if spec.service_policy == "lenient" and early_minor:
            r.notes.append(f"Early service stint at {names} ({months} months), allowed by policy")
        else:
            why = ("only one early stint of up to "
                   f"{spec.lenient_service_max_months} months is allowed") if spec.service_policy == "lenient" \
                else "policy=strict"
            r.reasons.append(f"Service stint: {names} ({months} months; {why})")

    if spec.b2c_policy != "off":
        cur = current_stint(c)
        if spec.b2c_policy == "strict":
            b2c = [s for s in work_stints(c) if s.company_type == CompanyType.B2C]
        else:
            b2c = [s for s in work_stints(c) if s.company_type == CompanyType.B2C and (s is cur or is_ai_stint(s))]
        if b2c:
            r.reasons.append("B2C: " + ", ".join(sorted({s.company for s in b2c}))
                             + (" (current or AI role)" if spec.b2c_policy == "recent" else ""))

    if ai_mo < spec.near_miss_ai_months:
        r.reasons.append(f"Hands-on GenAI experience {ai_mo} months < {spec.min_ai_months} required")
    elif ai_mo < spec.min_ai_months:
        r.holds.append(f"Near-miss on GenAI experience: {ai_mo} months (need {spec.min_ai_months})")

    r.passed = not r.reasons
    return r

# ---------------------------------------------------------------- 6. seniority

STAFF_TITLE = re.compile(r"\b(staff|principal|architect|distinguished|lead|head of engineering)\b", re.I)
SENIOR_TITLE = re.compile(r"\bsenior|\bsr\.?\b|\bsde ?(iii|3)\b", re.I)
MANAGER_TITLE = re.compile(r"\b(manager|director|head|vp|vice president)\b", re.I)
SCOPE = re.compile(r"\b(led|lead|architected|architecture|owned|mentor(ed|ing)?|cross[- ](team|functional)|roadmap|"
                   r"design reviews?|rfcs?|tech lead|drove|set (the )?technical direction|hired|org-wide|platform)\b", re.I)
STAFF_SCOPE_HITS = 3   # scope bullets in the last two roles that make a Senior title count as staff
HANDS_ON = re.compile(r"\b(built|implemented|wrote|coded|shipped|developed|designed and built|optimi[sz]ed)\b", re.I)


def seniority(c: Candidate, years: float) -> Tuple[float, List[str]]:
    cur = current_stint(c)
    flags: List[str] = []
    if cur is None:
        return 0.0, ["No work history"]
    recent = [b for s in work_stints(c)[-2:] for b in s.bullets]
    scope_hits = sum(1 for b in recent if SCOPE.search(b))
    # HM: a Senior engineer doing staff-level work counts as staff, so scope can stand in for the title
    if STAFF_TITLE.search(cur.title) or (SENIOR_TITLE.search(cur.title) and scope_hits >= STAFF_SCOPE_HITS):
        title_pts = 10
    elif SENIOR_TITLE.search(cur.title):
        title_pts = 6
    else:
        title_pts = 2
    hands_on = any(HANDS_ON.search(b) for b in cur.bullets)

    if MANAGER_TITLE.search(cur.title) and not STAFF_TITLE.search(cur.title):
        title_pts = 6
        if not hands_on:
            flags.append("Manager drift: current role has no hands-on build bullets. Staff is an IC role")
    if STAFF_TITLE.search(cur.title) and years < 8:
        flags.append(f"Title inflation risk: '{cur.title}' with {years:.1f} yrs total")
    return title_pts + min(scope_hits / 4, 1) * 12 + (3 if hands_on else 0), flags

# ---------------------------------------------------------------- 7. scorer + red flags

def red_flags(c: Candidate, evidence: Dict[str, SkillEvidence], spec: RoleSpec, today: date) -> List[str]:
    flags = []
    stints = work_stints(c)
    last3 = stints[-3:]
    if len(last3) >= 3:
        avg = sum(stint_span(s, today)[1] - stint_span(s, today)[0] for s in last3) / len(last3)
        if avg < 18:
            flags.append(f"Job hopping: average tenure {avg:.0f} months across last 3 roles")
    for a, b in zip(stints, stints[1:]):
        gap = stint_span(b, today)[0] - stint_span(a, today)[1]
        if gap > 6:
            flags.append(f"Career gap: {gap} months before {b.company}. Ask, don't assume")
    for s in stints:
        if s.end and month_index(s.end) < month_index("2021-01") and any(
                _RX[k].search(b) for k in ("langchain", "langgraph", "genai") for b in s.bullets):
            flags.append(f"GenAI claim at {s.company} in a role that ended {s.end}, before the GenAI era. Verify")
    stuffed = [k for k in spec.core_skills + ["langchain", "langgraph"]
               if k in evidence and evidence[k].strength <= 0.25]
    if len(stuffed) >= 3:
        flags.append("Keyword stuffing: " + ", ".join(stuffed) + " appear only in the skills list")
    return flags


def score(c: Candidate, spec: RoleSpec, today: date, evidence: Dict[str, SkillEvidence],
          ai_mo: int, years: float) -> Tuple[Dict[str, float], List[str]]:
    def strength(k: str) -> float:
        own = evidence[k].strength if k in evidence else 0.0
        if k in ("langchain", "langgraph"):
            return max(own, strength("orchestration_alt") * ALT_FRAMEWORK_CREDIT)
        return own

    prod_bullets = sum(1 for s in work_stints(c) for b in s.bullets
                       if bullet_strength(b) == 1.0 and any(_RX[k].search(b) for k in GENAI_SKILLS))
    genai = min(ai_mo / 36, 1) * 15 + min(prod_bullets / 3, 1) * 12 + strength("evals") * 8

    staff, staff_flags = seniority(c, years)

    weights = spec.stack_weights
    stack = sum(w * strength(k) for k, w in weights.items()) * 20 / (sum(weights.values()) or 1)

    stints = work_stints(c)
    total = merged_months(stint_span(s, today) for s in stints) or 1
    good = merged_months(stint_span(s, today) for s in stints if s.company_type in GOOD_COMPANY_TYPES)
    cur = current_stint(c)
    company = good / total * 12 + (3 if cur and cur.company_type in GOOD_COMPANY_TYPES else 0)

    avg_tenure = total / max(len(stints), 1)
    recency = (3 if cur and is_ai_stint(cur) else 0) + (2 if avg_tenure >= 18 else 0)

    scores = {"genai_depth": genai, "staff_scope": staff, "stack": stack, "company_fit": company, "recency": recency}
    return {k: round(v, 1) for k, v in scores.items()}, staff_flags

# ---------------------------------------------------------------- 8. recruiter brief

def screen_questions(scores: Dict[str, float], evidence: Dict[str, SkillEvidence], flags: List[str]) -> List[str]:
    """Aim the 30-minute screen at the weakest dimensions (FRAMEWORK.md §7)."""
    q = []
    if scores["genai_depth"] < 25:
        q.append("Walk me through the last RAG/LLM system you shipped. How did you evaluate retrieval and answer quality?")
        q.append("What broke in production that didn't break in the demo?")
    if evidence.get("agentic", SkillEvidence(skill="agentic", strength=0)).strength < 1.0 or \
            "langgraph" not in evidence or evidence["langgraph"].strength < 0.6:
        q.append("How did you manage state, retries and human-in-the-loop in your agent? Why that framework?")
    if evidence.get("guardrails", SkillEvidence(skill="guardrails", strength=0)).strength < 0.6:
        q.append("How did you handle prompt injection, PII and off-topic answers in production?")
    if scores["staff_scope"] < 18:
        q.append("Tell me about a technical decision you drove that other teams had to adopt.")
        q.append("Who have you mentored, and what changed for them?")
    if any(f.startswith("Manager drift") for f in flags):
        q.append("When did you last write production code? What % of your week is hands-on today?")
    if any(f.startswith("Job hopping") for f in flags):
        q.append("Talk me through why you left each of your last three roles.")
    q.append("Logistics: current CTC, expected CTC, notice period / LWD, competing offers, location.")
    return q
