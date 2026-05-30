"""evogym candidate generators — mirrors matmul_loop's candidate_batch shape.

Each Candidate carries:
  - name (str): unique identifier within a batch
  - body (np.ndarray): 5x5 voxel grid (the "ir" equivalent)
  - family (str): generator family — random / mutate / crossover / hand_designed
  - notes (str): freeform — hypothesis text, parent ids, etc.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

GRID = 5


@dataclass
class Candidate:
    name: str
    body: np.ndarray
    family: str
    notes: str = ""


def random_body(rng: np.random.Generator) -> np.ndarray:
    """Random connected actuated body via evogym's sampler."""
    from evogym import sample_robot, is_connected, has_actuator
    for _ in range(60):
        body, _ = sample_robot((GRID, GRID))
        if is_connected(body) and has_actuator(body):
            return body.astype(np.int8)
    # canonical fallback
    return np.array([
        [0, 1, 1, 1, 0],
        [1, 3, 4, 3, 1],
        [1, 4, 1, 4, 1],
        [1, 3, 4, 3, 1],
        [0, 1, 1, 1, 0],
    ], dtype=np.int8)


def mutate(parent: np.ndarray, rng: np.random.Generator, strength: float = 0.1) -> np.ndarray:
    """Flip a fraction of voxels; reject invalid until found or give up."""
    from evogym import is_connected, has_actuator
    n_pix = GRID * GRID
    n_flip = max(1, int(n_pix * strength))
    for _ in range(50):
        child = parent.copy()
        idx = rng.choice(n_pix, n_flip, replace=False)
        for i in idx:
            y, x = divmod(int(i), GRID)
            child[y, x] = int(rng.choice(5, p=[0.2, 0.25, 0.15, 0.2, 0.2]))
        if is_connected(child) and has_actuator(child):
            return child
    return parent.copy()


def crossover(p1: np.ndarray, p2: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Vertical-split crossover with validity rejection."""
    from evogym import is_connected, has_actuator
    for _ in range(30):
        cut = int(rng.integers(1, GRID))
        child = p1.copy()
        child[:, cut:] = p2[:, cut:]
        if is_connected(child) and has_actuator(child):
            return child
    return p1.copy()


# ---------- baseline batch (matches matmul_loop.candidate_batch shape) ----------


def baseline_batch(seed: int = 42) -> list[Candidate]:
    """Initial diverse batch — random bodies + one hand-designed canonical snake."""
    rng = np.random.default_rng(seed)
    cands: list[Candidate] = []

    # Hand-designed canonical body — the snake from arbor planner round 1
    snake = np.array([
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 0, 1, 0, 1],
        [4, 3, 4, 3, 4],
        [3, 1, 3, 1, 3],
    ], dtype=np.int8)
    cands.append(Candidate("snake_canonical", snake, "hand_designed",
                           "H-R-H-R-H bottom anchor pattern; V-H mid; sparse R top"))

    # Random batch
    for i in range(7):
        cands.append(Candidate(f"random_{i:02d}", random_body(rng), "random",
                               "evogym sample_robot"))
    return cands


def mutate_batch(parent: Candidate, n: int, rng: np.random.Generator,
                 strength: float = 0.1) -> list[Candidate]:
    return [
        Candidate(f"mut_{parent.name}_{i:02d}", mutate(parent.body, rng, strength),
                  "mutate", f"parent={parent.name} strength={strength:.3f}")
        for i in range(n)
    ]


def crossover_batch(p1: Candidate, p2: Candidate, n: int,
                    rng: np.random.Generator) -> list[Candidate]:
    return [
        Candidate(f"cross_{p1.name}_x_{p2.name}_{i:02d}",
                  crossover(p1.body, p2.body, rng),
                  "crossover", f"parents={p1.name},{p2.name}")
        for i in range(n)
    ]
