# Autoresearch

Core orchestration code for running agentic research loops against reproducible experiment folders.

## Layout

The repository root is split by responsibility:

- `backend/`: core Python orchestration loop.
- `frontend/`: the browser app and its API/support scripts.
- `bin/`: command-line entrypoints.
- `experiments/`: experiment-specific folders.

Each experiment owns its generated state:

```text
experiments/<experiment_name>/
  README.md
  workflow.json
  <environment source files>
  journal/
    team_journal.db
    research_memory.db
    messages/
    artifacts/
    runs/
  worktrees/
```

`journal/` and `worktrees/` are generated and ignored by Git. Track only the files needed to reproduce the experiment, usually `README.md`, `workflow.json`, source code, configs, and small fixtures.

## Reference Run

From this directory:

```bash
python bin/autoresearch-team --experiment matmul init
python bin/autoresearch-matmul-loop --experiment matmul --run-id smoke --strategy baseline --verify-cases 1 --verify-top 1
python bin/autoresearch-team --experiment matmul status
```

The default experiment is `matmul`, so the `--experiment` flag can be omitted for the reference loop.

## New Experiment

Create a folder under `experiments/`:

```bash
mkdir -p experiments/my_env
```

Add `experiments/my_env/workflow.json`:

```json
{
  "name": "my_env",
  "description": "Short reproducible description.",
  "domain": "custom",
  "runner": {
    "command": "path/to/runner.py",
    "args": ["--experiment-root", "{experiment_root}"]
  },
  "paths": {
    "journal": "journal",
    "worktrees": "worktrees"
  }
}
```

Then run against it:

```bash
python bin/autoresearch-team --experiment my_env init
python bin/autoresearch-agent topline-manager --experiment my_env --once --no-apply-scale
```

You can also keep an experiment outside this repo:

```bash
python bin/autoresearch-team --experiment-root /path/to/my_env init
python bin/autoresearch-agent topline-manager --experiment-root /path/to/my_env --once --no-apply-scale
```

Environment variables are supported:

```bash
export AUTORESEARCH_EXPERIMENT=my_env
export AUTORESEARCH_EXPERIMENT_ROOT=/path/to/my_env
```

`AUTORESEARCH_EXPERIMENT_ROOT` takes precedence when both are set.

## Runner Contract

The current agent implementor calls the workflow runner with:

- `--run-id <id>`
- `--hypothesis-json <path>`
- `--journal-root <path>`

The reference matmul runner lives at `experiments/matmul/loop.py` and writes:

- `journal/artifacts/<run-id>/summary.json`
- `journal/artifacts/<run-id>/best.ir`
- `journal/runs/<run-id>.md`

For a fully custom environment, keep the same reproducibility shape: the runner should consume an experiment root, write artifacts under that experiment's journal, and avoid absolute machine-specific paths in tracked files.

## Generated Files

These are intentionally ignored:

- `experiments/*/journal/`
- `experiments/*/worktrees/`
- Python caches and build metadata
- frontend `node_modules/` and build outputs

If a result is important for reproduction, summarize it in the experiment README or commit a small fixture/config. Do not commit live databases, agent worktrees, raw logs, or large run artifacts.
