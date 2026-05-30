#!/usr/bin/env python3
"""Generated local meta tool.

Reads a generic capability spec and emits a concrete hypothesis JSON for the
domain implementor. This file is intentionally local to one run/worktree.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capability-json", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    capability = json.loads(args.capability_json.read_text())
    diversity = capability.get("diversity", {})
    dominant = diversity.get("dominant_family")
    # Generic transformation rule: if one family dominates, ask the
    # implementor to generate a different representation that changes reuse
    # and address placement. Domain code decides how to instantiate it.
    payload = {
        "operator": "schedule_from_reasoning",
        "generated_by": "meta_tool",
        "source_capability": capability,
        "avoid_family": dominant,
        "loop_order": ["i_block", "j_block", "k", "i_inner", "j_inner"],
        "tile": {"i": 8, "j": 4},
        "reuse_goal": "hold a frequently reused live value while sweeping the other operand",
        "low_address_roles": [
            "most_reused_live_value",
            "temporary_product",
            "small_operand_strip",
            "accumulators"
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"out": str(args.out), "operator": payload["operator"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
