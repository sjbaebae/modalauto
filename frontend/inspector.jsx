/* NodeInspector — fills the sidebar with Figma-style property sections
   when a node is selected (metrics, buckets, lineage, trace, run playback). */
(function () {
  const { useState, useMemo, useEffect } = React;
  let E = window.APP;
  window.addEventListener('autoresearch-world', () => { E = window.APP; });
  const Section = window.SBSection;
  const roleCol = window.evoRoleCol;
  const ROLE_LABEL = window.EVO_ROLE_LABEL;
  const mmss = window.evoMMSS;
  const fmt = (n) => n == null ? '—' : n.toLocaleString();

  function statusPill(st) {
    const map = { verified: 'ok', rejected: 'bad', claimed: 'working', submitted: 'working', queued: 'idle', abandoned: 'dead' };
    const label = { verified: 'verified', rejected: 'rejected', claimed: 'building', submitted: 'in verification', queued: 'queued', abandoned: 'abandoned' };
    return (
      <span className="pill" data-status={map[st] || 'idle'}>
        <span className="dot" />{label[st] || st}
      </span>
    );
  }

  const BUCKET_COLORS = { mul: '--role-implementor', add: '--role-verifier', copy: '--role-explorer', load: '--role-researcher', store: '--role-searcher' };
  function BucketBar({ buckets }) {
    if (!buckets) return null;
    const order = ['mul', 'add', 'copy', 'load', 'store'];
    const total = order.reduce((s, k) => s + buckets[k], 0);
    return (
      <div>
        <div className="bucket-bar">
          {order.map((k) => <div key={k} className="bucket-seg" style={{ width: (buckets[k] / total * 100) + '%', background: `var(${BUCKET_COLORS[k]})` }} title={k} />)}
        </div>
        <div className="bucket-legend">
          {order.map((k) => (
            <div key={k} className="bl-item">
              <span className="bl-dot" style={{ background: `var(${BUCKET_COLORS[k]})` }} />
              <span className="bl-k">{k}</span>
              <span className="bl-v">{fmt(buckets[k])}</span>
              <span className="bl-pct">{Math.round(buckets[k] / total * 100) + '%'}</span>
            </div>
          ))}
        </div>
      </div>
    );
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

  function InspectorPanel({ nodeId, T, speed, onClose, onSelect, branchSelection = [] }) {
    const node = E.nodes.find((n) => n.id === nodeId);
    const [controlText, setControlText] = useState('');
    const [injectMode, setInjectMode] = useState('branch');
    const [sourceId, setSourceId] = useState(branchSelection[0] || nodeId);
    const [targetId, setTargetId] = useState(branchSelection[1] || nodeId);
    const [controlStatus, setControlStatus] = useState('');
    useEffect(() => {
      const k = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    useEffect(() => {
      if (branchSelection[0]) setSourceId(branchSelection[0]);
      if (branchSelection[1]) setTargetId(branchSelection[1]);
    }, [branchSelection.join('|')]);
    if (!node) return null;

    const st = E.fns.statusAt(node, T);
    const stNow = st === 'unborn' ? 'queued' : st;
    const parent = node.parent ? E.nodes.find((n) => n.id === node.parent) : null;
    const delta = (node.score != null && parent && parent.score != null) ? node.score - parent.score : null;
    const lineage = useMemo(() => { const arr = []; let cur = node; while (cur) { arr.unshift(cur); cur = cur.parent ? E.nodes.find((n) => n.id === cur.parent) : null; } return arr; }, [nodeId]);
    const children = E.nodes.filter((n) => n.parent === node.id);
    const selectable = E.nodes
      .filter((n) => n.outcome === 'accept')
      .sort((a, b) => (a.score ?? 1e12) - (b.score ?? 1e12) || a.id.localeCompare(b.id));
    const postControl = async (path, payload) => {
      setControlStatus('sending...');
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));
        setControlStatus(data.hypothesisId ? 'queued ' + data.hypothesisId : 'updated');
        if (window.__AUTORESEARCH_APPLY_PAYLOAD) {
          const latest = await fetch('/api/data?ts=' + Date.now(), { cache: 'no-store' }).then((r) => r.json());
          if (latest && latest.payload) window.__AUTORESEARCH_APPLY_PAYLOAD(latest.payload);
        }
      } catch (err) {
        setControlStatus('error: ' + err.message);
      }
    };

    return (
      <React.Fragment>
        <div className="insp-bar">
          <button className="insp-back" onClick={onClose}>
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
              <path d="M10 4 L6 8 L10 12" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            team
          </button>
          <span className="insp-id">{node.id}</span>
          {statusPill(stNow)}
        </div>

        <div className="sb-scroll">
          {/* identity */}
          <div className="sb-section">
            <h3 className="insp-title">{node.title}</h3>
            <div className="insp-sub">
              <span className="insp-cand">{node.candidate}</span>
              <span className="insp-meta">{'gen ' + node.gen}</span>
              <span className="role-chip" style={{ '--role': roleCol(node.proposerRole) }}>
                <span className="glyph" />{ROLE_LABEL[node.proposerRole]}
              </span>
              <span className="insp-meta mono">{node.proposer}</span>
            </div>
          </div>

          {/* result */}
          <Section title="Result" defaultOpen={true}>
            {node.outcome === 'accept'
              ? <div>
                  <div className="insp-score-val" style={node.isFrontier ? { color: 'var(--accent)' } : null}>{fmt(node.score)}</div>
                  <div className="insp-score-row">
                    <span className="insp-meta">{E.meta.metric}</span>
                    {node.isFrontier ? <span className="frontier-tag">★ current frontier</span> : null}
                  </div>
                  <div className="prow"><span className="pk">Δ vs parent</span>
                    {delta != null ? <span className="pv" style={{ color: delta < 0 ? 'var(--ok)' : delta > 0 ? 'var(--bad)' : 'var(--ink-3)' }}>{(delta < 0 ? '▼ ' : delta > 0 ? '▲ ' : '') + fmt(Math.abs(delta))}</span> : <span className="pv">—</span>}
                  </div>
                  <div className="prow"><span className="pk">Semantic</span><span className="pv" style={{ color: 'var(--ok)' }}>{node.semantic}</span></div>
                </div>
              : node.outcome === 'reject'
                ? <div>
                    <div className="insp-score-val" style={{ color: 'var(--bad)' }}>rejected</div>
                    <div className="prow"><span className="pk">Semantic</span><span className="pv" style={{ color: node.semantic === 'invalid' ? 'var(--bad)' : 'var(--ink-1)' }}>{node.semantic}</span></div>
                  </div>
                : <div>
                    <div className="insp-score-val" style={{ color: 'var(--accent)', fontSize: 'var(--fs-lg)' }}>{stNow}</div>
                    <div className="insp-meta" style={{ marginTop: 6 }}>result not yet verified at this point in time</div>
                  </div>}
          </Section>

          <Section title="Branch controls" aside={node.halted ? 'halted' : branchSelection.length > 1 ? branchSelection.length + ' selected' : null} defaultOpen={true}>
            <div className="control-stack">
              <div className="control-row">
                <button className="btn" onClick={() => postControl('/api/control/halt', { nodeId: node.id, note: controlText })} disabled={node.halted}>Halt branch</button>
                <button className="btn" onClick={() => postControl('/api/control/unhalt', { nodeId: node.id })} disabled={!node.halted}>Resume</button>
              </div>
              <textarea className="control-text" value={controlText} onChange={(e) => setControlText(e.target.value)}
                placeholder="Inject information, transfer note, or branch halt reason" rows={4} />
              <div className="control-row">
                <select className="control-select" value={injectMode} onChange={(e) => setInjectMode(e.target.value)}>
                  <option value="branch">Parent under selected branch</option>
                  <option value="open">New open branch</option>
                </select>
                <button className="btn primary" onClick={() => postControl('/api/control/inject', {
                  nodeId: node.id,
                  mode: injectMode,
                  text: controlText,
                  priority: 80,
                })}>Inject</button>
              </div>
              <div className="control-pair">
                <label>source</label>
                <select className="control-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {selectable.map((n) => <option key={n.id} value={n.id}>{n.id + ' · ' + fmt(n.score)}</option>)}
                </select>
                <label>destination</label>
                <select className="control-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                  {selectable.map((n) => <option key={n.id} value={n.id}>{n.id + ' · ' + fmt(n.score)}</option>)}
                </select>
                <button className="btn primary" onClick={() => postControl('/api/control/transfer', {
                  sourceId,
                  targetId,
                  note: controlText,
                  priority: 90,
                })}>Gene transfer</button>
              </div>
              <div className="insp-meta">
                Shift-click two nodes in the tree to fill source and destination.
                {controlStatus ? <span className="mono">{' · ' + controlStatus}</span> : null}
              </div>
            </div>
          </Section>

          {/* cost buckets */}
          {node.buckets ? <Section title="Cost buckets" defaultOpen={true}>
            <BucketBar buckets={node.buckets} />
          </Section> : null}

          {/* lineage */}
          <Section title="Lineage" aside={'gen ' + node.gen} defaultOpen={true}>
            <div className="lineage" style={{ marginLeft: -8, marginRight: -8 }}>
              {lineage.map((a) => (
                <div key={a.id} className={'lin-step' + (a.id === node.id ? ' cur' : '')} onClick={() => onSelect(a.id)}>
                  <span className="lin-dot" style={{ background: a.score != null ? `var(--fit-${a.fit})` : 'var(--line-strong)' }} />
                  <span className="lin-id">{a.id}</span>
                  <span className="lin-score">{a.score != null ? fmt(a.score) : '—'}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* descendants */}
          {children.length ? <Section title="Descendants" aside={children.length} defaultOpen={false}>
            <div className="child-row">
              {children.map((ch) => (
                <button key={ch.id} className="child-chip" onClick={() => onSelect(ch.id)}>
                  <span className="lin-dot" style={{ background: ch.score != null ? `var(--fit-${ch.fit})` : 'var(--line-strong)' }} />
                  {ch.score != null ? fmt(ch.score) : ch.id}
                </button>
              ))}
            </div>
          </Section> : null}

          {/* timeline */}
          <Section title="Timeline" defaultOpen={false}>
            <div className="lifeline">
              {[['proposed', node.tProposed, node.proposer], ['claimed', node.tClaimed, node.impl], ['submitted', node.tSubmitted, node.impl], ['verified', node.tVerified, node.verifier]]
                .filter(([, tt]) => tt != null).map(([k, tt, who]) => (
                  <div key={k} className={'life-row' + (T >= tt ? ' done' : '')}>
                    <span className="life-k">{k}</span>
                    <span className="life-t">{mmss(tt)}</span>
                    <span className="life-who">{who || '—'}</span>
                  </div>
                ))}
            </div>
          </Section>

          {/* trace */}
          <Section title="Candidate IR & verification" defaultOpen={false}>
            <pre className="well ir" style={{ marginBottom: 10 }}>{genIR(node)}</pre>
            <div className="well ver-rec">
              <div>submission  <span style={{ color: 'var(--ink)' }}>{node.subId || '—'}</span></div>
              <div>verifier    <span style={{ color: 'var(--ink)' }}>{node.verifier || '—'}</span></div>
              <div>official    <span style={{ color: 'var(--ink)' }}>{fmt(node.score)}</span></div>
              <div>decision    <span style={{ color: node.outcome === 'accept' ? 'var(--ok)' : node.outcome === 'reject' ? 'var(--bad)' : 'var(--ink-3)' }}>{node.outcome || 'pending'}</span></div>
            </div>
          </Section>

          {/* run playback */}
          <Section title="Run playback" defaultOpen={true}>
            <window.RunPlayback node={node} speed={speed} />
          </Section>
        </div>
      </React.Fragment>
    );
  }

  window.InspectorPanel = InspectorPanel;
})();
