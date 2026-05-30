# quick_loop_v2

Simplified single-process copy of the sutro-problems-journal matmul loop.

## Result

- Best score: `84627`
- Best IR: `/Users/sbae703/Research/hackathons/modal/autoresearch/matmul_journal/artifacts/quick_loop_v2/best.ir`
- Source candidate: `panelalloc_4x4x1_a1b1`
- Semantic verification: `ok`
- Target status: `continuing`

## Loop Record

- Generated baseline, tiled, and rectangular panel families.
- Scored every candidate with the real 16x16 scorer.
- Verified scored candidates on random semantic cases.
- Wrote CSV, summary JSON, best IR, and this run note.

## Handoff

{
  "allowed_regressions": "allow output-read regressions when copy/mul/add reads fall more",
  "failed_total_cost_movement": "output-low and multiply-count-only proxies were misleading in the source journal",
  "next_role": "local_optimizer",
  "target_gap": 17920,
  "untested_cost_movement": "dead input/output storage reuse after each k-panel"
}
