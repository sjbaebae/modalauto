# Matmul Reference Experiment

Minimal reference experiment for the autoresearch loop.

Run the full config-backed multiagent loop from the repository root:

```bash
python bin/autoresearch-team --experiment matmul init
python bin/autoresearch-agent topline_manager --experiment matmul --agent-id manager-main --max-steps 100 --interval 5
python bin/autoresearch-team --experiment matmul status
```

The manager reads this folder's `workflow.json` and spawns the agent team. Generated journals, artifacts, messages, and worktrees stay under this folder.

Layout:

- `loop.py`: matmul-specific autoresearch runner.
- `matmul/`: scorer and semantic verification helpers.
- `workflow.json`: workflow metadata and default runner.
- `journal/`: generated team journal, research memory, messages, run notes, and artifacts.
- `worktrees/`: generated agent-local workspaces and logs.

Only `README.md` and `workflow.json` are intended to be tracked.
