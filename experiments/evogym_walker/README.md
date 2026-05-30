# evogym_walker

Evolutionary Walker-v0 soft-robot morphology search.

## Layout

```
experiments/evogym_walker/
├── workflow.json              # declarative runner config
├── loop.py                    # single-process loop (mirrors matmul_reference)
├── evogym/
│   ├── scorer.py              # verify_body + score_body (multi-seed)
│   └── candidates.py          # Candidate dataclass + random/mutate/crossover
└── journal/                   # auto-created: SQLite + messages + research_memory
```

## Differences from matmul_reference

| | matmul_reference | evogym_walker |
|---|---|---|
| Direction | minimize (energy joules) | **maximize (forward reward)** |
| Score type | int | **float** |
| Determinism | deterministic | **stochastic** (sine-controller phases + sim) |
| Eval cost | ms | ~1s per rollout × multi-seed |
| Candidate artifact | IR text string | numpy 5×5 voxel grid (`.npy`) |
| Mitigations | none | multi-seed mean + std reported in `buckets_json` |

## Run

```bash
PYTHONPATH=/Users/naka/src/sutro \
  /Users/naka/src/evogym-env/bin/python \
  experiments/evogym_walker/loop.py \
  --run-id smoke_v1 --rollout-steps 80 --seeds 42,43,44
```

Or via the new layout helper:

```bash
AUTORESEARCH_EXPERIMENT=evogym_walker \
  PYTHONPATH=/Users/naka/src/sutro \
  /Users/naka/src/evogym-env/bin/python \
  experiments/evogym_walker/loop.py
```

## Requires

- `/Users/naka/src/evogym-env/` venv with evogym installed (Python 3.10)
- Symlink `/Users/naka/src/sutro/autoresearch → modalauto/` (for the existing bin scripts' path convention)

## Output artifacts (per run)

`experiments/evogym_walker/journal/artifacts/<run-id>/`:
- `candidates.csv` — name, family, semantic, score (mean), score_std, score_min, score_max, n_voxels, error, notes
- `summary.json` — run metadata + top-5
- `best.npy` — winning body grid (numpy)
- `best.txt` — winning body in EVRH-letter grid form
- `viz/<candidate>.gif` — rendered Walker-v0 rollout for each valid body
- `journal/runs/<run-id>.md` — human-readable note
