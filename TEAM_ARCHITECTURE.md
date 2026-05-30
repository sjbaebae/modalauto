# Elastic Agent Team Architecture

Keep the metric and leaderboard untouched. Agents work in isolated folders under
`autoresearch/worktrees/`.

Use two coordination layers:

- SQLite journal: durable central repository for teams, agents, hypotheses,
  submissions, verifications, and manager events.
- Filesystem message board: direct agent communication through append-only JSONL
  channels under `autoresearch/matmul_journal/messages/`.

Do not use the DB as chat. Put short-lived handoffs, nudges, stop requests, and
manager scale actions on the message board.

## Roles

- `creative_explorer`: reads team history and proposes hypotheses. Its output is
  a queued hypothesis with expected score movement and context.
- `implementor`: claims hypotheses, builds candidate IRs or generators in its own
  worktree, and creates submissions.
- `verifier`: claims submissions, runs the official scorer plus general semantic
  checks, and writes verification records. Spawn more of these when submissions
  queue up.
- `topline_manager`: reads queue pressure, verification throughput, and best
  verified scores. It emits scale plans, posts spawn/retire actions, and may
  retire itself or spawn more topline managers when load changes.
- `global_searcher`: ignores local plateaus and proposes radically different
  directions from aggregate context.
- `researcher`: runs asynchronously, fetches papers, writes agent-generated
  paper briefs, stores TLDRs/relevance notes, and keeps vector-searchable
  research memory current.

## Cohesion Model

Teams are optional. Use `team_id` when you want a creative explorer and one or
more implementors to share local context. Use the `global` team when agents are
part of the loose pool.

Recommended simple default:

- one `global` topline manager by default, and two when the backlog is large;
- one or two `global_searcher` agents;
- one `researcher` agent for paper discovery and memory upkeep;
- a loose pool of `creative_explorer` agents;
- a larger loose pool of `implementor` agents;
- elastic `verifier` agents sized by pending submissions.

## Elastic Policy

The manager uses queue pressure:

- many queued or claimed hypotheses: add implementors;
- few queued hypotheses: add creative explorers and global searchers;
- many pending submissions: add verifiers;
- scale topline managers too. A manager can post a stop request for itself and
  then mark itself `dead` in the journal. Full idle shutdown is explicit via
  `scale-plan --allow-idle-retire`.

Current default policy is in `autoresearch/team_journal.py`:

```text
implementors ~= ceil((queued_hypotheses + claimed_hypotheses) / 3)
verifiers    ~= ceil((pending_submissions + in_verification) / 3)
explorers    increase when queued hypotheses fall below 6
managers     1 normally, 2 when backlog is high, 0 only with --allow-idle-retire
researchers  1 normally, 0 only with --allow-idle-retire
```

## Commands

```bash
autoresearch/bin/autoresearch-team init
autoresearch/bin/autoresearch-team status
autoresearch/bin/autoresearch-team scale-plan
autoresearch/bin/autoresearch-team register-agent creative_explorer
autoresearch/bin/autoresearch-team add-hypothesis --title "Try dead-storage reuse after k-panel"
autoresearch/bin/autoresearch-board post --sender manager-1 --channel manager-actions --kind scale --payload-json '{}'
autoresearch/bin/autoresearch-board inbox --agent-id impl-1
autoresearch/bin/autoresearch-board ack --agent-id impl-1
autoresearch/bin/autoresearch-memory fetch-arxiv 'cat:cs.DC AND matmul' --max-results 3
autoresearch/bin/autoresearch-memory search 'communication avoiding matrix multiplication'
autoresearch/bin/autoresearch-agent topline_manager --agent-id manager-1 --max-steps 100
autoresearch/bin/autoresearch-agent implementor --agent-id impl-1 --max-steps 10
```

The `scale-plan` command does not spawn processes. It returns desired role
counts, deltas, and explicit `spawn`/`retire` actions. Your agent-team launcher
or a topline manager can apply those actions and post them to the message board.
`autoresearch-agent topline_manager` applies the plan by default; pass
`--no-apply-scale` for a dry manager step.

Every autonomous role writes a heartbeat each cycle. The manager also calls
`requeue-stale`, which recovers expired hypothesis/submission leases and marks
agents dead if their heartbeat is older than the stale threshold. This is the
minimal watchdog loop that keeps the system from freezing midway through a run.

For self-retirement, a manager should:

```bash
autoresearch/bin/autoresearch-board post --sender manager-1 --to manager-1 --channel agent:manager-1 --kind stop --body "retire"
autoresearch/bin/autoresearch-team set-agent-status --agent-id manager-1 --status dead
```

## Research Memory

The researcher agent should not put paper chatter in the team DB. It writes to
`autoresearch/matmul_journal/research_memory.db`, which has:

- `papers`: source URL, arXiv ID, title, authors, abstract, tags;
- `paper_notes`: TLDR, Intuition, Empirics, Details, key claims, relevance;
- `paper_embeddings`: vector-search index stored as JSON vectors;
- `researcher_tasks`: async paper-search tasks.

This mirrors the useful Aria shape: saved item, agent extraction, human/agent
TLDR, embedding. The local version uses deterministic hashed embeddings so it
works offline; real embedding backends can replace `hashed_embedding` later.

Researcher tooling:

```bash
autoresearch/bin/autoresearch-memory fetch-arxiv 1706.03762 --max-results 1
autoresearch/bin/autoresearch-memory fetch-arxiv 'cat:cs.DC AND matmul' --max-results 5
autoresearch/bin/autoresearch-memory add-task --query 'blocked matrix multiplication memory schedule'
autoresearch/bin/autoresearch-memory add-note --paper-id paper-001 --tldr '...' --relevance '...'
autoresearch/bin/autoresearch-memory import-aria-csv /Users/sbae703/dev/aria/scripts/data/notion-papers.csv
```

If the launcher gives agents MCP web/arXiv tools, the researcher can use those
too. The local CLI is the fallback path and centralizes durable storage.

## Blind Runs

Matmul blind runs must not use prior frontier artifacts, old raw traces, or
copied mechanisms from the journal repo. The default loop is blind:

```bash
autoresearch/bin/autoresearch-matmul-loop --run-id blind_quick_v1
```

The copied trace-allocation mechanism is gated behind
`--include-reference-mechanisms` and is only for regression/speed checks. Do not
count those runs as from-scratch results.
