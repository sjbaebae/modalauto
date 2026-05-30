#!/usr/bin/env python3
"""Live JSON API for autoresearch journals used by EvoFlow."""

from __future__ import annotations

import argparse
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from autoresearch import experiment_config


REPO_ROOT = Path(__file__).resolve().parents[1]
AUTORESEARCH_ROOT = REPO_ROOT / "autoresearch"
VIZ_SCRIPTS = AUTORESEARCH_ROOT / "visualization" / "evoflow" / "scripts"
if str(VIZ_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(VIZ_SCRIPTS))

from export_real_data import build_payload, detect_db  # noqa: E402


def journal_mtime_ns(journal: Path) -> int:
    newest = 0
    db = detect_db(journal)
    for suffix in ["", "-wal", "-shm"]:
        path = Path(str(db) + suffix)
        if path.exists():
            newest = max(newest, path.stat().st_mtime_ns)
    return newest


def pick_journal(configured: Path | None = None) -> Path | None:
    if configured:
        path = configured.expanduser().resolve()
        return path if detect_db(path).exists() else None
    env = os.environ.get("EVOFLOW_JOURNAL")
    if env:
        path = Path(env).expanduser().resolve()
        return path if detect_db(path).exists() else None
    candidates = [path for path in (AUTORESEARCH_ROOT / "experiments").glob("*/journal") if detect_db(path).exists()]
    candidates.extend(path for path in AUTORESEARCH_ROOT.glob("*_journal*") if detect_db(path).exists())
    return max(candidates, key=journal_mtime_ns) if candidates else None


class Handler(BaseHTTPRequestHandler):
    journal: Path | None = None

    def send_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/evoflow-data", "/api/status"}:
            self.send_json({"error": "not_found"}, 404)
            return
        journal = pick_journal(self.journal)
        if not journal:
            self.send_json({"journal": None, "payload": None, "error": "no_journal"})
            return
        if path == "/api/status":
            self.send_json({"journal": str(journal), "db": str(detect_db(journal))})
            return
        payload = build_payload(journal)
        self.send_json({"journal": str(journal), "db": str(detect_db(journal)), "payload": payload})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--experiment", help="experiment name under experiments/")
    parser.add_argument("--experiment-root", type=Path, help="experiment directory containing journal/ and worktrees/")
    parser.add_argument("--journal", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("EVOFLOW_API_PORT", "5175")))
    args = parser.parse_args(argv)
    if not args.journal and (args.experiment or args.experiment_root):
        args.journal = experiment_config.layout(args.experiment, args.experiment_root).journal_dir
    Handler.journal = args.journal
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"EvoFlow API http://{args.host}:{args.port}/api/evoflow-data")
    print(f"Journal: {pick_journal(args.journal) or 'none found'}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
