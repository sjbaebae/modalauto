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
        "operator": "enumerate_schedule_family",
        "generated_by": "meta_tool",
        "source_capability": capability,
        "tiles": [{"i": 2, "j": 8}, {"i": 8, "j": 2}, {"i": 4, "j": 4}],
        "reuse_goals": ["minimize_tmp_read_cost", "move_accumulators_lower", "shuffle_bulk_layout"],
        "low_address_roles": ["temporary_product", "accumulators", "input_cache"],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"out": str(args.out), "operator": payload["operator"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
