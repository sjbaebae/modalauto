/* NodeInspector — fills the sidebar with Figma-style property sections
   when a node is selected (metrics, buckets, lineage, trace, run playback). */
(function () {
  const { useState, useMemo, useEffect } = React;
  const E = window.APP;
  const Section = window.SBSection;
  const roleCol = window.evoRoleCol;
  const ROLE_LABEL = window.EVO_ROLE_LABEL;
  const mmss = window.evoMMSS;
  const fmt = (n) => n == null ? '—' : n.toLocaleString();

  function statusPill(st) {
    const map = { verified: 'ok', rejected: 'bad', claimed: 'working', submitted: 'working', queued: 'idle', abandoned: 'dead' };
    const label = { verified: 'verified', rejected: 'rejected', claimed: 'building', submitted: 'in verification', queued: 'queued', abandoned: 'abandoned' };
    return React.createElement('span', { className: 'pill', 'data-status': map[st] || 'idle' },
      React.createElement('span', { className: 'dot' }), label[st] || st);
  }

  const BUCKET_COLORS = { mul: '--role-implementor', add: '--role-verifier', copy: '--role-explorer', load: '--role-researcher', store: '--role-searcher' };
  function BucketBar({ buckets }) {
    if (!buckets) return null;
    const order = ['mul', 'add', 'copy', 'load', 'store'];
    const total = order.reduce((s, k) => s + buckets[k], 0);
    return React.createElement('div', null,
      React.createElement('div', { className: 'bucket-bar' },
        order.map((k) => React.createElement('div', { key: k, className: 'bucket-seg', style: { width: (buckets[k] / total * 100) + '%', background: `var(${BUCKET_COLORS[k]})` }, title: k }))),
      React.createElement('div', { className: 'bucket-legend' },
        order.map((k) => React.createElement('div', { key: k, className: 'bl-item' },
          React.createElement('span', { className: 'bl-dot', style: { background: `var(${BUCKET_COLORS[k]})` } }),
          React.createElement('span', { className: 'bl-k' }, k),
          React.createElement('span', { className: 'bl-v' }, fmt(buckets[k])),
          React.createElement('span', { className: 'bl-pct' }, Math.round(buckets[k] / total * 100) + '%')))));
  }

  function genIR(node) {
    const m = (node.candidate.match(/(\d+)x(\d+)x(\d+)/) || [null, '4', '2', '1']);
    return [
      `; ${node.candidate}`,
      `def matmul16(A,B) -> C {`,
      `  panel = tile(${m[1]}, ${m[2]})`,
      `  for (i,j) in panels(C, panel):`,
      `    acc = zero(${m[1]}, ${m[2]})`,
      `    for k in 0..16 step ${m[3]}:`,
      `      acc = fma(A[i,k], B[k,j], acc)`,
      node.family === 'lifetime' ? `    free_dead(T)   ; reuse` : `    ; no reuse`,
      `    store C[i,j] = acc`,
      `}`,
    ].join('\n');
  }

  function InspectorPanel({ nodeId, T, speed, onClose, onSelect }) {
    const node = E.nodes.find((n) => n.id === nodeId);
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    if (!node) return null;

    const st = E.fns.statusAt(node, T);
    const stNow = st === 'unborn' ? 'queued' : st;
    const parent = node.parent ? E.nodes.find((n) => n.id === node.parent) : null;
    const delta = (node.score != null && parent && parent.score != null) ? node.score - parent.score : null;
    const lineage = useMemo(() => { const arr = []; let cur = node; while (cur) { arr.unshift(cur); cur = cur.parent ? E.nodes.find((n) => n.id === cur.parent) : null; } return arr; }, [nodeId]);
    const children = E.nodes.filter((n) => n.parent === node.id);

    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'insp-bar' },
        React.createElement('button', { className: 'insp-back', onClick: onClose },
          React.createElement('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none' },
            React.createElement('path', { d: 'M10 4 L6 8 L10 12', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })),
          'team'),
        React.createElement('span', { className: 'insp-id' }, node.id),
        statusPill(stNow)),

      React.createElement('div', { className: 'sb-scroll' },
        // identity
        React.createElement('div', { className: 'sb-section' },
          React.createElement('h3', { className: 'insp-title' }, node.title),
          React.createElement('div', { className: 'insp-sub' },
            React.createElement('span', { className: 'insp-cand' }, node.candidate),
            React.createElement('span', { className: 'insp-meta' }, 'gen ' + node.gen),
            React.createElement('span', { className: 'role-chip', style: { '--role': roleCol(node.proposerRole) } },
              React.createElement('span', { className: 'glyph' }), ROLE_LABEL[node.proposerRole]),
            React.createElement('span', { className: 'insp-meta mono' }, node.proposer))),

        // result
        React.createElement(Section, { title: 'Result', defaultOpen: true },
          node.outcome === 'accept'
            ? React.createElement('div', null,
                React.createElement('div', { className: 'insp-score-val', style: node.isFrontier ? { color: 'var(--accent)' } : null }, fmt(node.score)),
                React.createElement('div', { className: 'insp-score-row' },
                  React.createElement('span', { className: 'insp-meta' }, E.meta.metric),
                  node.isFrontier ? React.createElement('span', { className: 'frontier-tag' }, '★ current frontier') : null),
                React.createElement('div', { className: 'prow' }, React.createElement('span', { className: 'pk' }, 'Δ vs parent'),
                  delta != null ? React.createElement('span', { className: 'pv', style: { color: delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--bad)' : 'var(--ink-3)' } }, (delta < 0 ? '▼ ' : delta > 0 ? '▲ ' : '') + fmt(Math.abs(delta))) : React.createElement('span', { className: 'pv' }, '—')),
                React.createElement('div', { className: 'prow' }, React.createElement('span', { className: 'pk' }, 'Semantic'), React.createElement('span', { className: 'pv', style: { color: 'var(--ok)' } }, node.semantic)))
            : node.outcome === 'reject'
              ? React.createElement('div', null,
                  React.createElement('div', { className: 'insp-score-val', style: { color: 'var(--bad)' } }, 'rejected'),
                  React.createElement('div', { className: 'prow' }, React.createElement('span', { className: 'pk' }, 'Semantic'), React.createElement('span', { className: 'pv', style: { color: node.semantic === 'invalid' ? 'var(--bad)' : 'var(--ink-1)' } }, node.semantic)))
              : React.createElement('div', null,
                  React.createElement('div', { className: 'insp-score-val', style: { color: 'var(--accent)', fontSize: 'var(--fs-lg)' } }, stNow),
                  React.createElement('div', { className: 'insp-meta', style: { marginTop: 6 } }, 'result not yet verified at this point in time'))),

        // cost buckets
        node.buckets ? React.createElement(Section, { title: 'Cost buckets', defaultOpen: true },
          React.createElement(BucketBar, { buckets: node.buckets })) : null,

        // lineage
        React.createElement(Section, { title: 'Lineage', aside: 'gen ' + node.gen, defaultOpen: true },
          React.createElement('div', { className: 'lineage', style: { marginLeft: -8, marginRight: -8 } },
            lineage.map((a) => React.createElement('div', { key: a.id, className: 'lin-step' + (a.id === node.id ? ' cur' : ''), onClick: () => onSelect(a.id) },
              React.createElement('span', { className: 'lin-dot', style: { background: a.score != null ? `var(--fit-${a.fit})` : 'var(--line-strong)' } }),
              React.createElement('span', { className: 'lin-id' }, a.id),
              React.createElement('span', { className: 'lin-score' }, a.score != null ? fmt(a.score) : '—'))))),

        // descendants
        children.length ? React.createElement(Section, { title: 'Descendants', aside: children.length, defaultOpen: false },
          React.createElement('div', { className: 'child-row' },
            children.map((ch) => React.createElement('button', { key: ch.id, className: 'child-chip', onClick: () => onSelect(ch.id) },
              React.createElement('span', { className: 'lin-dot', style: { background: ch.score != null ? `var(--fit-${ch.fit})` : 'var(--line-strong)' } }),
              ch.score != null ? fmt(ch.score) : ch.id)))) : null,

        // timeline
        React.createElement(Section, { title: 'Timeline', defaultOpen: false },
          React.createElement('div', { className: 'lifeline' },
            [['proposed', node.tProposed, node.proposer], ['claimed', node.tClaimed, node.impl], ['submitted', node.tSubmitted, node.impl], ['verified', node.tVerified, node.verifier]]
              .filter(([, tt]) => tt != null).map(([k, tt, who]) => React.createElement('div', { key: k, className: 'life-row' + (T >= tt ? ' done' : '') },
                React.createElement('span', { className: 'life-k' }, k),
                React.createElement('span', { className: 'life-t' }, mmss(tt)),
                React.createElement('span', { className: 'life-who' }, who || '—'))))),

        // trace
        React.createElement(Section, { title: 'Candidate IR & verification', defaultOpen: false },
          React.createElement('pre', { className: 'well ir', style: { marginBottom: 10 } }, genIR(node)),
          React.createElement('div', { className: 'well ver-rec' },
            React.createElement('div', null, 'submission  ', React.createElement('span', { style: { color: 'var(--ink)' } }, node.subId || '—')),
            React.createElement('div', null, 'verifier    ', React.createElement('span', { style: { color: 'var(--ink)' } }, node.verifier || '—')),
            React.createElement('div', null, 'official    ', React.createElement('span', { style: { color: 'var(--ink)' } }, fmt(node.score))),
            React.createElement('div', null, 'decision    ', React.createElement('span', { style: { color: node.outcome === 'accept' ? 'var(--ok)' : node.outcome === 'reject' ? 'var(--bad)' : 'var(--ink-3)' } }, node.outcome || 'pending')))),

        // run playback
        React.createElement(Section, { title: 'Run playback', defaultOpen: true },
          React.createElement(window.RunPlayback, { node, speed }))));
  }

  window.InspectorPanel = InspectorPanel;
})();
