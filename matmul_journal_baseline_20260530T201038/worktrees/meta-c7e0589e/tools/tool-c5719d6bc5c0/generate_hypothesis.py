#!/usr/bin/env python3
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
    payload = {
        "operator": "schedule_from_reasoning",
        "generated_by": "meta_tool",
        "source_capability": capability,
        "loop_order": ["j_block", "i_block", "k", "j_inner", "i_inner"],
        "tile": {"i": 4, "j": 8},
        "reuse_goal": "hold one B value while sweeping several A rows",
        "low_address_roles": ["most_reused_live_value", "temporary_product", "small_operand_strip", "accumulators"],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"out": str(args.out), "operator": payload["operator"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
