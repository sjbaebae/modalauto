/* ============================================================
   EvoFlow — generated mock world
   A deterministic simulation of an elastic multi-agent
   evolutionary search for a lower-energy 16x16 matmul.

   Each node carries a full lifecycle schedule
   (tProposed -> tClaimed -> tSubmitted -> tVerified) plus its
   final outcome, so the whole search can be REPLAYED at any
   scrub time T: live agent state and tree growth are both
   derived from T, not pre-baked.

   Exposes window.EVO = { meta, nodes, agents, events, helpers }
   ============================================================ */
(function () {
  // ---- seeded RNG (mulberry32) ----
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // buildWorld(seed, params) -> a complete, self-contained run world.
  // The Compare page (runs.js) builds several worlds with different params;
  // the dashboard uses the default below. Param defaults reproduce the
  // original fixed-seed world exactly, so the main page is unchanged.
  window.buildWorld = function buildWorld(seed, params) {
  const P = Object.assign({
    label: 'Run', tag: 'panel-first',
    floor: 71200, target: 66707,
    creativeLo: 0.84, creativeHi: 1.14,
    localLo: 0.905, localHi: 1.01,
    searchLo: 0.80, searchHi: 1.26,
    rejectRate: 0.13, abandonRate: 0.07, jumpRate: 0.16,
  }, params || {});
  const R = rng(seed);
  const rand = (lo, hi) => lo + R() * (hi - lo);
  const randint = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const chance = (p) => R() < p;

  const BASELINE = 108880;
  const TARGET = P.target;    // 108880 - 42173 (from blind_quick_v1 handoff)
  const FLOOR = P.floor;      // best lineage approaches but doesn't reach target

  // ---- creative families (gen-1 representation families) ----
  const FAMILIES = [
    { key: 'panel',     name: 'Rectangular panel family',        cand: 'panel' },
    { key: 'tiled',     name: 'Block-tiled accumulation',        cand: 'tiled' },
    { key: 'lifetime',  name: 'Value-lifetime / dead-storage reuse', cand: 'lifealloc' },
    { key: 'strassen',  name: 'Strassen-like 2×2 recursion',     cand: 'strassen' },
    { key: 'karatsuba', name: 'Karatsuba recombination',         cand: 'karat' },
    { key: 'banded',    name: 'Diagonal-banded decomposition',   cand: 'banded' },
    { key: 'winograd',  name: 'Winograd small-filter transform', cand: 'winograd' },
    { key: 'mixrad',    name: 'Mixed-radix panel split',         cand: 'mixrad' },
  ];
  // local optimization modifications (deeper generations)
  const LOCAL_OPTS = [
    'Reuse dead T after k-panel', 'Hoist invariant loads', 'Fuse add into mul-accumulate',
    'Tighten panel to 4×2×1', 'Trace-optimize placement', 'Coalesce output writes',
    'Eliminate redundant copies', 'Reorder k-loop for locality', 'Share B-panel across rows',
    'Pack A into registers', 'Defer cleanup past k-loop', 'Split accumulator to halve reads',
  ];
  const SEARCHER_JUMPS = [
    'Abandon panels — try recursive bilinear', 'Random restart: low-rank factor map',
    'Cross-family graft: tiled × lifetime', 'Re-derive from add-multiply tradeoff',
  ];
  const FAM_CAND = { baseline: 'baseline' };
  FAMILIES.forEach((f) => (FAM_CAND[f.key] = f.cand));

  // ---- agents & elastic pools ----
  const agents = {};
  function addAgent(id, role, t) {
    if (!agents[id]) agents[id] = { id, role, spawnedAt: t, retiredAt: null };
    return agents[id];
  }
  // always-on roster
  addAgent('manager-1', 'topline_manager', 0);
  addAgent('researcher-1', 'researcher', 0);
  addAgent('explorer-1', 'creative_explorer', 0);
  addAgent('searcher-1', 'global_searcher', 0);
  addAgent('insight-1', 'insight_generator', 0);
  addAgent('meta-1', 'meta_agent', 0);

  const pools = { implementor: [], verifier: [], creative_explorer: [], global_searcher: [] };
  // seed initial pool members
  pools.creative_explorer.push({ id: 'explorer-1', freeAt: 0 });
  pools.global_searcher.push({ id: 'searcher-1', freeAt: 0 });
  pools.implementor.push({ id: 'impl-1', freeAt: 0 });
  pools.verifier.push({ id: 'verifier-1', freeAt: 0 });
  addAgent('impl-1', 'implementor', 0);
  addAgent('verifier-1', 'verifier', 0);

  const events = [];
  const ev = (t, kind, agent, nodeId, text, extra) =>
    events.push(Object.assign({ t: Math.round(t), kind, agent, role: agents[agent] ? agents[agent].role : null, nodeId, text }, extra || {}));

  const ROLE_PREFIX = { implementor: 'impl', verifier: 'verifier', creative_explorer: 'explorer', global_searcher: 'searcher' };
  function leaseWorker(role, t) {
    const pool = pools[role];
    let w = pool.find((x) => x.freeAt <= t);
    if (!w) {
      const n = pool.length + 1;
      const id = ROLE_PREFIX[role] + '-' + n;
      w = { id, freeAt: t };
      pool.push(w);
      addAgent(id, role, t - 1);
      ev(t - 1, 'spawn', 'manager-1', null, `spawned ${role.replace('_', ' ')} ${id}`, { spawnRole: role });
    }
    return w;
  }

  // ---- node generation ----
  const nodes = [];
  let hid = 0;
  const nid = () => 'hyp-' + String(hid++).padStart(3, '0');
  const sid = (() => { let n = 0; return () => 'sub-' + String(n++).padStart(3, '0'); })();
  const vid = (() => { let n = 0; return () => 'ver-' + String(n++).padStart(3, '0'); })();

  function fitBin(score) {
    if (score == null) return null;
    const f = (BASELINE - score) / (BASELINE - FLOOR); // 0 worst .. 1 best
    return Math.max(0, Math.min(6, Math.round(f * 6)));
  }
  function buckets(score) {
    // diagnostic cost buckets that roughly compose the energy score
    const mul = Math.round(score * rand(0.40, 0.46));
    const add = Math.round(score * rand(0.17, 0.22));
    const copy = Math.round(score * rand(0.10, 0.14));
    const load = Math.round(score * rand(0.11, 0.15));
    const store = Math.max(0, score - mul - add - copy - load);
    return { mul, add, copy, load, store };
  }

  // root: 16x16 baseline IR
  const root = {
    id: nid(), parent: null, gen: 0, family: 'baseline',
    title: '16×16 baseline IR', candidate: 'baseline_16x16',
    proposer: 'explorer-1', proposerRole: 'creative_explorer',
    tProposed: 0, tClaimed: 1, impl: 'impl-1', tSubmitted: 4, verifier: 'verifier-1', tVerified: 6,
    outcome: 'accept', semantic: 'ok', score: BASELINE, subId: sid(), verId: vid(),
    abandoned: false, seed: randint(1, 1e9),
  };
  root.buckets = buckets(root.score);
  root.fit = fitBin(root.score);
  nodes.push(root);
  ev(0, 'proposed', 'explorer-1', root.id, root.title);
  ev(4, 'submitted', 'impl-1', root.id, 'candidate submitted', { score: root.score });
  ev(6, 'verified', 'verifier-1', root.id, 'accept', { score: root.score, decision: 'accept' });

  const TARGET_NODES = 138;
  let clock = 9;
  const expandable = [root];

  function bestExpandable() {
    const scored = expandable.filter((n) => n.score != null && !n.abandoned);
    scored.sort((a, b) => a.score - b.score);
    return scored;
  }

  let lastResearch = 0;
  let lastScale = 0;
  let lastInsight = 0;
  let lastMeta = 0;

  while (nodes.length < TARGET_NODES && clock < 1000) {
    const pool = bestExpandable();
    if (!pool.length) break;
    // 65% exploit the best frontier nodes; 35% explore something random
    let parent;
    if (chance(0.65)) parent = pool[randint(0, Math.min(4, pool.length - 1))];
    else parent = expandable[randint(0, expandable.length - 1)];
    if (!parent || parent.score == null) { clock += 4; continue; }

    const isJump = parent.gen >= 1 && chance(P.jumpRate);
    const proposerRole = parent.gen === 0
      ? (chance(0.78) ? 'creative_explorer' : 'global_searcher')
      : (isJump ? 'global_searcher' : (chance(0.85) ? 'creative_explorer' : 'global_searcher'));

    const childCount = parent.gen <= 1 ? randint(2, 3) : randint(1, 2);

    for (let c = 0; c < childCount && nodes.length < TARGET_NODES; c++) {
      const tProposed = clock + rand(1, 5);
      const proposerW = leaseWorker(proposerRole, tProposed);
      proposerW.freeAt = tProposed + rand(1, 3);

      // family & title
      let family, title, candVariant;
      if (parent.gen === 0) {
        const fam = pick(FAMILIES);
        family = fam.key; title = fam.name;
        candVariant = `${fam.cand}_${randint(2, 5)}x${randint(1, 4)}x1_a1b1`;
      } else if (proposerRole === 'global_searcher' && isJump) {
        family = parent.family; title = pick(SEARCHER_JUMPS);
        candVariant = `${FAM_CAND[family] || family}_alt${randint(1, 9)}`;
      } else {
        family = parent.family; title = pick(LOCAL_OPTS);
        candVariant = `${FAM_CAND[family] || family}_${randint(2, 6)}x${randint(1, 4)}x1_v${randint(1, 9)}`;
      }

      // fate
      const fate = (() => {
        if (parent.gen >= 1 && chance(P.rejectRate)) return 'reject';   // semantic invalid / dead end
        if (parent.gen >= 2 && chance(P.abandonRate)) return 'abandon';  // queued, never pursued
        return 'accept';
      })();

      const node = {
        id: nid(), parent: parent.id, gen: parent.gen + 1, family, title,
        candidate: candVariant, proposer: proposerW.id, proposerRole,
        tProposed, abandoned: false, seed: randint(1, 1e9),
        subId: null, verId: null, impl: null, verifier: null,
        tClaimed: null, tSubmitted: null, tVerified: null,
        outcome: null, semantic: null, score: null, buckets: null, fit: null,
      };
      ev(tProposed, 'proposed', proposerW.id, node.id, title, { jump: isJump });

      if (fate === 'abandon') {
        node.abandoned = true;
        nodes.push(node);
        clock = tProposed;
        continue;
      }

      // claim by an implementor
      const tClaimed = tProposed + rand(1, 4);
      const implW = leaseWorker('implementor', tClaimed);
      const workDur = rand(5, 16);
      const tSubmitted = tClaimed + workDur;
      implW.freeAt = tSubmitted;
      node.tClaimed = tClaimed; node.impl = implW.id; node.tSubmitted = tSubmitted;
      node.subId = sid();
      ev(tClaimed, 'claimed', implW.id, node.id, 'claimed hypothesis');

      // score outcome
      let score;
      if (fate === 'reject') {
        score = null;
      } else if (proposerRole === 'global_searcher') {
        score = Math.round(parent.score * rand(P.searchLo, P.searchHi));
      } else if (parent.gen === 0) {
        score = Math.round(parent.score * rand(P.creativeLo, P.creativeHi));
      } else {
        score = Math.round(parent.score * rand(P.localLo, P.localHi));
      }
      if (score != null) score = Math.max(FLOOR, score);

      ev(tSubmitted, 'submitted', implW.id, node.id, 'candidate submitted', { score });

      // verify
      const tVerified = tSubmitted + rand(2, 6);
      const verW = leaseWorker('verifier', tSubmitted);
      verW.freeAt = tVerified;
      node.tVerified = tVerified; node.verifier = verW.id; node.verId = vid();
      const decision = fate === 'reject' ? 'reject' : 'accept';
      node.outcome = decision;
      node.semantic = fate === 'reject' ? (chance(0.5) ? 'invalid' : 'ok') : 'ok';
      node.score = score;
      node.buckets = score != null ? buckets(score) : null;
      node.fit = fitBin(score);
      ev(tVerified, 'verified', verW.id, node.id, decision, { score, decision, semantic: node.semantic });

      nodes.push(node);
      clock = tProposed;

      // is this an interesting branch to expand further?
      if (decision === 'accept' && node.gen < 6) {
        const improved = node.score <= parent.score + 1200;
        if (improved || chance(0.25)) expandable.push(node);
      }
    }

    // periodic manager scale plan + researcher activity
    if (clock - lastScale > 55) {
      lastScale = clock;
      ev(clock + 1, 'scale', 'manager-1', null, 'scale plan applied', { });
    }
    if (clock - lastResearch > 80) {
      lastResearch = clock;
      ev(clock + 2, 'research', 'researcher-1', null, pick([
        'communication-avoiding matmul', 'multiplication-avoiding power iteration',
        'low-rank bilinear maps', 'register tiling for small GEMM',
      ]), {});
    }
    if (clock - lastInsight > 70) {
      lastInsight = clock;
      ev(clock + 3, 'insight', 'insight-1', null, pick([
        'plateau detected: 3 submissions share tiled family',
        'frontier stalled — recommend new loop/address heuristic',
        'recent best clusters at fit-bin 4; nudge global search',
        'duplicate family detected; recommend abandonment',
      ]), {});
    }
    if (clock - lastMeta > 95) {
      lastMeta = clock;
      ev(clock + 4, 'meta', 'meta-1', null, pick([
        'consumed insight → rebalanced pool ratios',
        'queued plateau heuristic for global searcher',
        'reweighted role priorities (explorer↑, implementor↓)',
        'promoted insight to topline manager',
      ]), {});
    }
  }

  // ---- timeline bounds & "now" (leave the last nodes mid-flight) ----
  const maxProposed = Math.max(...nodes.map((n) => n.tProposed));
  const tMax = Math.max(...nodes.map((n) => n.tVerified || n.tProposed)) + 6;
  const tNow = maxProposed + 7; // a handful of nodes still in-flight at "now"

  // best verified score globally (and the frontier node)
  let best = null;
  nodes.forEach((n) => {
    if (n.outcome === 'accept' && n.score != null) {
      if (!best || n.score < best.score) best = n;
    }
  });
  best.isFrontier = true;

  // frontier-over-time series (best score with tVerified <= t), sampled
  function frontierAt(t) {
    let b = BASELINE;
    for (const n of nodes) {
      if (n.outcome === 'accept' && n.score != null && n.tVerified <= t) b = Math.min(b, n.score);
    }
    return b;
  }
  const series = [];
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * tMax;
    series.push({ t, best: frontierAt(t) });
  }

  // ---- helpers: derive display state at scrub time T ----
  function statusAt(n, T) {
    if (T < n.tProposed) return 'unborn';
    if (n.abandoned) return T > n.tProposed + 18 ? 'abandoned' : 'queued';
    if (n.tClaimed == null || T < n.tClaimed) return 'queued';
    if (T < n.tSubmitted) return 'claimed';        // implementor working
    if (T < n.tVerified) return 'submitted';        // in verification
    return n.outcome === 'accept' ? 'verified' : 'rejected';
  }
  function bornCount(T) { return nodes.filter((n) => n.tProposed <= T).length; }

  // agent activity at time T: what is each live agent doing?
  function agentActivity(T) {
    const out = {};
    Object.values(agents).forEach((a) => {
      const alive = a.spawnedAt <= T && (a.retiredAt == null || a.retiredAt > T);
      out[a.id] = { id: a.id, role: a.role, alive, status: 'idle', item: null, kind: null };
    });
    nodes.forEach((n) => {
      // implementor building
      if (n.impl && n.tClaimed != null && n.tClaimed <= T && T < n.tSubmitted) {
        const o = out[n.impl]; if (o && o.alive) { o.status = 'working'; o.item = n.id; o.kind = 'building ' + n.candidate; }
      }
      // verifier checking
      if (n.verifier && n.tSubmitted != null && n.tSubmitted <= T && T < n.tVerified) {
        const o = out[n.verifier]; if (o && o.alive) { o.status = 'working'; o.item = n.id; o.kind = 'verifying ' + n.subId; }
      }
      // proposer thinking (short window)
      if (n.proposer && T >= n.tProposed - 2.5 && T < n.tProposed) {
        const o = out[n.proposer]; if (o && o.alive && o.status === 'idle') { o.status = 'working'; o.item = n.id; o.kind = 'proposing hypothesis'; }
      }
    });
    // singleton roles: derive short working pulses from their last event
    const SINGLETON_KINDS = { 'manager-1': 'scale', 'researcher-1': 'research', 'insight-1': 'insight', 'meta-1': 'meta' };
    const PULSE_LABEL = {
      scale: 'planning scale', research: 'reading literature',
      insight: 'analyzing recent submissions', meta: 'rebalancing pools',
    };
    for (const id in SINGLETON_KINDS) {
      const o = out[id]; if (!o || !o.alive) continue;
      const kind = SINGLETON_KINDS[id];
      // most recent event of that kind by that agent at/before T
      let last = null;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.t > T) continue;
        if (e.agent === id && e.kind === kind) { last = e; break; }
      }
      if (last && T - last.t < 5) {
        o.status = 'working'; o.kind = PULSE_LABEL[kind] || kind; o.item = null;
      }
    }
    return out;
  }

  events.sort((a, b) => a.t - b.t);

  return {
    meta: {
      baseline: BASELINE, target: TARGET, best: best.score, bestNode: best.id,
      gap: best.score - TARGET, tMax, tNow, totalNodes: nodes.length,
      problem: '16×16 general matmul', metric: 'energy',
      label: P.label, tag: P.tag, seed,
    },
    nodes, agents: Object.values(agents), events, series,
    fns: { statusAt, bornCount, agentActivity, frontierAt, fitBin },
    LOCAL_OPTS, FAMILIES,
  };
  };

  // default world for the dashboard (skipped if real-data.js already set window.EVO)
  if (!window.EVO) window.EVO = window.buildWorld(20260530, { label: 'Panel-first search', tag: 'panel-first' });
})();
