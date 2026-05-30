/* EvoFlow — Compare page.
   ONE evolution tree as the main panel, with TWO branches highlighted on it
   (A blue, B amber) and their divergence marked. BELOW: side-by-side run
   snapshots showing how each branch's algorithm actually executes. Right: the
   branch diff panel. Click any node to reassign the active branch. */
(function () {
  const { useState, useRef, useMemo } = React;
  const RUNS = window.EVO_RUNS;
  const BY = window.EVO_RUN_BY_ID;
  const fmt = (n) => n == null ? '—' : Math.round(n).toLocaleString();
  const mmss = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.round(t % 60)).padStart(2, '0');
  const fitVar = (f) => `var(--fit-${f})`;

  function lineageArr(world, nodeId) { const a = []; let c = world.nodes.find((n) => n.id === nodeId); while (c) { a.unshift(c); c = c.parent ? world.nodes.find((n) => n.id === c.parent) : null; } return a; }
  function gen1Of(world, node) { let c = node; while (c && c.gen > 1) c = world.nodes.find((n) => n.id === c.parent); return c; }
  function genIR(node) {
    const m = (node.candidate.match(/(\d+)x(\d+)x(\d+)/) || [null, '4', '2', '1']);
    return [`; ${node.candidate}`, `panel = tile(${m[1]}, ${m[2]})`, `for (i,j) in panels(C, panel):`,
      `  acc = zero(${m[1]}, ${m[2]})`, `  for k in 0..16 step ${m[3]}:`, `    acc = fma(A[i,k], B[k,j], acc)`,
      node.family === 'lifetime' ? `  free_dead(T)   ; reuse` : `  ; no lifetime reuse`, `  store C[i,j] = acc`].join('\n');
  }

  // ---- main evolution tree with two highlighted branches ----
  function EvoTreeTwo({ world, aNode, bNode, cA, cB, active, onPick }) {
    const W = 1320, H = 640, pad = 54;
    const panelRef = useRef(null);
    const [hover, setHover] = useState(null);
    const dom = useMemo(() => ({ sMax: 108880, sMin: world.meta.best - 1200, tMax: world.meta.tMax }), [world.meta.seed]);
    const pos = useMemo(() => {
      const ls = {};
      world.nodes.forEach((n, i) => { if (n.score != null) ls[n.id] = n.score; else { const p = n.parent ? ls[n.parent] : dom.sMax; const nudge = n.outcome === 'reject' ? 2600 : 900; ls[n.id] = Math.min(dom.sMax, (p || dom.sMax) + ((i % 7) - 3) * 220 + nudge * 0.4); } });
      const span = dom.sMax - dom.sMin || 1; const o = {};
      world.nodes.forEach((n) => { o[n.id] = { x: pad + (n.tProposed / dom.tMax) * (W - 2 * pad), y: pad + ((Math.max(dom.sMin, Math.min(dom.sMax, ls[n.id])) - dom.sMin) / span) * (H - 2 * pad) }; });
      return o;
    }, [world.meta.seed]);
    const linA = useMemo(() => new Set(lineageArr(world, aNode).map((n) => n.id)), [world.meta.seed, aNode]);
    const linB = useMemo(() => new Set(lineageArr(world, bNode).map((n) => n.id)), [world.meta.seed, bNode]);
    const diverge = useMemo(() => { const arrA = lineageArr(world, aNode); let last = arrA[0]; for (const n of arrA) { if (linB.has(n.id)) last = n; else break; } return last; }, [world.meta.seed, aNode, bNode]);
    const T = world.meta.tMax;
    const edge = (a, b) => { const pa = pos[a], pb = pos[b], mx = (pa.x + pb.x) / 2; return `M${pa.x} ${pa.y} C ${mx} ${pa.y}, ${mx} ${pb.y}, ${pb.x} ${pb.y}`; };

    return React.createElement('div', { className: 'evo-tree', ref: panelRef,
      onPointerMove: (e) => { if (hover) { const r = panelRef.current.getBoundingClientRect(); setHover((h) => h && ({ ...h, mx: e.clientX - r.left, my: e.clientY - r.top })); } } },
      React.createElement('svg', { className: 'evo-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' },
        // edges
        world.nodes.map((n) => { if (!n.parent) return null; const inA = linA.has(n.id) && linA.has(n.parent), inB = linB.has(n.id) && linB.has(n.parent);
          const both = inA && inB; const col = both ? 'var(--ink-2)' : inA ? cA : inB ? cB : (n.score != null ? fitVar(n.fit) : (n.outcome === 'reject' ? 'var(--bad)' : 'var(--line-strong)'));
          return React.createElement('path', { key: 'e' + n.id, d: edge(n.parent, n.id), fill: 'none', stroke: col, strokeWidth: (inA || inB) ? 2.6 : 1, opacity: (inA || inB) ? 0.98 : (n.score != null ? 0.26 : 0.18) }); }),
        // nodes
        world.nodes.map((n) => { const st = world.fns.statusAt(n, T); const p = pos[n.id]; const onA = linA.has(n.id), onB = linB.has(n.id); const on = onA || onB;
          let r, fill, stroke = 'none';
          if (st === 'verified') { r = 3.4 + (n.fit || 0) * 1.0; fill = fitVar(n.fit); }
          else if (st === 'rejected') { r = 2.8; fill = 'var(--bg-canvas)'; stroke = 'var(--bad)'; }
          else { r = 2.6; fill = 'var(--bg-canvas)'; stroke = 'var(--line-strong)'; }
          const isLeafA = n.id === aNode, isLeafB = n.id === bNode, isDiv = n.id === diverge.id;
          return React.createElement('g', { key: n.id, transform: `translate(${p.x} ${p.y})`, style: { cursor: 'pointer' }, opacity: on ? 1 : 0.4, onClick: () => onPick(n.id),
            onPointerEnter: () => { const rect = panelRef.current.getBoundingClientRect(); setHover({ n, st, mx: p.x / W * rect.width, my: p.y / H * rect.height }); }, onPointerLeave: () => setHover(null) },
            (isLeafA || isLeafB) ? React.createElement('circle', { r: r + 4.5, fill: 'none', stroke: isLeafA ? cA : cB, strokeWidth: 2.2 }) : null,
            isDiv && !isLeafA && !isLeafB ? React.createElement('rect', { x: -(r + 3), y: -(r + 3), width: 2 * (r + 3), height: 2 * (r + 3), fill: 'none', stroke: 'var(--ink-2)', strokeWidth: 1.4, transform: 'rotate(45)' }) : null,
            React.createElement('circle', { r, fill, stroke, strokeWidth: stroke !== 'none' ? 1.4 : 0 })); }),
        // axis chrome
        React.createElement('text', { x: pad, y: 22, className: 'og-axis' }, 'better ↑'),
        React.createElement('text', { x: pad, y: H - 14, className: 'og-axis' }, 'worse ↓'),
        React.createElement('text', { x: W - pad, y: H - 14, textAnchor: 'end', className: 'og-axis' }, 'time →')),
      // overlays
      React.createElement('div', { className: 'evo-legend' },
        React.createElement('span', { className: 'og-leg' }, React.createElement('i', { style: { background: cA } }), 'Branch A'),
        React.createElement('span', { className: 'og-leg' }, React.createElement('i', { style: { background: cB } }), 'Branch B'),
        React.createElement('span', { className: 'og-leg' }, React.createElement('b', { style: { width: 8, height: 8, border: '1.4px solid var(--ink-2)', transform: 'rotate(45deg)', display: 'inline-block', borderRadius: 0 } }), 'diverges · gen ' + diverge.gen)),
      React.createElement('div', { className: 'evo-active mono' }, 'assigning: ', React.createElement('span', { style: { color: active === 'a' ? cA : cB, fontWeight: 700 } }, 'Branch ' + active.toUpperCase()), ' — click a node'),
      hover ? React.createElement('div', { className: 'ctree-tip', style: { left: Math.min(hover.mx + 12, (panelRef.current ? panelRef.current.clientWidth : 500) - 184), top: hover.my + 10 } },
        React.createElement('div', { className: 'ctt-title' }, hover.n.title),
        React.createElement('div', { className: 'ctt-meta mono' }, hover.n.id + ' · gen ' + hover.n.gen + ' · ' + hover.n.family),
        React.createElement('div', { className: 'ctt-score mono', style: { color: hover.n.score != null ? fitVar(hover.n.fit) : 'var(--ink-3)' } }, hover.n.score != null ? fmt(hover.n.score) + ' energy' : hover.st)) : null);
  }

  // ---- run snapshot below ----
  function RunSnapshot({ label, color, node, world, speed }) {
    const parent = node.parent ? world.nodes.find((n) => n.id === node.parent) : null;
    const d = parent && parent.score != null && node.score != null ? node.score - parent.score : null;
    return React.createElement('div', { className: 'snap' },
      React.createElement('div', { className: 'snap-head' },
        React.createElement('div', { className: 'snap-titlerow' },
          React.createElement('span', { className: 'mt-dot', style: { background: color } }),
          React.createElement('span', { className: 'snap-run', style: { color } }, label),
          React.createElement('span', { className: 'snap-gen mono' }, node.id + ' · gen ' + node.gen)),
        React.createElement('div', { className: 'snap-title' }, node.gen === 0 ? 'Baseline IR' : node.title),
        React.createElement('div', { className: 'snap-cand mono' }, node.candidate)),
      React.createElement('div', { className: 'snap-metrics' },
        React.createElement('div', { className: 'snap-m' }, React.createElement('span', { className: 'snap-mk' }, 'energy'), React.createElement('span', { className: 'snap-mv mono' }, fmt(node.score))),
        React.createElement('div', { className: 'snap-m' }, React.createElement('span', { className: 'snap-mk' }, 'Δ step'), React.createElement('span', { className: 'snap-mv mono', style: { color: d == null ? 'var(--ink-3)' : d < 0 ? 'var(--ok)' : 'var(--bad)' } }, d == null ? '—' : (d < 0 ? '▼ ' : '▲ ') + fmt(Math.abs(d)))),
        React.createElement('div', { className: 'snap-m' }, React.createElement('span', { className: 'snap-mk' }, 'family'), React.createElement('span', { className: 'snap-mv mono' }, node.family))),
      React.createElement('div', { className: 'snap-run-wrap' }, React.createElement(window.RunPlayback, { node, speed, key: node.id })),
      React.createElement('div', { className: 'block-label', style: { margin: '4px 0 6px' } }, 'candidate IR'),
      React.createElement('pre', { className: 'well ir' }, genIR(node)));
  }

  // ---- right diff panel ----
  function Section({ title, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return React.createElement('div', { className: 'sb-section' },
      React.createElement('div', { className: 'sb-head' + (open ? '' : ' collapsed'), onClick: () => setOpen((o) => !o) },
        React.createElement('svg', { className: 'sb-chev', viewBox: '0 0 16 16', fill: 'none' }, React.createElement('path', { d: 'M5 6 L8 9.5 L11 6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })),
        React.createElement('h3', null, title)),
      open ? React.createElement('div', { className: 'sb-body' }, children) : null);
  }
  function DiffRow({ k, a, b, f, lowerBetter, neutral }) {
    f = f || fmt; let aw = false, bw = false;
    if (!neutral && a !== b && typeof a === 'number') { if (lowerBetter) { aw = a < b; bw = b < a; } else { aw = a > b; bw = b > a; } }
    return React.createElement('div', { className: 'drow' }, React.createElement('span', { className: 'dk' }, k),
      React.createElement('span', { className: 'dv mono' + (aw ? ' win' : '') }, f(a)), React.createElement('span', { className: 'dv mono' + (bw ? ' win' : '') }, f(b)));
  }
  function BucketCompare({ na, nb, cA, cB }) {
    const order = ['mul', 'add', 'copy', 'load', 'store'];
    const seg = (buckets) => { if (!buckets) return React.createElement('div', { className: 'bcmp-bar' }); const tot = order.reduce((s, k) => s + buckets[k], 0); return React.createElement('div', { className: 'bcmp-bar' }, order.map((k, i) => React.createElement('div', { key: k, className: 'bcmp-seg', style: { width: (buckets[k] / tot * 100) + '%', background: `var(--fit-${i + 1})` }, title: k }))); };
    return React.createElement('div', null,
      React.createElement('div', { className: 'bcmp-row' }, React.createElement('span', { className: 'bcmp-dot', style: { background: cA } }), seg(na.buckets)),
      React.createElement('div', { className: 'bcmp-row' }, React.createElement('span', { className: 'bcmp-dot', style: { background: cB } }), seg(nb.buckets)),
      React.createElement('div', { className: 'bcmp-legend' }, order.map((k, i) => React.createElement('span', { key: k }, React.createElement('i', { style: { background: `var(--fit-${i + 1})` } }), k))));
  }

  function App() {
    const [runId, setRunId] = useState(() => (RUNS && RUNS[0] ? RUNS[0].id : 'panel'));
    const run = BY[runId] || RUNS[0]; const world = run.world;
    const cA = 'var(--cmp-a)', cB = 'var(--cmp-b)';

    // default branches: best (A) and best of a different gen-1 family (B)
    const defaults = useMemo(() => {
      const best = world.nodes.find((n) => n.id === world.meta.bestNode);
      const aFam = gen1Of(world, best);
      const others = world.nodes.filter((n) => n.outcome === 'accept' && n.score != null).filter((n) => { const g = gen1Of(world, n); return g && aFam && g.id !== aFam.id; }).sort((x, y) => x.score - y.score);
      const b = others[0] || world.nodes.filter((n) => n.outcome === 'accept' && n.id !== best.id).sort((x, y) => x.score - y.score)[0];
      return { a: best.id, b: b ? b.id : best.id };
    }, [runId]);

    const [aNode, setANode] = useState(defaults.a);
    const [bNode, setBNode] = useState(defaults.b);
    const [active, setActive] = useState('b');
    React.useEffect(() => { setANode(defaults.a); setBNode(defaults.b); }, [runId]);

    const nodeA = world.nodes.find((n) => n.id === aNode) || world.nodes[0];
    const nodeB = world.nodes.find((n) => n.id === bNode) || world.nodes[0];
    const onPick = (id) => { if (active === 'a') setANode(id); else setBNode(id); };

    // divergence stats
    const arrA = lineageArr(world, aNode), arrB = lineageArr(world, bNode);
    const setB = new Set(arrB.map((n) => n.id)); let div = arrA[0]; for (const n of arrA) { if (setB.has(n.id)) div = n; else break; }
    const aOnly = arrA.length - (arrA.findIndex((n) => n.id === div.id) + 1);
    const bOnly = arrB.length - (arrB.findIndex((n) => n.id === div.id) + 1);

    const BranchChip = ({ side, node, color }) => React.createElement('button', { className: 'bchip' + (active === side ? ' on' : ''), style: active === side ? { borderColor: color } : null, onClick: () => setActive(side) },
      React.createElement('span', { className: 'bchip-side', style: { color } }, side.toUpperCase()),
      React.createElement('span', { className: 'bchip-dot', style: { background: color } }),
      React.createElement('span', { className: 'bchip-cand mono' }, node.candidate),
      React.createElement('span', { className: 'bchip-score mono' }, fmt(node.score)));

    return React.createElement('div', { className: 'capp' },
      React.createElement('header', { className: 'ctop' },
        React.createElement('div', { className: 'top-left' },
          React.createElement('a', { className: 'logo', href: 'index.html', title: 'Back to dashboard' },
            React.createElement('svg', { viewBox: '0 0 34 34', width: 24, height: 24, fill: 'none' },
              React.createElement('circle', { cx: 6, cy: 17, r: 3, fill: 'var(--fit-1)' }), React.createElement('circle', { cx: 17, cy: 8, r: 2.6, fill: 'var(--fit-3)' }),
              React.createElement('circle', { cx: 17, cy: 26, r: 2.6, fill: 'var(--fit-2)' }), React.createElement('circle', { cx: 28, cy: 6, r: 3.4, fill: 'var(--cmp-a)' }),
              React.createElement('circle', { cx: 28, cy: 20, r: 2.4, fill: 'var(--fit-4)' }), React.createElement('path', { d: 'M9 17 L14.6 9 M9 17 L14.6 25 M19.4 8 L26 6.5 M19.4 8 L26 19 M19.4 26 L26 27.5', stroke: 'var(--line-strong)', strokeWidth: 1.2 })),
            React.createElement('span', { className: 'logo-name' }, 'EvoFlow')),
          React.createElement('nav', { className: 'nav-tabs' },
            React.createElement('a', { className: 'nav-tab', href: 'index.html' }, 'Tree'),
            React.createElement('a', { className: 'nav-tab active', href: 'Compare.html' }, 'Compare')),
          React.createElement('div', { className: 'prob' },
            React.createElement('span', { className: 'prob-name' }, 'Compare branches'),
            React.createElement('label', { className: 'run-pick inline' },
              React.createElement('span', { className: 'rp-side' }, 'evolution'),
              React.createElement('select', { value: runId, onChange: (e) => setRunId(e.target.value) }, RUNS.map((r) => React.createElement('option', { key: r.id, value: r.id }, r.label)))))),
        React.createElement('div', { className: 'branch-chips' },
          React.createElement(BranchChip, { side: 'a', node: nodeA, color: cA }),
          React.createElement(BranchChip, { side: 'b', node: nodeB, color: cB }))),

      React.createElement('div', { className: 'cbody4' },
        React.createElement('div', { className: 'evo-main' },
          React.createElement(EvoTreeTwo, { world, aNode, bNode, cA, cB, active, onPick }),
          React.createElement('div', { className: 'evo-snaps' },
            React.createElement(RunSnapshot, { label: 'Branch A', color: cA, node: nodeA, world, speed: 1 }),
            React.createElement(RunSnapshot, { label: 'Branch B', color: cB, node: nodeB, world, speed: 1 }))),

        React.createElement('aside', { className: 'sidebar' },
          React.createElement('div', { className: 'sb-scroll' },
            React.createElement(Section, { title: 'Branches' },
              React.createElement('div', { className: 'drow dhead' }, React.createElement('span', { className: 'dk' }, ''), React.createElement('span', { className: 'dv', style: { color: cA } }, 'A'), React.createElement('span', { className: 'dv', style: { color: cB } }, 'B')),
              React.createElement(DiffRow, { k: 'Energy', a: nodeA.score, b: nodeB.score, lowerBetter: true }),
              React.createElement(DiffRow, { k: 'vs baseline', a: world.meta.baseline - nodeA.score, b: world.meta.baseline - nodeB.score, f: (x) => '−' + fmt(x) }),
              React.createElement(DiffRow, { k: 'Generation', a: nodeA.gen, b: nodeB.gen, neutral: true }),
              React.createElement(DiffRow, { k: 'Family', a: nodeA.family, b: nodeB.family, f: (x) => x, neutral: true }),
              React.createElement(DiffRow, { k: 'Semantic', a: nodeA.semantic || '—', b: nodeB.semantic || '—', f: (x) => x, neutral: true })),
            React.createElement(Section, { title: 'Where they diverge' },
              React.createElement('div', { className: 'div-note' }, 'shared ancestor ', React.createElement('span', { className: 'mono', style: { color: 'var(--ink)' } }, div.id), ' at gen ', React.createElement('b', null, div.gen)),
              React.createElement('div', { className: 'drow', style: { marginTop: 8 } }, React.createElement('span', { className: 'dk' }, 'Steps after split'), React.createElement('span', { className: 'dv mono', style: { color: cA } }, '+' + aOnly), React.createElement('span', { className: 'dv mono', style: { color: cB } }, '+' + bOnly)),
              React.createElement('div', { className: 'div-note', style: { marginTop: 6 } }, 'shared score ', React.createElement('span', { className: 'mono', style: { color: 'var(--ink)' } }, fmt(div.score)))),
            React.createElement(Section, { title: 'Cost-bucket mix' },
              React.createElement(BucketCompare, { na: nodeA, nb: nodeB, cA, cB }))))));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
})();
