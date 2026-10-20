"""Orchestrator: runs the agents in order and produces the decision + recruiter brief."""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from . import agents
from .models import Candidate, Decision, Evaluation, RoleSpec


def evaluate(c: Candidate, spec: RoleSpec, today: Optional[date] = None, use_llm: bool = False) -> Evaluation:
    today = today or date.today()
    c = c.model_copy(deep=True)

    unresolved = agents.classify_companies(c, use_llm=use_llm)
    years = agents.total_years(c, today)
    ai_mo = agents.ai_months(c, spec, today)
    ko = agents.knockout(c, spec, today, years, ai_mo)
    ko.holds += [f"Check company type: {u}" for u in unresolved]

    evidence = agents.collect_evidence(c)
    scores, staff_flags = agents.score(c, spec, today, evidence, ai_mo, years)
    total = round(sum(scores.values()), 1)
    flags = staff_flags + agents.red_flags(c, evidence, spec, today)

    if not ko.passed:
        decision = Decision.REJECT
    elif ko.holds:
        decision = Decision.HOLD
    elif total >= spec.shortlist_threshold:
        decision = Decision.SHORTLIST
    elif total >= spec.screen_threshold:
        decision = Decision.SCREEN
    else:
        decision = Decision.REJECT

    return Evaluation(
        candidate=c, total_years=round(years, 1), ai_months=ai_mo, knockout=ko, evidence=evidence,
        scores=scores, total_score=total, flags=flags, decision=decision,
        screen_questions=agents.screen_questions(scores, evidence, flags) if decision != Decision.REJECT else [],
    )


_ORDER = {Decision.SHORTLIST: 0, Decision.SCREEN: 1, Decision.HOLD: 2, Decision.REJECT: 3}


def run(candidates: List[Candidate], spec: RoleSpec, today: Optional[date] = None,
        use_llm: bool = False) -> List[Evaluation]:
    results = [evaluate(c, spec, today, use_llm) for c in candidates]
    return sorted(results, key=lambda e: (_ORDER[e.decision], -e.total_score))


def report(results: List[Evaluation], spec: RoleSpec) -> str:
    lines = [f"# Candidate report: {spec.role}", "",
             f"Policies: service=`{spec.service_policy}`, b2c=`{spec.b2c_policy}`, "
             f"min {spec.min_total_years:g} yrs, min {spec.min_ai_months} months GenAI.", "",
             "| # | Candidate | Decision | Score | Yrs | GenAI mo | Why |", "|---|---|---|---|---|---|---|"]
    for i, e in enumerate(results, 1):
        if e.knockout.reasons or e.knockout.holds:
            why = "; ".join(e.knockout.reasons or e.knockout.holds)
        elif e.decision == Decision.REJECT:
            why = "; ".join([f"Score below {spec.screen_threshold}", *e.flags[:1]])
        else:
            why = "; ".join(e.flags[:1]) or "Meets brief"
        lines.append(f"| {i} | {e.candidate.name} | **{e.decision.value}** | {e.total_score:g} | "
                     f"{e.total_years:g} | {e.ai_months} | {why} |")

    for e in results:
        c = e.candidate
        lines += ["", f"## {c.name} · {e.decision.value} · {e.total_score:g}/100", "",
                  f"{c.headline}  ", f"Notice: {c.notice_period_days or '?'} days · {c.location}", ""]
        lines.append("**Career:** " + " → ".join(
            f"{s.company} [{s.company_type.value}] {s.start}–{s.end or 'now'}" for s in agents.work_stints(c)))
        if e.knockout.reasons:
            lines += ["", "**Knockouts failed:**"] + [f"- {r}" for r in e.knockout.reasons]
        if e.knockout.holds:
            lines += ["", "**Needs a human:**"] + [f"- {h}" for h in e.knockout.holds]
        lines += ["", "**Scores:** " + ", ".join(f"{k} {v:g}" for k, v in e.scores.items())]
        strong = [ev for ev in e.evidence.values() if ev.strength >= 0.6]
        if strong:
            lines += ["", "**Evidence:**"] + [f"- {ev.skill} ({ev.strength:g}) @ {ev.company}: \"{ev.quote}\""
                                              for ev in sorted(strong, key=lambda x: -x.strength)]
        if e.flags:
            lines += ["", "**Red flags:**"] + [f"- {f}" for f in e.flags]
        if e.screen_questions:
            lines += ["", "**Screen questions:**"] + [f"{i}. {q}" for i, q in enumerate(e.screen_questions, 1)]
    return "\n".join(lines) + "\n"
