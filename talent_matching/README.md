# talent_matching: agentic candidate matching

Screens candidates against the **Staff GenAI Engineer** brief. Read **[FRAMEWORK.md](FRAMEWORK.md)** first:
it covers how the brief was interpreted, the knockouts, the scoring and the intake questions for the hiring manager.

```bash
pip install -r talent_matching/requirements.txt

# Score structured profiles (ATS / LinkedIn export shape — see samples/candidates.json)
python -m talent_matching run --input talent_matching/samples/candidates.json --out report.md

# Try the other policy readings of "No service stint" / "No B2C"
python -m talent_matching run --input ... --service-policy lenient --b2c-policy strict

# Raw .txt resumes parsed by Claude + unknown companies classified by Claude
python -m talent_matching run --resumes ./resumes --llm

# Boolean strings for LinkedIn Recruiter / Naukri
python -m talent_matching boolean

python -m pytest talent_matching/tests
```

| File | Agent / purpose |
|---|---|
| `role_spec.json` | The brief as config: thresholds and policies (edit after the HM intake call) |
| `company_kb.py` | Company list: services / B2B SaaS / AI-native / B2C / GCC / big tech |
| `agents.py` | Sourcing, company classifier, knockouts, evidence, seniority, scorer, screen questions |
| `llm.py` | Optional Claude steps (resume parsing, unknown-company classification) |
| `pipeline.py` | Orchestrator + markdown recruiter report |
| `samples/` | 11 fictional candidates covering each edge case, plus the generated `report.md` |

Knockouts and scoring are deterministic rules, so every reject is auditable. Claude is only used
to parse resumes and classify companies, and when it isn't sure the case goes to a human (HOLD).
