#!/usr/bin/env python3
import hashlib
import json
import os
import re
import sqlite3
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from export_real_data import build_payload, detect_db, render_js, render_runs_js


AUTORESEARCH_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = AUTORESEARCH_ROOT.parent
DEFAULT_AUTORESEARCH = AUTORESEARCH_ROOT
CHANGELOG_NAME = "evoflow_changelog.jsonl"
WATCH_TABLES = ["agents", "hypotheses", "submissions", "verifications", "manager_events"]


def pick_journal():
    configured = os.environ.get("EVOFLOW_JOURNAL")
    if configured:
        return Path(configured).expanduser().resolve()
    candidates = [
        p for p in DEFAULT_AUTORESEARCH.glob("matmul_journal*")
        if detect_db(p).exists()
    ]
    if not candidates:
        return None
    return max(candidates, key=journal_mtime_ns)


def journal_mtime_ns(journal):
    newest = 0
    db = detect_db(journal)
    for suffix in ["", "-wal", "-shm"]:
        path = Path(str(db) + suffix)
        if path.exists():
            newest = max(newest, path.stat().st_mtime_ns)
    return newest


def discover_journals():
    """All matmul_journal* dirs with a team_journal.db, newest first.
    Honors EVOFLOW_JOURNAL to pin a single journal (matches pick_journal)."""
    configured = os.environ.get("EVOFLOW_JOURNAL")
    if configured:
        p = Path(configured).expanduser().resolve()
        return [p] if detect_db(p).exists() else []
    candidates = [
        p for p in DEFAULT_AUTORESEARCH.glob("matmul_journal*")
        if detect_db(p).exists()
    ]
    return sorted(candidates, key=journal_mtime_ns, reverse=True)


def run_label(journal):
    """Human label from a journal dir name, e.g.
    matmul_journal_wide_20260530T115039 -> 'Wide'; matmul_journal -> 'Main run'."""
    rest = journal.name[len("matmul_journal"):].lstrip("_")
    rest = re.sub(r"_?\d{8}T\d{6}$", "", rest)
    return rest.replace("_", " ").title() if rest else "Main run"


def build_runs(journals):
    """Build a Compare run per journal that actually has tree nodes."""
    runs = []
    for journal in journals:
        payload = build_payload(journal)
        if not payload.get("nodes"):
            continue  # empty journal — skip so the mock fallback can fill in
        meta = payload["meta"]
        meta["label"] = run_label(journal)
        best = meta.get("best")
        desc = f"{meta.get('totalNodes', 0)} hypotheses"
        if best is not None:
            desc += f" · best {best:,}"
        runs.append({"id": journal.name, "label": run_label(journal), "desc": desc, "payload": payload})
    return runs


def db_signature(journal):
    db = detect_db(journal)
    counts = {}
    version = 0
    try:
        con = sqlite3.connect(db)
        ensure_evoflow_hooks(con)
        version = con.execute("select version from evoflow_state where id = 1").fetchone()[0]
        for table in WATCH_TABLES:
            counts[table] = con.execute(f"select count(*) from {table}").fetchone()[0]
        con.close()
    except sqlite3.Error as exc:
        counts["error"] = str(exc)
    raw = json.dumps({
        "journal": str(journal),
        "counts": counts,
        "version": version,
    }, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16], counts


def ensure_evoflow_hooks(con):
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS evoflow_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
        """
    )
    con.execute(
        """
        INSERT OR IGNORE INTO evoflow_state (id, version, updated_at)
        VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        """
    )
    for table in WATCH_TABLES:
        for op, event in [("ai", "INSERT"), ("au", "UPDATE"), ("ad", "DELETE")]:
            con.execute(
                f"""
                CREATE TRIGGER IF NOT EXISTS evoflow_{table}_{op}
                AFTER {event} ON {table}
                BEGIN
                    UPDATE evoflow_state
                    SET version = version + 1,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                    WHERE id = 1;
                END
                """
            )
    con.commit()


def changelog_path(journal):
    return journal / CHANGELOG_NAME


def append_changelog_if_changed(journal):
    payload = build_payload(journal)
    db_hash, counts = db_signature(journal)
    path = changelog_path(journal)
    if not any(counts.get(table, 0) for table in WATCH_TABLES):
        return payload, db_hash, counts
    last_hash = None
    if path.exists():
        try:
            with path.open("rb") as fh:
                fh.seek(0, os.SEEK_END)
                pos = fh.tell()
                buf = b""
                while pos > 0 and b"\n" not in buf[:-1]:
                    step = min(4096, pos)
                    pos -= step
                    fh.seek(pos)
                    buf = fh.read(step) + buf
                lines = [line for line in buf.splitlines() if line.strip()]
                if lines:
                    last_hash = json.loads(lines[-1])["hash"]
        except (OSError, json.JSONDecodeError, KeyError):
            last_hash = None
    if last_hash != db_hash:
        record = {
            "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "hash": db_hash,
            "counts": counts,
            "payload": payload,
        }
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, separators=(",", ":")) + "\n")
    return payload, db_hash, counts


def read_changelog(journal):
    path = changelog_path(journal)
    frames = []
    if not path.exists():
        return frames
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Keep the replay payload useful but bounded for polling.
            counts = frame.get("counts", {})
            if not any(counts.get(table, 0) for table in WATCH_TABLES):
                continue
            frames.append({
                "captured_at": frame.get("captured_at"),
                "hash": frame.get("hash"),
                "counts": counts,
                "meta": (frame.get("payload") or {}).get("meta", {}),
            })
    return frames


class EvoFlowHandler(SimpleHTTPRequestHandler):
    def end_no_cache_headers(self, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/real-data.js":
            journal = pick_journal()
            self.end_no_cache_headers("text/javascript; charset=utf-8")
            if not journal:
                self.wfile.write(b"console.warn('EvoFlow: no team_journal.db found; using mock data');\n")
                return
            try:
                payload, _, _ = append_changelog_if_changed(journal)
                self.wfile.write(render_js(payload).encode("utf-8"))
            except Exception as exc:
                msg = json.dumps(f"EvoFlow real-data load failed: {exc}")
                self.wfile.write(f"console.error({msg});\n".encode("utf-8"))
            return

        if path == "/real-runs.js":
            self.end_no_cache_headers("text/javascript; charset=utf-8")
            try:
                runs = build_runs(discover_journals())
                if not runs:
                    self.wfile.write(b"console.warn('EvoFlow: no populated journals; using mock runs');\n")
                    return
                self.wfile.write(render_runs_js(runs).encode("utf-8"))
            except Exception as exc:
                msg = json.dumps(f"EvoFlow real-runs load failed: {exc}")
                self.wfile.write(f"console.error({msg});\n".encode("utf-8"))
            return

        if path == "/api/evoflow-meta":
            journal = pick_journal()
            payload = {"journal": str(journal) if journal else None, "hash": None, "counts": {}}
            if journal:
                _, payload["hash"], payload["counts"] = append_changelog_if_changed(journal)
                payload["changelog"] = str(changelog_path(journal))
            self.end_no_cache_headers("application/json; charset=utf-8")
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        if path == "/api/evoflow-data":
            journal = pick_journal()
            self.end_no_cache_headers("application/json; charset=utf-8")
            if not journal:
                self.wfile.write(json.dumps({"journal": None, "payload": None}).encode("utf-8"))
                return
            try:
                payload, db_hash, counts = append_changelog_if_changed(journal)
                self.wfile.write(json.dumps({
                    "journal": str(journal),
                    "db": str(detect_db(journal)),
                    "hash": db_hash,
                    "counts": counts,
                    "payload": payload,
                }, separators=(",", ":")).encode("utf-8"))
            except Exception as exc:
                self.wfile.write(json.dumps({"journal": str(journal), "error": str(exc)}).encode("utf-8"))
            return

        if path == "/api/evoflow-changelog":
            journal = pick_journal()
            payload = {"journal": str(journal) if journal else None, "frames": []}
            if journal:
                append_changelog_if_changed(journal)
                payload["changelog"] = str(changelog_path(journal))
                payload["frames"] = read_changelog(journal)
            self.end_no_cache_headers("application/json; charset=utf-8")
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        super().do_GET()

    def end_headers(self):
        if self.path.endswith((".js", ".jsx", ".css", ".html")):
            self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def main():
    port = int(os.environ.get("PORT", "5174"))
    os.chdir(Path(__file__).resolve().parents[1])
    server = ThreadingHTTPServer(("127.0.0.1", port), EvoFlowHandler)
    journal = pick_journal()
    print(f"EvoFlow server http://127.0.0.1:{port}/")
    print(f"Journal: {journal if journal else 'none found'}")
    server.serve_forever()


if __name__ == "__main__":
    main()
