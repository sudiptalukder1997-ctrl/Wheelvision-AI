# Staff GenAI Engineer — Candidate Matching Framework

Source brief (hiring manager's handwritten note):

> No B2C · B2B SaaS or AI Native · 8+ years · Staff level · No service stint ·
> GenAI, Agentic AI, LLM, LangChain, LangGraph, guardrails, RAG · 2–3 years of exp in AI

This document is the talent-acquisition read of that note. The code in this folder
implements it, but the decisions below come first. If a rule here is wrong, the
agent will be wrong at scale, so this is the part to argue about with the hiring manager.

---

## 1. What the note actually says (decoded)

A note like this mixes three kinds of things. Treating them all as "requirements" is the
most common sourcing mistake, because it either empties the funnel or lets noise through.

| Line in the note | Type | What it really means | How we verify it |
|---|---|---|---|
| **8+ years** | Knockout | 8+ years of **full-time** professional work after graduation. Internships, training periods and overlapping side gigs don't count. | Sum of de-duplicated full-time/contract months from the work history. |
| **No service stint** | Knockout | **HM decision: one early, minor stint is OK.** At most one job at an IT services, consulting or outsourcing firm (TCS, Infosys, Wipro, Accenture, Cognizant…). It must be the candidate's first job and last ≤ 24 months. A second services job, or a long one, means reject. This is about engineering culture: product ownership vs. delivering to a client's spec. | Each employer is classified against a company list. Unknown employers go to a human. An allowed early stint is noted in the report. |
| **No B2C** + **B2B SaaS or AI Native** | Knockout + scored | **HM decision:** the candidate's **current company, and every company where they did their AI work**, must not be B2C. They should be B2B SaaS or a B2B AI-native company. Earlier B2C years cost points but don't reject. | Company classification + which roles contain the AI work. |
| **2–3 years of exp in AI** | Knockout | At least **2 years of hands-on GenAI/LLM work**. "3" is a target, not a cap. **HM decision: classical ML/NLP doesn't count** (churn models, pre-2022 BERT/transformer work), not even as a bonus. | Months in roles whose bullets show real (not POC) LLM work, counted from 2022 onward. |
| **GenAI, Agentic AI, LLM, LangChain, LangGraph, guardrails, RAG** | Scored | The stack. **LLM + RAG + agentic** are the core; guardrails is the signal that they've shipped to real users. **HM decision: LangChain/LangGraph are preferred, not required.** Other frameworks (LlamaIndex, CrewAI, AutoGen, Semantic Kernel, Haystack, DSPy, custom orchestration) get half credit in their place. | Evidence strength per skill (see §4). Listing a skill without using it earns almost nothing. |
| **Staff level** | Scored (strong) | Someone who sets technical direction across teams and is **still hands-on**. **HM decision: a Senior engineer doing staff-level work counts.** A Senior title with 3+ scope bullets (architected, led across teams, mentored, RFCs) in the last two roles gets the same title credit as Staff. | Title + scope language + recent build bullets. |

### Why these interpretations

- **"No service stint" = one early, minor stint allowed** (HM confirmed, `service_policy: lenient`).
  Many strong Indian engineers started at TCS/Infosys out of campus, then moved to product. Rejecting them
  costs a lot of the pool. Going *back* to services later, or spending years there, is the real
  culture signal, so both still reject. `strict` (never) is still available if the HM changes their mind.
- **AI services firms are still services.** Fractal, Tiger Analytics, Quantiphi, LatentView, Mu Sigma
  and Tredence sound like "AI companies", but they bill clients for projects. This is the trap
  most screeners fall into.
- **GCCs / captives are not services.** Goldman Sachs, JPMorgan, Walmart Global Tech etc. build
  in-house product. They aren't B2B SaaS either, so they pass the knockout, score lower on company
  fit, and get flagged.
- **Big tech is mixed.** Microsoft/Google/Amazon could mean Azure AI (great) or a consumer app (B2C).
  The agent can't tell from the company name, so it sends these to a human who checks the team.
- **"2–3 years AI" can't be 7 years.** GenAI as a production discipline started around 2022.
  Someone claiming 6 years of LangChain is padding their CV (LangChain launched in Oct 2022).
  We count AI months from 2022-01 and flag GenAI claims dated earlier.

---

## 2. Funnel and decision bands

```
Sourced profiles ──► Knockouts ──► Scored (0–100) ──► Decision
                        │                                 │
                        └─ fail → REJECT (with reason)    ├─ ≥ 75   SHORTLIST → straight to HM review
                                                          ├─ 60–74  SCREEN    → recruiter call to close gaps
                                                          ├─ < 60   REJECT    (low fit)
                                                          └─ any unresolved ambiguity → HOLD (human decides)
```

**HOLD exists on purpose.** It covers an unknown company type, a big-tech employer, or near-misses
(7.5–8 years, 20–24 months of AI). An agent that guesses on these will quietly drop good
people or let bad fits through. A recruiter can clear a HOLD in about 2 minutes.

### Realistic funnel for this profile (India, planning estimate, not data)

This is a narrow profile: 8+ years, never in services, B2B only, 2+ years of production GenAI, staff scope.
Plan on roughly:

| Stage | Count |
|---|---|
| Profiles pulled from boolean search | 300–400 |
| Pass knockouts | 30–50 |
| SHORTLIST + SCREEN | 12–20 |
| Recruiter screens done | 10–15 |
| HM interviews | 5–6 |
| Final round | 2 |

If knockouts pass fewer than 5% after the first 100 profiles, the brief is too tight. Go back to the HM
with the data (§6), and don't loosen it quietly.

---

## 3. Scoring model (100 points, applied only after knockouts pass)

| Dimension | Pts | What earns points |
|---|---|---|
| **GenAI depth & production evidence** | 35 | AI months (up to 36 → 15 pts), bullets showing *shipped* LLM work with users/latency/scale/business numbers (12), evals / observability / LLMOps (8). |
| **Staff-level scope** | 25 | Current title (Staff/Principal/Architect/Lead = 10, Senior = 6), scope language: architected, led across teams, mentored, RFCs, roadmap (12), recent hands-on build bullets (3). |
| **Stack coverage** | 20 | LangGraph 4 · RAG 4 · Agentic 4 · LangChain 3 · LLM 3 · Guardrails 3 · GenAI 1 (scaled to 20), each multiplied by evidence strength. Alternatives to LangChain/LangGraph get 50%. |
| **Company fit** | 15 | Share of career at B2B SaaS / AI-native (12) + currently at one (3). |
| **Recency & stability** | 5 | Doing GenAI in the current role (3), average tenure ≥ 18 months (2). |

Weighting rationale: the HM wrote the stack and AI years in the most detail, so GenAI depth and
stack together are 55%. "Staff" is the level we are paying for, so it gets 25%. Company fit is
already mostly handled by the knockouts, so it only adjusts the score.

---

## 4. Evidence strength: how we beat keyword stuffing

Every GenAI resume now lists "LangChain, LangGraph, RAG, Agents". The skill list is noise.
The bullet is the signal.

| Where the skill appears | Strength | Example |
|---|---|---|
| In a work bullet **with a production marker** (users, customers, latency, %, $, scale, deployed, shipped) | **1.0** | "Built a LangGraph agent that resolves 38% of L1 tickets for 200+ enterprise customers" |
| In a work bullet, no production marker | 0.6 | "Implemented RAG pipeline using LangChain and pgvector" |
| In a bullet marked POC / prototype / hackathon / explored / course | 0.3 | "Explored LangChain for an internal POC" |
| Only in the skills section | 0.25 | `Skills: LangChain, LangGraph, RAG, Agents` |

A role counts toward **AI years** only if it has at least one bullet at ≥ 0.6. Doing POCs
alone does not count as AI experience.

**Keyword-stuffing flag:** three or more core skills that appear only in the skills list.

---

## 5. Red flags (raised, not auto-rejected)

| Flag | Rule | What the recruiter does |
|---|---|---|
| Title inflation | "Staff/Principal" title with < 8 years total | Probe scope: team size, cross-team decisions |
| Manager drift | Current title is Manager/Director/Head with no build bullets | Ask: "When did you last write production code?" Staff is an IC role. |
| Job hopping | Average tenure across the last 3 roles < 18 months | Ask why. Startups shutting down is fine; a pattern isn't. |
| Career gap | > 6 months between roles | Neutral. Ask, don't assume. |
| Pre-2021 GenAI claim | LLM keywords in a role that ended before 2021 | Likely padded or mislabeled classical NLP |
| Keyword stuffing | See §4 | Run the deep-dive questions in §7 |
| Unknown / mixed employer | Not in the company list, or big tech | Check the company and team, then reclassify |

---

## 6. Intake questions to close with the hiring manager before sourcing

These are the ambiguities in the note. Get answers in writing, then set them in `role_spec.json`.

**Decided with the HM:**

| Question | Answer | Config |
|---|---|---|
| Service stint: ever, or not recent? | One early stint is OK, as long as it isn't major | `service_policy: lenient`, `lenient_service_max_months: 24` |
| LangChain / LangGraph must-have? | Preferred, not required | `stack_weights` langgraph 4, langchain 3; alternatives get 50% |
| Does the title have to say Staff? | No, a Senior doing staff-level work counts | Senior + 3 scope bullets = Staff title credit |
| No B2C: whole career or recent? | Only the current company and the AI roles; earlier B2C is fine | `b2c_policy: recent` |
| Does classical ML count toward AI years? | No. Only hands-on GenAI/LLM work counts | `genai_era_start: 2022-01`; only GenAI keywords qualify a role |

**Still open:**

1. **B2B arms of consumer companies** (e.g. Swiggy's merchant platform): these are currently treated as B2C.
   If someone shows up with one, the recruiter overrides the company type by hand.
2. **Comp band and notice period ceiling.** 90-day notice is standard in India. Is buyout possible?
3. **Location / remote**, and whether relocation is acceptable.

---

## 7. Recruiter screen kit (30 min, run on SCREEN and SHORTLIST)

The agent writes questions aimed at each candidate's weakest dimension. The core bank:

**GenAI depth**
- "Walk me through the last RAG system you shipped. How did you chunk, retrieve, and re-rank, and how did
  you know retrieval quality was good enough?" *(Weak answer: no evaluation method.)*
- "What broke in production that didn't break in the demo?" *(Strong answer: latency, cost, hallucination
  on edge cases, stale index.)*

**Agentic / LangGraph**
- "How did you manage state, retries and human-in-the-loop in your agent?" *(Listen for checkpointing,
  interrupt nodes, tool-call failure handling.)*
- "When did you decide *not* to use an agent?"

**Guardrails**
- "How did you handle prompt injection, PII and off-topic answers?" *(Listen for input/output
  validation, a classifier or policy layer, and red-team tests, not just "we used a system prompt".)*

**Staff scope**
- "Tell me about a technical decision you drove that other teams had to adopt."
- "Who did you mentor, and what changed for them?"

**Logistics:** current CTC, expected CTC, notice period / last working day, competing offers, location.

---

## 8. Agentic workflow

The workflow is linear on purpose. Each agent does one judgment, cites the evidence for it, and hands
off. **Knockouts are deterministic code, not LLM calls.** A rejection must be auditable and the same
every time. The LLM is used where language understanding helps: parsing messy resumes and
classifying companies that aren't on the list.

```
          ┌───────────────────┐
 HM note ►│ 0 Intake          │  → role_spec.json + open questions (§6)   [human sign-off]
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 1 Sourcing        │  → boolean strings + include/exclude company lists
          └─────────┬─────────┘
 resumes /┌─────────▼─────────┐
 ATS JSON►│ 2 Parser          │  → structured work history (LLM for raw text; pass-through for JSON)
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 3 Company         │  → b2b_saas | ai_native | b2c | services | gcc | big_tech | unknown
          │   classifier      │    (company list first, LLM second, otherwise HOLD)
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 4 Knockout        │  → pass / fail with reason   (deterministic)
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 5 Evidence        │  → per-skill strength + quoted bullets, AI months
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 6 Seniority       │  → staff signals, manager drift, title inflation
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 7 Scorer + flags  │  → 0–100, decision band, red flags
          └─────────┬─────────┘
          ┌─────────▼─────────┐
          │ 8 Recruiter brief │  → ranked report + tailored screen questions   [human review]
          └───────────────────┘
```

### Fairness and compliance guardrails

- The scoring never uses name, gender, age, photo, college name or location. Years of experience come
  from work dates, not graduation year.
- Every reject carries a reason a recruiter can read back to the candidate.
- The LLM only sees what it needs (resume text for parsing, a company name for classification).
- A human makes every final decision. The agent ranks and explains; it does not send rejections.

### Where this goes next (not built yet, on purpose)

1. Run it on 50 real profiles that the HM has already judged by hand, and compare the agent's
   decisions with theirs before trusting it.
2. Learn the weights from HM accept/reject feedback after ~100 decisions.
3. Connect it to the ATS (Greenhouse/Lever/Zoho Recruit) to pull and push candidates.
