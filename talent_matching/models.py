"""Data models shared by every agent in the pipeline."""
from __future__ import annotations

import json
from enum import Enum
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class CompanyType(str, Enum):
    B2B_SAAS = "b2b_saas"
    AI_NATIVE = "ai_native"      # B2B company whose core product is AI
    B2C = "b2c"
    SERVICES = "services"        # IT services / consulting / outsourcing (incl. "AI services" firms)
    GCC = "gcc"                  # captive / in-house tech centre of a non-tech enterprise
    BIG_TECH = "big_tech"        # mixed B2B/B2C — depends on the team
    UNKNOWN = "unknown"


GOOD_COMPANY_TYPES = {CompanyType.B2B_SAAS, CompanyType.AI_NATIVE}
REVIEW_COMPANY_TYPES = {CompanyType.BIG_TECH, CompanyType.UNKNOWN}


class Stint(BaseModel):
    company: str
    title: str
    start: str                                   # "YYYY-MM"
    end: Optional[str] = None                    # "YYYY-MM", None = present
    employment_type: Literal["full_time", "contract", "internship", "freelance"] = "full_time"
    bullets: List[str] = Field(default_factory=list)
    company_type: Optional[CompanyType] = None   # set by the company classifier (or a recruiter override)


class Candidate(BaseModel):
    id: str
    name: str
    headline: str = ""
    location: str = ""
    notice_period_days: Optional[int] = None
    skills: List[str] = Field(default_factory=list)
    stints: List[Stint] = Field(default_factory=list)


class RoleSpec(BaseModel):
    role: str
    min_total_years: float = 8
    near_miss_years: float = 7.5
    min_ai_months: int = 24
    near_miss_ai_months: int = 20
    genai_era_start: str = "2022-01"
    service_policy: Literal["strict", "lenient"] = "strict"
    lenient_service_max_months: int = 24
    b2c_policy: Literal["recent", "strict", "off"] = "recent"
    shortlist_threshold: int = 75
    screen_threshold: int = 60
    core_skills: List[str] = Field(default_factory=lambda: ["llm", "rag", "agentic"])
    stack_weights: Dict[str, float] = Field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> "RoleSpec":
        return cls.model_validate(json.loads(Path(path).read_text()))


class Decision(str, Enum):
    SHORTLIST = "SHORTLIST"
    SCREEN = "SCREEN"
    HOLD = "HOLD"
    REJECT = "REJECT"


class SkillEvidence(BaseModel):
    skill: str
    strength: float
    quote: Optional[str] = None
    company: Optional[str] = None


class KnockoutResult(BaseModel):
    passed: bool
    reasons: List[str] = Field(default_factory=list)      # hard fails
    holds: List[str] = Field(default_factory=list)        # needs a human before deciding
    notes: List[str] = Field(default_factory=list)        # passed, but worth telling the recruiter


class Evaluation(BaseModel):
    candidate: Candidate
    total_years: float
    ai_months: int
    knockout: KnockoutResult
    evidence: Dict[str, SkillEvidence] = Field(default_factory=dict)
    scores: Dict[str, float] = Field(default_factory=dict)
    total_score: float = 0.0
    flags: List[str] = Field(default_factory=list)
    decision: Decision = Decision.REJECT
    screen_questions: List[str] = Field(default_factory=list)
