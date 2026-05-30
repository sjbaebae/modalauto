"""evogym Walker-v0 scorer + verifier — domain adapter for modalauto.

Mirrors the matmul.verify_general_matmul.py contract:
  Input  = candidate artifact path (here: .npy body grid).
  Output = {"semantic": "ok"|"invalid", "official_score": float,
            "buckets": {...}, "error": str}

Replaces matmul's integer energy with evogym's float forward-reward.
Adds multi-seed evaluation since evogym is stochastic.
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path
from typing import Iterable

warnings.filterwarnings("ignore")
import numpy as np


# Voxel codes match evogym: 0=empty, 1=rigid, 2=soft, 3=h-act, 4=v-act


def load_body(path: Path | str) -> np.ndarray:
    return np.load(path).astype(np.int8)


def verify_body(body: np.ndarray) -> tuple[bool, str]:
    """Structural verifier: must be connected + have actuator."""
    from evogym import is_connected, has_actuator  # local import (slow)

    if body.shape != (5, 5):
        return False, f"wrong_shape {body.shape}"
    if not is_connected(body):
        return False, "disconnected"
    if not has_actuator(body):
        return False, "no_actuator"
    return True, ""


def _evaluate_one(body: np.ndarray, rollout_steps: int, seed: int) -> float:
    """One Walker-v0 rollout, sine-wave controller. Returns total forward reward."""
    import gymnasium as gym
    import evogym.envs  # noqa: F401

    rng = np.random.default_rng(seed)
    env = gym.make("Walker-v0", body=body)
    try:
        obs, _info = env.reset(seed=seed)
        n_acts = env.action_space.shape[0]
        phases = rng.uniform(0, 2 * np.pi, size=n_acts)
        freq = 0.15
        total = 0.0
        for t in range(rollout_steps):
            raw = 0.5 * (np.sin(freq * t * 2 * np.pi + phases) + 1)
            a = 0.6 + raw * (1.6 - 0.6)
            obs, r, term, trunc, info = env.step(a)
            total += float(r)
            if term or trunc:
                break
        return total
    finally:
        env.close()


def score_body(
    body: np.ndarray,
    rollout_steps: int = 80,
    seeds: Iterable[int] = (42, 43, 44),
) -> dict:
    """Multi-seed evaluation. Returns dict matching matmul verifier shape."""
    ok, err = verify_body(body)
    if not ok:
        return {
            "semantic": "invalid",
            "official_score": None,
            "buckets": {},
            "error": err,
        }

    seed_list = list(seeds)
    scores: list[float] = []
    for s in seed_list:
        try:
            scores.append(_evaluate_one(body, rollout_steps, s))
        except Exception as exc:
            return {
                "semantic": "invalid",
                "official_score": None,
                "buckets": {},
                "error": f"sim_error_seed_{s}: {exc}",
            }

    mean = float(np.mean(scores))
    std = float(np.std(scores))
    lo = float(np.min(scores))
    hi = float(np.max(scores))
    return {
        "semantic": "ok",
        "official_score": mean,        # use mean as the official score
        "buckets": {
            "seeds": seed_list,
            "scores_per_seed": scores,
            "mean": mean,
            "std": std,
            "min": lo,
            "max": hi,
            "n_seeds": len(seed_list),
            "rollout_steps": rollout_steps,
            "n_voxels": int((body != 0).sum()),
            "n_h_actuators": int((body == 3).sum()),
            "n_v_actuators": int((body == 4).sum()),
        },
        "error": "",
    }


def main(argv: list[str] | None = None) -> int:
    """CLI: arbor-evogym-scorer body.npy [--seeds 42,43,44] [--steps 80]"""
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("body", type=Path)
    parser.add_argument("--seeds", default="42,43,44")
    parser.add_argument("--steps", type=int, default=80)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    body = load_body(args.body)
    seeds = [int(s) for s in args.seeds.split(",")]
    result = score_body(body, rollout_steps=args.steps, seeds=seeds)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if result["semantic"] == "ok":
            print(f"ok mean={result['official_score']:+.4f} "
                  f"std={result['buckets']['std']:.4f} "
                  f"range=[{result['buckets']['min']:+.4f},{result['buckets']['max']:+.4f}]")
        else:
            print(f"invalid {result['error']}")
    return 0 if result["semantic"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
