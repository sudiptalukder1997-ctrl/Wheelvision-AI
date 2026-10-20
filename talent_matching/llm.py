"""Optional Claude-backed agents: resume parsing and classifying unknown companies.

Only used where language understanding is needed. Knockouts and scoring stay deterministic
so every rejection is auditable. If the `anthropic` package or credentials are missing,
these functions return None and the pipeline falls back to HOLD for a human.
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from pydantic import BaseModel

from .models import Candidate, CompanyType

log = logging.getLogger(__name__)
MODEL = "claude-opus-5-5"


def _client():
    try:
        import anthropic
        return anthropic.Anthropic()
    except Exception as exc:  # package missing or no credentials
        log.info("Claude unavailable, skipping LLM step: %s", exc)
        return None


class _CompanyVerdict(BaseModel):
    company_type: Literal["b2b_saas", "ai_native", "b2c", "services", "gcc", "big_tech", "unknown"]
    confidence: Literal["high", "medium", "low"]
    reason: str


_COMPANY_SYSTEM = """You classify employers for a tech recruiter.
Categories:
- b2b_saas: sells software to businesses on subscription
- ai_native: B2B company whose core product is AI/LLM-based
- b2c: primary customers are consumers (apps, e-commerce, consumer fintech, edtech, food delivery)
- services: IT services, consulting, outsourcing, staffing, or analytics/AI services firms that bill client projects
- gcc: in-house technology centre of a non-tech enterprise (banks, retailers)
- big_tech: large multi-product tech company with both consumer and business lines
- unknown: you do not recognise the company or cannot tell
Use the role bullets as context. If you are not sure, answer unknown with low confidence: a human will check."""


def classify_company(company: str, context: str = "") -> Optional[CompanyType]:
    client = _client()
    if client is None:
        return None
    try:
        resp = client.messages.parse(
            model=MODEL,
            max_tokens=4096,
            system=_COMPANY_SYSTEM,
            messages=[{"role": "user", "content": f"Company: {company}\nRole context:\n{context}"}],
            output_format=_CompanyVerdict,
        )
    except Exception as exc:
        log.warning("Company classification failed for %s: %s", company, exc)
        return None
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        return None
    verdict = resp.parsed_output
    if verdict.confidence == "low":
        return CompanyType.UNKNOWN
    return CompanyType(verdict.company_type)


_PARSE_SYSTEM = """Extract a candidate's work history from a resume into the given schema.
Rules:
- Dates as YYYY-MM. Use null for end if the role is current.
- Keep each experience bullet verbatim; do not summarise or embellish.
- employment_type: internship for internships/trainee programmes, contract or freelance if stated, else full_time.
- Put the skills section into `skills` verbatim.
- Do not infer anything that is not written."""


def parse_resume(candidate_id: str, resume_text: str) -> Optional[Candidate]:
    client = _client()
    if client is None:
        return None
    try:
        resp = client.messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=_PARSE_SYSTEM,
            messages=[{"role": "user", "content": f"Candidate id: {candidate_id}\n\nResume:\n{resume_text}"}],
            output_format=Candidate,
        )
    except Exception as exc:
        log.warning("Resume parse failed for %s: %s", candidate_id, exc)
        return None
    if resp.stop_reason in ("refusal", "max_tokens") or resp.parsed_output is None:
        return None
    return resp.parsed_output
