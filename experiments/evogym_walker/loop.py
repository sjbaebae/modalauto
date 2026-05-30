#!/usr/bin/env python3
"""evogym autoresearch loop — mirrors matmul_loop.py shape.

One process. Generate candidate batch → score each (multi-seed) → verify →
write CSV + summary JSON + best body NPY + run note. Same artifact shape
as matmul_loop so EvoFlow viz can render either domain.

Direction is MAXIMIZE here (vs matmul's MINIMIZE). best = highest score.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np

# Make `autoresearch` importable when this module is run as a script
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from autoresearch.backend import experiment_config
from autoresearch.experiments.evogym_walker.walker import scorer as evo_scorer
from autoresearch.experiments.evogym_walker.walker import candidates as evo_candidates
from autoresearch.experiments.evogym_walker.walker.candidates import Candidate


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_LAYOUT = experiment_config.layout("evogym_walker")
JOURNAL_ROOT = DEFAULT_LAYOUT.journal_dir


@dataclass
class Row:
    name: str
    family: str
    semantic: str
    score: float | None
    score_std: float
    score_min: float
    score_max: float
    n_voxels: int
    error: str
    notes: str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def score_candidates(
    cands: list[Candidate],
    seeds: list[int],
    rollout_steps: int,
) -> list[Row]:
    rows: list[Row] = []
    for c in cands:
        result = evo_scorer.score_body(c.body, rollout_steps=rollout_steps, seeds=seeds)
        if result["semantic"] != "ok":
            rows.append(Row(
                name=c.name, family=c.family, semantic="invalid",
                score=None, score_std=0.0, score_min=0.0, score_max=0.0,
                n_voxels=int((c.body != 0).sum()),
                error=result["error"], notes=c.notes,
            ))
            continue
        b = result["buckets"]
        rows.append(Row(
            name=c.name, family=c.family, semantic="ok",
            score=result["official_score"],
            score_std=b["std"], score_min=b["min"], score_max=b["max"],
            n_voxels=b["n_voxels"],
            error="", notes=c.notes,
        ))
    return rows


def write_run(
    run_id: str,
    rows: list[Row],
    cands: list[Candidate],
    journal_root: Path,
    seeds: list[int],
    rollout_steps: int,
) -> Path:
    artifact_dir = journal_root / "artifacts" / run_id
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # CSV
    csv_path = artifact_dir / "candidates.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "name", "family", "semantic", "score", "score_std",
            "score_min", "score_max", "n_voxels", "error", "notes",
        ])
        writer.writeheader()
        for r in rows:
            d = r.__dict__.copy()
            d["score"] = "" if d["score"] is None else f"{d['score']:.6f}"
            writer.writerow(d)

    # Best body
    valid = [(r, c) for r, c in zip(rows, cands) if r.semantic == "ok"]
    if valid:
        valid.sort(key=lambda rc: -rc[0].score)  # MAXIMIZE
        best_row, best_cand = valid[0]
        np.save(artifact_dir / "best.npy", best_cand.body)
        body_str = "\n".join(" ".join({0:"E",1:"R",2:"S",3:"H",4:"V"}[int(v)]
                                       for v in row) for row in best_cand.body)
        (artifact_dir / "best.txt").write_text(body_str + "\n")
    else:
        best_row = None

    # Summary JSON
    summary = {
        "run_id": run_id,
        "created_at": now_iso(),
        "domain": "evogym-walker",
        "direction": "maximize",
        "primary_metric": "mean_forward_reward",
        "n_candidates": len(rows),
        "n_ok": sum(1 for r in rows if r.semantic == "ok"),
        "n_invalid": sum(1 for r in rows if r.semantic == "invalid"),
        "seeds": seeds,
        "rollout_steps": rollout_steps,
        "best": None if best_row is None else best_row.__dict__,
        "top_5": [r.__dict__ for r in
                  sorted([r for r in rows if r.semantic == "ok"],
                         key=lambda r: -r.score)[:5]],
    }
    (artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    # Run note
    (artifact_dir / "run.md").write_text(
        f"# evogym run {run_id}\n\n"
        f"- Domain: Walker-v0, direction = maximize forward_reward\n"
        f"- Candidates: {len(rows)} ({summary['n_ok']} ok, {summary['n_invalid']} invalid)\n"
        f"- Seeds per eval: {seeds}\n"
        f"- Rollout steps: {rollout_steps}\n"
        f"- Best: {best_row.name if best_row else 'none'} "
        f"= {best_row.score if best_row else '—'}\n"
    )
    return artifact_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", default="evogym_loop_v1")
    parser.add_argument("--seeds", default="42,43,44",
                        help="Comma-sep seeds for multi-seed scoring")
    parser.add_argument("--rollout-steps", type=int, default=80)
    parser.add_argument("--seed", type=int, default=42, help="seed for candidate gen")
    parser.add_argument("--journal-root", type=Path, default=JOURNAL_ROOT)
    parser.add_argument("--experiment-root", type=Path, default=None,
                        help="override experiment root (workflow.json passes this)")
    parser.add_argument("--n-mutations", type=int, default=4,
                        help="extra mutated children of the random batch's first candidate")
    args = parser.parse_args(argv)

    # Honor workflow.json --experiment-root substitution
    if args.experiment_root is not None:
        layout = experiment_config.layout(root=args.experiment_root)
        args.journal_root = layout.journal_dir

    seeds = [int(s) for s in args.seeds.split(",")]
    rng = np.random.default_rng(args.seed)

    start = time.perf_counter()
    cands = evo_candidates.baseline_batch(seed=args.seed)
    # Add mutations of the canonical snake (first candidate)
    cands.extend(evo_candidates.mutate_batch(cands[0], args.n_mutations, rng, strength=0.1))
    print(f"[batch] {len(cands)} candidates", file=sys.stderr)

    rows = score_candidates(cands, seeds, args.rollout_steps)
    artifact_dir = write_run(args.run_id, rows, cands,
                              args.journal_root.expanduser().resolve(),
                              seeds, args.rollout_steps)

    valid = sorted([r for r in rows if r.semantic == "ok"], key=lambda r: -r.score)
    out = {
        "artifact_dir": str(artifact_dir),
        "best": None if not valid else {
            "name": valid[0].name,
            "score": valid[0].score,
            "score_std": valid[0].score_std,
            "family": valid[0].family,
        },
        "elapsed_seconds": round(time.perf_counter() - start, 3),
    }
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
