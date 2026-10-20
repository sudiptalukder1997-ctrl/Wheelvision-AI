"""CLI.

  python -m talent_matching run --input talent_matching/samples/candidates.json --out report.md
  python -m talent_matching run --resumes ./resumes --llm          # raw .txt resumes, parsed by Claude
  python -m talent_matching boolean                                # sourcing strings
"""
import argparse
import json
import sys
from datetime import date
from pathlib import Path

from . import agents, llm, pipeline
from .models import Candidate, RoleSpec

HERE = Path(__file__).parent


def main() -> int:
    p = argparse.ArgumentParser(prog="talent_matching")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--input", type=Path, help="JSON list of candidates (ATS / LinkedIn export shape)")
    r.add_argument("--resumes", type=Path, help="Folder of .txt resumes (needs --llm)")
    r.add_argument("--spec", type=Path, default=HERE / "role_spec.json")
    r.add_argument("--service-policy", choices=["strict", "lenient"])
    r.add_argument("--b2c-policy", choices=["recent", "strict", "off"])
    r.add_argument("--llm", action="store_true", help="Use Claude for resume parsing and unknown companies")
    r.add_argument("--today", help="Reference date YYYY-MM-DD (default: today)")
    r.add_argument("--out", type=Path)
    b = sub.add_parser("boolean")
    b.add_argument("--spec", type=Path, default=HERE / "role_spec.json")
    args = p.parse_args()

    spec = RoleSpec.load(args.spec)
    if args.cmd == "boolean":
        for k, v in agents.boolean_search(spec).items():
            print(f"## {k}\n{v}\n")
        return 0

    if args.service_policy:
        spec.service_policy = args.service_policy
    if args.b2c_policy:
        spec.b2c_policy = args.b2c_policy

    candidates = []
    if args.input:
        candidates += [Candidate.model_validate(x) for x in json.loads(args.input.read_text())]
    if args.resumes:
        if not args.llm:
            p.error("--resumes needs --llm")
        for f in sorted(args.resumes.glob("*.txt")):
            parsed = llm.parse_resume(f.stem, f.read_text())
            if parsed is None:
                print(f"Could not parse {f.name}, needs manual entry", file=sys.stderr)
            else:
                candidates.append(parsed)
    if not candidates:
        p.error("no candidates: pass --input and/or --resumes")

    today = date.fromisoformat(args.today) if args.today else None
    md = pipeline.report(pipeline.run(candidates, spec, today, use_llm=args.llm), spec)
    if args.out:
        args.out.write_text(md)
        print(f"Wrote {args.out}")
    else:
        print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
