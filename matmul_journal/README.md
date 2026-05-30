# Matmul Blind Journal

Goal: start from `matmul/submissions/baseline_16x16.ir` and discover lower-energy
general 16x16 matmul implementations without using prior frontier artifacts.

## Rules

- Use the real scorer as the metric.
- Also require general semantic validity:

  ```bash
  python3 matmul/md_journal/verify_general_matmul.py CANDIDATE.ir --json
  ```

- Do not optimize for the deterministic scorer case only.
- Do not read prior run artifacts, old non-baseline submissions, old search
  scripts, or known frontier writeups during a blind run.
- Do not use a known frontier IR, raw trace, score path, or companion generator
  as a seed, reference target, or comparison oracle during a blind run.
- Start from the baseline, the problem definition, the verifier, and the real
  scorer only.
- Write one script, one summary, one CSV, one best IR, one run note.

## Required Loop For 16x16

Run this loop repeatedly:

```text
global creative family -> local optimize -> trace optimize -> plateau review
-> global creative family
```

Minimum for a bounded run:

1. Try at least 3 structurally different creative families.
   At least one family must be built around value/storage lifetimes: when
   inputs, temporaries, and outputs become live or dead, and how dead storage
   can be reused safely.
2. Pick the best valid family by verified score, not by intuition.
3. Locally optimize that family.
4. Trace-optimize the best local artifact.
5. If no improvement, ban the false-positive proxy or exhausted mechanism for
   one cycle and try a new creative family.
6. Repeat at least once after the first plateau.

Do not spend the whole budget on the first generator. A bounded run should
always complete creative, local, trace, and one post-plateau retry.
If the requested score band is not reached, a plateau note alone is not enough:
run the next role at least once or explicitly record the budget/blocker.

## Multiagent Pattern

Use separate roles when possible:

- global explorer: starts from baseline/problem/metric and creates new
  representation families;
- local optimizer: starts from the current round's best verified artifact and
  performs bounded trace/local improvement;
- integrator: compares verified scores and feeds plateau buckets into the next
  global explorer.

The global explorer may use plateau buckets from the previous round, but must
not use prior frontier artifacts, old raw traces, or old generators as seeds or
answers.

Switch between global and local roles as needed. Do not prescribe the next
mechanism in the harness; pass only scores, bucket deltas, proxy notes, and
failed total-cost movements.

Each handoff must also include:

- target gap;
- failed total-cost movement;
- untested cost movement;
- allowed regressions in other buckets if total cost improves;
- untried composition of mechanisms;
- why the next role's candidate batch is not a repeat.

Buckets are diagnostic. The objective is verified total score. A new attempt
should state the net score movement it expects and which bucket regressions it
will tolerate if other decreases outweigh them.

After a trace or representation change, rerun allocation/placement/cleanup
before rejecting the idea. A stale placement can hide a real mechanism.

For target-seeking runs, keep a `target_status` in the summary:

```text
target_met | continuing | budget_exhausted | blocked
```

## Layout

```text
runs/       run notes
artifacts/  scripts, candidates, best.ir, summaries
logs/       command output
skills/     optional generic meta-skills
```
