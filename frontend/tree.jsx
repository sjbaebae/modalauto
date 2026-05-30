/* EvoTree — node-link canvas. x = time (proposed), y = score (better = up).
   Color & size encode fitness. Pan (drag) + zoom (wheel). Click a node to inspect. */
(function () {
  const { useState, useRef, useEffect, useMemo, useCallback } = React;
  const E = window.APP;

  const VW = 2200, VH = 860, PAD = 70;
  const SMIN = E.meta.best == null ? E.meta.baseline : E.meta.best, SMAX = E.meta.baseline;
  const ROLE_LANES = ['topline_manager', 'meta_agent', 'insight_generator', 'creative_explorer', 'global_searcher', 'implementor', 'verifier', 'researcher'];
  const mmss = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.round(t % 60)).padStart(2, '0');
  const hasRealLineage = E.nodes.some((n) => n.parent);
  const parentFanout = {};
  const parentOf = (n) => n.displayParent || n.parent;
  E.nodes.forEach((n) => { const p = parentOf(n); if (p) parentFanout[p] = (parentFanout[p] || 0) + 1; });
  const maxParentFanout = Math.max(0, ...Object.values(parentFanout));
  const maxNodeGen = Math.max(0, ...E.nodes.map((n) => n.gen || 0));
  const scoreVariety = new Set(E.nodes.filter((n) => n.score != null).map((n) => n.score)).size;
  const useTreeLayout = hasRealLineage;
  const useBranchLaneLayout = useTreeLayout && !(maxNodeGen <= 2 && maxParentFanout > E.nodes.length * 0.35);
  const useLaneLayout = !hasRealLineage && scoreVariety <= 3;
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  }

  // stable layout (independent of scrub time)
  const LAYOUT = (() => {
    const ls = {};               // layoutScore per node id
    const byId = {};
    E.nodes.forEach((n) => (byId[n.id] = n));
    E.nodes.forEach((n, i) => {
      if (n.score != null) ls[n.id] = n.score;
      else {
        const p = n.parent ? ls[n.parent] : SMAX;
        // failed/in-flight nodes sit near their parent with a deterministic nudge
        const nudge = n.outcome === 'reject' ? 2600 : 900;
        ls[n.id] = Math.min(SMAX, (p || SMAX) + ((i % 7) - 3) * 220 + nudge * 0.4);
      }
    });
    const branchY = {};
    if (useBranchLaneLayout) {
      const children = {};
      E.nodes.forEach((n) => { children[n.id] = []; });
      E.nodes.forEach((n) => { const p = parentOf(n); if (p && children[p]) children[p].push(n); });
      Object.values(children).forEach((arr) => arr.sort((a, b) => a.tProposed - b.tProposed || a.id.localeCompare(b.id)));
      const roots = E.nodes
        .filter((n) => {
          const p = parentOf(n);
          return !p || !byId[p];
        })
        .sort((a, b) => a.tProposed - b.tProposed || a.id.localeCompare(b.id));
      let cursor = 0;
      const seen = new Set();
      const walk = (n) => {
        if (seen.has(n.id)) {
          branchY[n.id] = branchY[n.id] == null ? cursor++ : branchY[n.id];
          return branchY[n.id];
        }
        seen.add(n.id);
        const kids = children[n.id] || [];
        if (!kids.length) {
          branchY[n.id] = cursor++;
          return branchY[n.id];
        }
        const ys = kids.map(walk);
        branchY[n.id] = ys.reduce((a, b) => a + b, 0) / ys.length;
        return branchY[n.id];
      };
      roots.forEach(walk);
      E.nodes.forEach((n) => { if (branchY[n.id] == null) branchY[n.id] = cursor++; });
      const maxY = Math.max(1, cursor - 1);
      E.nodes.forEach((n) => { branchY[n.id] = PAD + (branchY[n.id] / maxY) * (VH - 2 * PAD); });
    }

    const pos = {};
    const span = SMAX - SMIN || 1;
    const nodeTimes = E.nodes.map((n) => n.tVerified || n.tProposed || 0);
    const tMin = Math.min(...nodeTimes);
    const tSpan = Math.max(1, Math.max(...nodeTimes) - tMin);
    const duplicateOffset = {};
    const scoreGroups = {};
    E.nodes.forEach((n) => {
      if (n.score == null) return;
      const key = String(n.score);
      (scoreGroups[key] ||= []).push(n);
    });
    Object.values(scoreGroups).forEach((group) => {
      if (group.length <= 1) {
        duplicateOffset[group[0].id] = 0;
        return;
      }
      group.sort((a, b) => {
        const ak = `${parentOf(a) || ''}|${a.family || ''}|${a.proposerRole || ''}|${a.tProposed}|${a.id}`;
        const bk = `${parentOf(b) || ''}|${b.family || ''}|${b.proposerRole || ''}|${b.tProposed}|${b.id}`;
        return ak.localeCompare(bk);
      });
      const spread = Math.min(170, 24 + Math.sqrt(group.length) * 10);
      group.forEach((n, i) => {
        duplicateOffset[n.id] = group.length === 1 ? 0 : ((i / (group.length - 1)) - 0.5) * spread;
      });
    });
    const genMax = Math.max(1, ...E.nodes.map((n) => n.gen || 0));
    E.nodes.forEach((n) => {
      const timeX = ((n.tVerified || n.tProposed || 0) - tMin) / tSpan;
      const genX = (n.gen || 0) / genMax;
      const xRatio = useTreeLayout ? (0.82 * genX + 0.18 * timeX) : timeX;
      const x = PAD + xRatio * (VW - 2 * PAD);
      let y;
      if (useBranchLaneLayout) {
        const sc = Math.max(SMIN, Math.min(SMAX, ls[n.id]));
        const scoreY = PAD + ((sc - SMIN) / span) * (VH - 2 * PAD);
        const jitter = (hash01(n.id) - 0.5) * 12;
        y = scoreY + (duplicateOffset[n.id] || 0) + jitter;
      } else if (useLaneLayout) {
        const laneKey = n.proposerRole || n.family || 'unknown';
        let lane = ROLE_LANES.indexOf(laneKey);
        if (lane < 0) lane = Math.floor(hash01(laneKey) * ROLE_LANES.length);
        const laneH = (VH - 2 * PAD) / ROLE_LANES.length;
        const scoreOffset = n.score === E.meta.best ? -laneH * 0.18 : n.score === E.meta.baseline ? laneH * 0.18 : 0;
        y = PAD + laneH * (lane + 0.5) + (hash01(n.id) - 0.5) * laneH * 0.62 + scoreOffset;
      } else {
        const sc = Math.max(SMIN, Math.min(SMAX, ls[n.id]));
        const jitter = useTreeLayout ? (hash01(n.id) - 0.5) * 26 : 0;
        y = PAD + ((sc - SMIN) / span) * (VH - 2 * PAD) + jitter;
      }
      y = Math.max(PAD, Math.min(VH - PAD, y));
      pos[n.id] = { x, y };
    });
    return { pos, ls, tMin, tSpan };
  })();

  const fitVar = (f) => `var(--fit-${f})`;

  function nodeVisual(n, st) {
    // returns {r, fill, stroke, op}
    if (st === 'verified') {
      const r = 4.5 + (n.fit || 0) * 1.35;
      return { r, fill: fitVar(n.fit), stroke: 'none', op: 1, glow: n.isFrontier };
    }
    if (st === 'rejected') return { r: 4, fill: 'var(--surface-0)', stroke: 'var(--bad)', op: 0.9 };
    if (st === 'claimed' || st === 'submitted') return { r: 5.5, fill: 'var(--surface-0)', stroke: 'var(--accent)', op: 1, working: true };
    if (st === 'queued') return { r: 3.6, fill: 'var(--surface-0)', stroke: 'var(--line-strong)', op: 0.85 };
    if (st === 'abandoned') return { r: 3.4, fill: 'var(--surface-2)', stroke: 'var(--line-strong)', op: 0.5 };
    return { r: 0, op: 0 };
  }

  function EvoTree({ T, selected, onSelect, density, scoreLabels, dimOffLineage }) {
    const wrapRef = useRef(null);
    const [view, setView] = useState({ k: 1, tx: 0, ty: 0, ready: false });
    const drag = useRef(null);
    const [hover, setHover] = useState(null);

    // fit to container on mount / resize
    const fit = useCallback(() => {
      const el = wrapRef.current; if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      const k = Math.min(w / VW, h / VH) * 0.96;
      setView({ k, tx: (w - VW * k) / 2, ty: (h - VH * k) / 2, ready: true });
    }, []);
    const onWheel = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = wrapRef.current; const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const k = Math.max(0.35, Math.min(9, v.k * factor));
        const tx = mx - (mx - v.tx) * (k / v.k);
        const ty = my - (my - v.ty) * (k / v.k);
        return { ...v, k, tx, ty };
      });
    }, []);
    useEffect(() => {
      fit();
      const r = () => fit();
      const el = wrapRef.current;
      const wheel = (e) => onWheel(e);
      window.addEventListener('resize', r);
      if (el) el.addEventListener('wheel', wheel, { passive: false });
      return () => {
        window.removeEventListener('resize', r);
        if (el) el.removeEventListener('wheel', wheel);
      };
    }, [fit, onWheel]);
    const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false }; };
    const onMove = (e) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      setView((v) => ({ ...v, tx: drag.current.tx + dx, ty: drag.current.ty + dy }));
    };
    const onUp = () => { drag.current = null; };

    // visible nodes & edges at time T
    const { vis, edges, transferEdges } = useMemo(() => {
      const vis = [];
      E.nodes.forEach((n) => {
        if (n.tVerified != null && n.tVerified <= T) vis.push(n);
      });
      const set = new Set(vis.map((n) => n.id));
      const edges = [];
      vis.forEach((n) => {
        const p = parentOf(n);
        if (p && set.has(p)) edges.push([p, n.id, n]);
      });
      const transferEdges = (E.transferEdges || [])
        .filter((edge) => edge.donor && edge.to && set.has(edge.donor) && set.has(edge.to))
        .map((edge) => [edge.donor, edge.to, edge]);
      return { vis, edges, transferEdges };
    }, [T]);

    const selNode = selected ? E.nodes.find((n) => n.id === selected) : null;
    // lineage path for highlight
    const lineage = useMemo(() => {
      const ids = new Set(); let cur = selNode;
      while (cur) {
        ids.add(cur.id);
        const p = parentOf(cur);
        cur = p ? E.nodes.find((n) => n.id === p) : null;
      }
      return ids;
    }, [selected]);

    const P = LAYOUT.pos;
    const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const t = LAYOUT.tMin + LAYOUT.tSpan * f;
      return { x: PAD + f * (VW - 2 * PAD), t };
    });
    const edgeCount = edges.length;
    const labelIds = useMemo(() => {
      const out = new Set();
      const sorted = [...E.nodes]
        .filter((n) => n.score != null && n.tVerified != null)
        .sort((a, b) => (a.tVerified - b.tVerified) || (a.score - b.score) || a.id.localeCompare(b.id));
      sorted.forEach((n, i) => {
        if (n.isFrontier || i === 0 || i === sorted.length - 1 || i % Math.max(2, Math.ceil(sorted.length / 8)) === 0) out.add(n.id);
      });
      return out;
    }, []);
    function edgePath(a, b) {
      const pa = P[a], pb = P[b];
      const dx = Math.max(28, pb.x - pa.x);
      const c1 = pa.x + dx * 0.42;
      const c2 = pb.x - dx * 0.24;
      return `M${pa.x} ${pa.y} C ${c1} ${pa.y}, ${c2} ${pb.y}, ${pb.x} ${pb.y}`;
    }

    return (
      React.createElement('div', { className: 'tree-host', ref: wrapRef,
        onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerLeave: onUp,
        style: { cursor: drag.current ? 'grabbing' : 'grab' } },

        React.createElement('svg', { width: '100%', height: '100%', style: { opacity: view.ready ? 1 : 0 } },
          React.createElement('g', { transform: `translate(${view.tx} ${view.ty}) scale(${view.k})` },
            // edges
            edges.map(([a, b, n]) => {
              const st = E.fns.statusAt(n, T);
              const onLin = lineage.has(a) && lineage.has(b);
              const col = n.score != null ? fitVar(n.fit) : (st === 'rejected' ? 'var(--bad)' : 'var(--line-strong)');
              return React.createElement('path', {
                key: 'e' + b, d: edgePath(a, b), fill: 'none',
                stroke: onLin ? 'var(--accent)' : col,
                strokeWidth: onLin ? 2.4 : (edgeCount > 250 ? 0.75 : 1.25),
                opacity: onLin ? 0.95 : (edgeCount > 250 ? (n.score != null ? 0.18 : 0.12) : (n.score != null ? 0.42 : 0.3)),
                style: { transition: 'opacity .4s, stroke .2s' },
              });
            }),
            transferEdges.map(([a, b, edge]) => {
              if (!P[a] || !P[b]) return null;
              const mid = { x: (P[a].x + P[b].x) / 2, y: (P[a].y + P[b].y) / 2 };
              const path = edgePath(a, b);
              return React.createElement('g', { key: 'g' + edge.id },
                React.createElement('path', {
                  d: path,
                  fill: 'none',
                  stroke: 'var(--accent)',
                  strokeWidth: 1.7,
                  strokeDasharray: '5 5',
                  opacity: 0.72,
                  vectorEffect: 'non-scaling-stroke',
                  pointerEvents: 'none',
                }),
                React.createElement('path', {
                  d: path,
                  fill: 'none',
                  stroke: 'transparent',
                  strokeWidth: 12,
                  vectorEffect: 'non-scaling-stroke',
                  style: { cursor: 'help' },
                  onPointerEnter: () => setHover({ transfer: edge, p: mid }),
                  onPointerLeave: () => setHover(null),
                })
              );
            }),
            timeTicks.map((tick, i) => React.createElement('g', { key: 'tick' + i },
              React.createElement('line', { x1: tick.x, y1: PAD - 18, x2: tick.x, y2: VH - PAD + 18, stroke: 'var(--line-soft)', strokeWidth: 1, opacity: 0.65 }),
              React.createElement('text', { x: tick.x, y: VH - PAD + 36, textAnchor: 'middle', className: 'time-tick' }, mmss(tick.t))
            )),
            // nodes
            vis.map((n) => {
              const st = E.fns.statusAt(n, T);
              const v = nodeVisual(n, st);
              if (!v.r) return null;
              const r = Math.max(2.8, v.r / Math.sqrt(Math.max(1, view.k)));
              const p = P[n.id];
              const isSel = n.id === selected;
              const dim = dimOffLineage && selected && !lineage.has(n.id);
              return React.createElement('g', {
                key: n.id, transform: `translate(${p.x} ${p.y})`,
                style: { cursor: 'pointer', transition: 'opacity .4s' }, opacity: dim ? 0.28 : v.op,
                onClick: (e) => { e.stopPropagation(); if (!drag.current || !drag.current.moved) onSelect(n.id); },
                onPointerEnter: () => setHover({ n, st, p }), onPointerLeave: () => setHover(null),
              },
                v.glow ? React.createElement('circle', { r: r + 6 / Math.sqrt(Math.max(1, view.k)), fill: 'var(--accent-soft)' }) : null,
                React.createElement('circle', {
                  r, fill: v.fill, stroke: v.glow ? 'var(--accent)' : v.stroke,
                  strokeWidth: v.glow ? 2 : (v.stroke !== 'none' ? 1.6 : 0),
                  vectorEffect: 'non-scaling-stroke',
                  style: v.working ? { animation: 'nodepulse 1.6s ease-in-out infinite' } : null,
                }),
                isSel ? React.createElement('circle', { r: r + 5 / Math.sqrt(Math.max(1, view.k)), fill: 'none', stroke: 'var(--accent)', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' }) : null,
                // score label on bigger verified nodes
                (st === 'verified' && scoreLabels && labelIds.has(n.id) && view.k > 0.7)
                  ? React.createElement('text', { y: -r - 8 / view.k, textAnchor: 'middle', className: 'node-label', style: { fontSize: (11 / view.k) + 'px' } },
                      (n.score / 1000).toFixed(1) + 'k')
                  : null,
              );
            }),
          ),
        ),

        // hover tooltip (screen-space)
        hover && hover.transfer ? React.createElement('div', {
          className: 'tree-tip transfer-tip',
          style: { left: hover.p.x * view.k + view.tx + 14, top: hover.p.y * view.k + view.ty - 8 },
        },
          React.createElement('div', { className: 'tt-head' },
            React.createElement('span', { className: 'mono tt-id' }, 'gene transfer'),
            React.createElement('span', { className: 'pill', 'data-status': 'working' },
              React.createElement('span', { className: 'dot' }), 'graft')),
          React.createElement('div', { className: 'tt-title' },
            (hover.transfer.donorFamily || 'branch') + ' → ' + (hover.transfer.recipientFamily || 'branch')),
          React.createElement('div', { className: 'tt-score mono' }, 'donor ' + hover.transfer.donor + ' → ' + hover.transfer.to),
          hover.transfer.transferred
            ? React.createElement('div', { className: 'tt-meta mono' },
                [
                  hover.transfer.transferred.operator,
                  hover.transfer.transferred.reuse_goal,
                  hover.transfer.transferred.tile ? JSON.stringify(hover.transfer.transferred.tile) : null,
                ].filter(Boolean).join(' · ') || 'structural transfer')
            : null
        ) : hover ? React.createElement('div', {
          className: 'tree-tip',
          style: { left: hover.p.x * view.k + view.tx + 14, top: hover.p.y * view.k + view.ty - 8 },
        },
          React.createElement('div', { className: 'tt-head' },
            React.createElement('span', { className: 'mono tt-id' }, hover.n.id),
            React.createElement('span', { className: `pill`, 'data-status': pillStatus(hover.st) },
              React.createElement('span', { className: 'dot' }), hover.st)),
          React.createElement('div', { className: 'tt-title' }, hover.n.title),
          hover.n.score != null && hover.st === 'verified'
            ? React.createElement('div', { className: 'tt-score mono' }, hover.n.score.toLocaleString() + ' energy')
            : React.createElement('div', { className: 'tt-score mono', style: { color: 'var(--ink-3)' } },
                hover.st === 'rejected' ? 'rejected · ' + (hover.n.semantic) : 'in progress…'))
          : null,

        // axis chrome (static)
        React.createElement('div', { className: 'axis axis-x' }, '← earlier', React.createElement('span', null, 'time →')),
        React.createElement('div', { className: 'axis axis-y-top' }, useBranchLaneLayout ? 'branch lanes' : useLaneLayout ? 'orchestration lanes' : 'better ↑'),
        React.createElement('div', { className: 'axis axis-y-bot' }, useBranchLaneLayout ? 'score shown by color' : useLaneLayout ? 'score nudges within lanes' : 'worse ↓'),
        // legend + controls
        React.createElement('div', { className: 'tree-legend' },
          React.createElement('span', { className: 'eyebrow' }, 'fitness'),
          React.createElement('div', { className: 'legend-ramp' },
            [0,1,2,3,4,5,6].map((f) => React.createElement('span', { key: f, style: { background: fitVar(f) } }))),
          React.createElement('span', { className: 'mono legend-cap' }, (SMAX/1000).toFixed(0) + 'k'),
          React.createElement('span', { className: 'mono legend-cap', style:{color:'var(--fit-6)'} }, (SMIN/1000).toFixed(1) + 'k')),
        React.createElement('div', { className: 'tree-ctrls' },
          React.createElement('button', { className: 'btn icon', title: 'fit', onClick: fit }, '⤢'),
          React.createElement('button', { className: 'btn icon', title: 'zoom in', onClick: () => setView(v=>({...v,k:Math.min(9,v.k*1.2)})) }, '+'),
          React.createElement('button', { className: 'btn icon', title: 'zoom out', onClick: () => setView(v=>({...v,k:Math.max(0.35,v.k/1.2)})) }, '−')),
      )
    );
  }

  function pillStatus(st) {
    if (st === 'verified') return 'ok';
    if (st === 'rejected') return 'bad';
    if (st === 'claimed' || st === 'submitted') return 'working';
    return 'idle';
  }

  window.EvoTree = EvoTree;
  window.TREE_LAYOUT = LAYOUT;
})();
