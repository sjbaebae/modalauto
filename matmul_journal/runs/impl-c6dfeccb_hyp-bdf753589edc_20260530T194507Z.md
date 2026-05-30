# impl-c6dfeccb_hyp-bdf753589edc_20260530T194507Z

Simplified single-process matmul loop.

- Blind run: `true`
- Uses reference mechanisms: `false`

## Result

- Best score: `193740`
- Best IR: `/Users/sbae703/Research/hackathons/modal/autoresearch/matmul_journal/artifacts/impl-c6dfeccb_hyp-bdf753589edc_20260530T194507Z/best.ir`
- Source candidate: `panel_8x2x1_a1b0`
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
  "target_gap": 127033,
  "untested_cost_movement": "dead input/output storage reuse after each k-panel"
}
