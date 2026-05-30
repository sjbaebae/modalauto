#!/usr/bin/env python3
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


BASELINE = 108880
TARGET = 66707


def parse_ts(value):
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def seconds(ts, start):
    if ts is None:
        return None
    return round((parse_ts(ts) - start).total_seconds(), 3)


def load_json(value, default):
    try:
        return json.loads(value) if value else default
    except json.JSONDecodeError:
        return default


def fit_bin(score, best):
    if score is None:
        return None
    span = max(1, BASELINE - best)
    return max(0, min(6, round(((BASELINE - score) / span) * 6)))


def bucketize(raw):
    if not raw:
        return None
    return {
        "mul": int(raw.get("mul_reads") or raw.get("mul") or 0),
        "add": int(raw.get("add_reads") or raw.get("add") or 0),
        "copy": int(raw.get("copy_reads") or raw.get("copy") or 0),
        "load": int(raw.get("ops") or raw.get("load") or 0),
        "store": int(raw.get("output_reads") or raw.get("store") or 0),
    }


def normalize_display_parents(nodes):
    """Expose displayParent without inventing lineage beyond explicit parent ids."""
    roots = [
        node for node in nodes
        if not node.get("parent") and node.get("outcome") == "accept" and node.get("tVerified") is not None
    ]
    roots.sort(key=lambda node: (node.get("tVerified") or 0, node.get("tProposed") or 0, node["id"]))
    initial_root = roots[0]["id"] if roots else None
    for node in nodes:
        node["rawParent"] = node.get("parent")
        if node.get("parent"):
            node["displayParent"] = node.get("parent")
        elif initial_root and node["id"] != initial_root:
            node["displayParent"] = initial_root
        else:
            node["displayParent"] = None


def family_from(context, summary):
    best = summary.get("best") if isinstance(summary, dict) else {}
    if isinstance(best, dict) and best.get("family"):
        return best["family"]
    impl = context.get("implementation") if isinstance(context, dict) else {}
    op = impl.get("operator") if isinstance(impl, dict) else None
    if op:
        return op
    return context.get("source") or "real_run"


def find_hypothesis_ref(value):
    if isinstance(value, dict):
        direct = value.get("hypothesis_id") or value.get("parent_hypothesis_id") or value.get("source_insight_id")
        if direct:
            return str(direct)
        for nested in value.values():
            found = find_hypothesis_ref(nested)
            if found:
                return found
    elif isinstance(value, list):
        for item in value:
            found = find_hypothesis_ref(item)
            if found:
                return found
    return None


def detect_db(journal, db_filename=None):
    if db_filename:
        return journal / db_filename
    for name in ("team.db", "team_journal.db"):
        path = journal / name
        if path.exists():
            return path
    return journal / "team_journal.db"


def build_payload(journal, db_filename=None):
    db = detect_db(journal, db_filename)
    if not db.exists():
        raise SystemExit(f"missing {db}")

    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row

    all_times = []
    for table in ["agents", "hypotheses", "submissions", "verifications", "manager_events"]:
        for row in con.execute(f"select created_at from {table}"):
            all_times.append(parse_ts(row["created_at"]))
    if not all_times:
        return {
            "meta": {
                "baseline": BASELINE,
                "target": TARGET,
                "best": None,
                "bestNode": None,
                "gap": None,
                "tMax": 1,
                "tNow": 1,
                "totalNodes": 0,
                "excludedTreeItems": 0,
                "problem": "16x16 general matmul",
                "metric": "energy",
                "source": str(journal),
                "sourceDb": db.name,
                "seed": journal.name,
                "startedAt": datetime.now(timezone.utc).isoformat(),
            },
            "nodes": [],
            "hypotheses": [],
            "agents": [],
            "events": [],
            "series": [{"t": 0, "best": None}, {"t": 1, "best": None}],
        }
    start = min(all_times)

    agents = []
    for row in con.execute("select * from agents order by created_at, id"):
        retired = row["updated_at"] if row["status"] == "dead" else None
        agents.append({
            "id": row["id"],
            "role": row["role"],
            "spawnedAt": seconds(row["created_at"], start),
            "retiredAt": seconds(retired, start) if retired else None,
            "status": row["status"],
            "currentItem": row["current_item"],
        })

    hyp_rows = {r["id"]: dict(r) for r in con.execute("select * from hypotheses")}
    sub_rows = [dict(r) for r in con.execute("select * from submissions order by created_at, id")]
    ver_by_sub = {r["submission_id"]: dict(r) for r in con.execute("select * from verifications")}
    subs_by_hyp = {}
    for sub in sub_rows:
        subs_by_hyp.setdefault(sub["hypothesis_id"], []).append(sub)
    agent_role_by_id = {a["id"]: a["role"] for a in agents}
    hypothesis_items = []

    tree_excluded_roles = {"meta_agent", "insight_generator"}
    excluded_tree_items = 0
    transfer_edges = []
    first_verified = con.execute(
        """
        SELECT h.id
        FROM verifications v
        JOIN submissions s ON s.id = v.submission_id
        JOIN hypotheses h ON h.id = s.hypothesis_id
        WHERE v.decision = 'accept' AND v.official_score IS NOT NULL
        ORDER BY v.created_at ASC, h.id
        LIMIT 1
        """
    ).fetchone()
    first_verified_hyp_id = first_verified["id"] if first_verified else None

    # One display node per executable candidate hypothesis, using its best/first verified submission if present.
    nodes = []
    for hyp_id, hyp in sorted(hyp_rows.items(), key=lambda item: (item[1]["created_at"], item[0])):
        subs = subs_by_hyp.get(hyp_id, [])
        def sub_key(sub):
            ver = ver_by_sub.get(sub["id"])
            return (
                0 if ver and ver.get("official_score") is not None else 1,
                ver.get("official_score") if ver and ver.get("official_score") is not None else 10**12,
                sub["created_at"],
            )
        sub = sorted(subs, key=sub_key)[0] if subs else None
        ver = ver_by_sub.get(sub["id"]) if sub else None
        context = load_json(hyp["context_json"], {})
        evolution = context.get("evolution") if isinstance(context.get("evolution"), dict) else {}
        summary = load_json(sub["candidate_summary_json"], {}) if sub else {}
        artifact = load_json(sub["artifact_json"], {}) if sub else {}
        if not isinstance(artifact, dict):
            artifact = {}
        best = summary.get("best") if isinstance(summary, dict) else {}
        if not isinstance(best, dict):
            best = {}

        score = ver.get("official_score") if ver else best.get("score")
        decision = ver.get("decision") if ver else None
        semantic = ver.get("semantic") if ver else None
        buckets = bucketize(load_json(ver["buckets_json"], {})) if ver else bucketize(best)
        family = family_from(context, summary)
        candidate = best.get("name") or family or hyp["id"]
        proposer_role = next((a["role"] for a in agents if a["id"] == hyp["proposer_agent_id"]), "creative_explorer")
        is_transfer = evolution.get("event") == "horizontal_transfer"
        if is_transfer:
            transfer_edges.append({
                "id": f"transfer-{hyp_id}",
                "to": hyp_id,
                "donor": evolution.get("donor_hypothesis_id"),
                "recipient": evolution.get("recipient_hypothesis_id") or hyp["parent_hypothesis_id"],
                "donorFamily": evolution.get("donor_family"),
                "recipientFamily": evolution.get("recipient_family"),
                "t": seconds(hyp["created_at"], start),
                "transferred": evolution.get("transferred"),
            })
        hypothesis_items.append({
            "id": hyp_id,
            "parent": hyp["parent_hypothesis_id"],
            "status": hyp["status"],
            "title": hyp["title"],
            "proposer": hyp["proposer_agent_id"],
            "proposerRole": proposer_role,
            "createdAt": seconds(hyp["created_at"], start),
            "updatedAt": seconds(hyp["updated_at"], start),
            "claimedBy": hyp["claimed_by"],
            "hasSubmission": sub is not None,
            "hasVerification": ver is not None,
            "inTree": ver is not None and proposer_role not in tree_excluded_roles,
            "isTransfer": is_transfer,
            "evolution": evolution,
            "rationale": hyp["rationale"],
            "expectedMovement": hyp["expected_movement"],
        })
        if ver is None:
            excluded_tree_items += 1
            continue
        if proposer_role in tree_excluded_roles and not is_transfer and hyp_id != first_verified_hyp_id:
            excluded_tree_items += 1
            continue
        inferred_parent = hyp["parent_hypothesis_id"]
        if is_transfer:
            inferred_parent = evolution.get("recipient_hypothesis_id") or inferred_parent
        if inferred_parent == hyp_id:
            inferred_parent = None
        impl = context.get("implementation") if isinstance(context, dict) else {}
        context_parent = find_hypothesis_ref({
            "best_frontier": context.get("best_frontier") if isinstance(context, dict) else None,
            "implementation_parent": impl.get("best_frontier") if isinstance(impl, dict) else None,
            "source_capability": impl.get("source_capability") if isinstance(impl, dict) else None,
            "base_capability": impl.get("base_capability") if isinstance(impl, dict) else None,
            "source_insight_id": impl.get("source_insight_id") if isinstance(impl, dict) else None,
        })
        if context_parent == hyp_id or context_parent == inferred_parent:
            context_parent = None

        nodes.append({
            "id": hyp_id,
            "parent": inferred_parent,
            "contextParent": context_parent,
            "gen": 0,
            "family": family,
            "title": hyp["title"],
            "candidate": candidate,
            "proposer": hyp["proposer_agent_id"],
            "proposerRole": proposer_role,
            "tProposed": seconds(hyp["created_at"], start),
            "tClaimed": seconds(hyp["updated_at"], start) if hyp["claimed_by"] else None,
            "impl": sub["implementor_agent_id"] if sub else hyp["claimed_by"],
            "tSubmitted": seconds(sub["created_at"], start) if sub else None,
            "verifier": ver["verifier_agent_id"] if ver else sub["claimed_by"] if sub else None,
            "tVerified": seconds(ver["created_at"], start) if ver else None,
            "outcome": "accept" if decision == "accept" else "reject" if decision == "reject" else None,
            "semantic": semantic,
            "score": score,
            "subId": sub["id"] if sub else None,
            "verId": ver["id"] if ver else None,
            "buckets": buckets,
            "fit": None,
            "abandoned": hyp["status"] == "abandoned",
            "rationale": hyp["rationale"],
            "expectedMovement": hyp["expected_movement"],
            "isTransfer": is_transfer,
            "evolution": evolution,
        })

    normalize_display_parents(nodes)

    by_id = {n["id"]: n for n in nodes}
    def gen_of(node):
        parent = by_id.get(node.get("displayParent") or node["parent"])
        return gen_of(parent) + 1 if parent else 0
    for n in nodes:
        n["gen"] = gen_of(n)

    verified_scores = [n["score"] for n in nodes if n["outcome"] == "accept" and n["score"] is not None]
    best_score = min(verified_scores) if verified_scores else None
    for n in nodes:
        n["fit"] = fit_bin(n["score"], best_score or BASELINE)
    best_node = next((n for n in nodes if best_score is not None and n["score"] == best_score and n["outcome"] == "accept"), None)
    if best_node:
        best_node["isFrontier"] = True
    node_ids = {n["id"] for n in nodes}
    transfer_edges = [
        edge for edge in transfer_edges
        if edge.get("to") in node_ids
        and edge.get("donor") in node_ids
        and (edge.get("recipient") in node_ids or edge.get("recipient") is None)
    ]

    events = []
    def ev(t, kind, agent, node_id, text, **extra):
        role = next((a["role"] for a in agents if a["id"] == agent), None)
        row = {"t": t, "kind": kind, "agent": agent, "role": role, "nodeId": node_id, "text": text}
        row.update(extra)
        events.append(row)

    for a in agents:
        ev(a["spawnedAt"], "spawn", a["id"], None, f"started {a['role'].replace('_', ' ')}", spawnRole=a["role"])
    for n in nodes:
        ev(n["tProposed"], "proposed", n["proposer"], n["id"], n["title"])
        if n["tClaimed"] is not None and n["impl"]:
            ev(n["tClaimed"], "claimed", n["impl"], n["id"], "claimed hypothesis")
        if n["tSubmitted"] is not None and n["impl"]:
            ev(n["tSubmitted"], "submitted", n["impl"], n["id"], "candidate submitted", score=n["score"])
        if n["tVerified"] is not None and n["verifier"]:
            ev(n["tVerified"], "verified", n["verifier"], n["id"], n["outcome"] or "verified", score=n["score"], decision=n["outcome"], semantic=n["semantic"])

    for row in con.execute("select * from manager_events order by created_at, id"):
        payload = load_json(row["payload_json"], {})
        ev(seconds(row["created_at"], start), "scale", payload.get("agent_id") or "manager", None, row["kind"], payload=payload)

    events.sort(key=lambda e: (e["t"], e["kind"]))
    t_max = max([e["t"] for e in events] + [0]) + 5
    t_now = t_max

    def frontier_at(t):
        b = None
        for n in nodes:
            if n["outcome"] == "accept" and n["score"] is not None and n["tVerified"] is not None and n["tVerified"] <= t:
                b = n["score"] if b is None else min(b, n["score"])
        return b

    series = [{"t": (i / 60) * t_max, "best": frontier_at((i / 60) * t_max)} for i in range(61)]
    payload = {
        "meta": {
            "baseline": BASELINE,
            "target": TARGET,
            "best": best_score,
            "bestNode": best_node["id"] if best_node else None,
            "gap": best_score - TARGET if best_score is not None else None,
            "tMax": t_max,
            "tNow": t_now,
            "totalNodes": len(nodes),
            "excludedTreeItems": excluded_tree_items,
            "problem": "16x16 general matmul",
            "metric": "energy",
            "source": str(journal),
            "sourceDb": db.name,
            "seed": journal.name,
            "startedAt": start.isoformat(),
        },
        "nodes": nodes,
        "transferEdges": transfer_edges,
        "hypotheses": hypothesis_items,
        "agents": agents,
        "events": events,
        "series": series,
    }

    return payload


# Shared adapter: turns a JSON payload into a full "world" object (attaches the
# derive-at-time helper fns the UI calls). Used for both the single dashboard
# world (window.APP) and each Compare run (window.EVO_RUNS).
WORLD_FACTORY_JS = r"""
  function appWorld(payload) {
    function statusAt(n, T) {
      if (T < n.tProposed) return 'unborn';
      if (n.abandoned) return T > n.tProposed + 18 ? 'abandoned' : 'queued';
      if (n.tClaimed == null || T < n.tClaimed) return 'queued';
      if (n.tSubmitted == null || T < n.tSubmitted) return 'claimed';
      if (n.tVerified == null || T < n.tVerified) return 'submitted';
      return n.outcome === 'accept' ? 'verified' : 'rejected';
    }
    function bornCount(T) { return payload.nodes.filter((n) => n.tProposed <= T).length; }
    function frontierAt(T) {
      let best = null;
      payload.nodes.forEach((n) => {
        if (n.outcome === 'accept' && n.score != null && n.tVerified != null && n.tVerified <= T) {
          best = best == null ? n.score : Math.min(best, n.score);
        }
      });
      return best;
    }
    function fitBin(score) {
      if (score == null) return null;
      const best = payload.meta.best == null ? payload.meta.baseline : payload.meta.best;
      const span = Math.max(1, payload.meta.baseline - best);
      return Math.max(0, Math.min(6, Math.round(((payload.meta.baseline - score) / span) * 6)));
    }
    function agentActivity(T) {
      const out = {};
      payload.agents.forEach((a) => {
        const alive = a.spawnedAt <= T && (a.retiredAt == null || a.retiredAt > T);
        out[a.id] = { id: a.id, role: a.role, alive, status: 'idle', item: null, kind: null };
      });
      payload.nodes.forEach((n) => {
        if (n.impl && n.tClaimed != null && n.tClaimed <= T && (n.tSubmitted == null || T < n.tSubmitted)) {
          const o = out[n.impl]; if (o && o.alive) { o.status = 'working'; o.item = n.id; o.kind = 'building ' + n.candidate; }
        }
        if (n.verifier && n.tSubmitted != null && n.tSubmitted <= T && (n.tVerified == null || T < n.tVerified)) {
          const o = out[n.verifier]; if (o && o.alive) { o.status = 'working'; o.item = n.id; o.kind = 'verifying ' + (n.subId || 'submission'); }
        }
        if (n.proposer && T >= n.tProposed - 2.5 && T < n.tProposed) {
          const o = out[n.proposer]; if (o && o.alive && o.status === 'idle') { o.status = 'working'; o.item = n.id; o.kind = 'proposing hypothesis'; }
        }
      });
      payload.events.forEach((e) => {
        if (e.t > T || T - e.t >= 4 || !e.agent || !out[e.agent]) return;
        const o = out[e.agent];
        if (!o.alive || o.status === 'working') return;
        if (e.kind === 'scale') { o.status = 'working'; o.kind = 'planning scale'; }
        if (e.kind === 'spawn') { o.status = 'working'; o.kind = 'starting'; }
      });
      return out;
    }
    payload.fns = { statusAt, bornCount, agentActivity, frontierAt, fitBin };
    return payload;
  }
"""


def render_js(payload):
    adapter = (
        "(function () {\n"
        + WORLD_FACTORY_JS
        + "  window.APP = appWorld(__PAYLOAD__);\n"
        + "})();\n"
    )
    return adapter.replace("__PAYLOAD__", json.dumps(payload, separators=(",", ":")))


def render_runs_js(runs):
    """runs: list of dicts {id, label, desc, payload}.
    Emits window.EVO_RUNS (each a full world) for the Compare page, mirroring
    the mock runs.js shape so compare.jsx is data-source agnostic."""
    items = []
    for r in runs:
        item = "    { id: __ID__, label: __LABEL__, desc: __DESC__, world: appWorld(__PAYLOAD__) }"
        item = item.replace("__ID__", json.dumps(r["id"]))
        item = item.replace("__LABEL__", json.dumps(r["label"]))
        item = item.replace("__DESC__", json.dumps(r.get("desc", "")))
        item = item.replace("__PAYLOAD__", json.dumps(r["payload"], separators=(",", ":")))
        items.append(item)
    body = ",\n".join(items)
    return (
        "(function () {\n"
        + WORLD_FACTORY_JS
        + "  var RUNS = [\n" + body + "\n  ];\n"
        + "  window.EVO_RUNS = RUNS;\n"
        + "  window.EVO_RUN_BY_ID = {}; RUNS.forEach(function (r) { window.EVO_RUN_BY_ID[r.id] = r; });\n"
        + "  if (!window.APP && RUNS.length) window.APP = RUNS[0].world;\n"
        + "})();\n"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("journal", type=Path)
    parser.add_argument("--out", type=Path, default=Path("real-data.js"))
    parser.add_argument("--db-name")
    args = parser.parse_args()

    payload = build_payload(args.journal, args.db_name)
    args.out.write_text(render_js(payload), encoding="utf-8")
    nodes = payload["nodes"]
    events = payload["events"]
    db = detect_db(args.journal, args.db_name)
    print(f"wrote {args.out} from {db} ({len(nodes)} hypotheses, {len(events)} events)")


if __name__ == "__main__":
    main()
