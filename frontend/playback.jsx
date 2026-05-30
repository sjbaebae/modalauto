/* RunPlayback — fast-forward animation of a candidate's matmul run.
   The 16x16 output grid fills as panels are computed; ops fire in sequence.
   Scrubbable + auto-play. Cells updated imperatively for smoothness. */
(function () {
  const { useState, useRef, useEffect, useMemo } = React;

  function rngFrom(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function buildOps(node) {
    const cand = node.candidate || '';
    // Accept both 3-number IR names (4x2x1) and real 2-number panel names (8x4).
    const m = cand.match(/(\d+)x(\d+)(?:x(\d+))?/);
    let pw = m ? Math.max(1, Math.min(8, +m[1])) : 2;
    let ph = m ? Math.max(1, Math.min(8, +m[2])) : 2;
    if (node.family === 'baseline') { pw = 4; ph = 4; }
    const lifetime = node.family === 'lifetime';
    const ops = [];
    const cellDoneOp = new Array(256).fill(999999);
    for (let r = 0; r < 16; r += pw) {
      for (let c = 0; c < 16; c += ph) {
        const cells = [];
        for (let rr = r; rr < Math.min(16, r + pw); rr++)
          for (let cc = c; cc < Math.min(16, c + ph); cc++) cells.push(rr * 16 + cc);
        ops.push({ type: 'load', label: `load A[${r}:${r + pw}] B[${c}:${c + ph}]`, cells });
        for (let k = 0; k < 4; k++) {
          ops.push({ type: 'mul', label: `mul k=${k} panel`, cells });
          ops.push({ type: 'add', label: `add → acc`, cells });
        }
        if (lifetime) ops.push({ type: 'reuse', label: 'reuse dead T', cells });
        const storeIdx = ops.length;
        ops.push({ type: 'store', label: `store C[${r}:${r + pw},${c}:${c + ph}]`, cells });
        cells.forEach((idx) => (cellDoneOp[idx] = storeIdx));
      }
    }
    return { ops, cellDoneOp, pw, ph };
  }

  function RunPlayback({ node, speed }) {
    const { ops, cellDoneOp } = useMemo(() => buildOps(node), [node.id]);
    const [head, setHead] = useState(0);
    const [playing, setPlaying] = useState(true);
    const cellRefs = useRef([]);
    const barRef = useRef(null);
    const traceRef = useRef(null);
    const fitCol = node.fit != null ? node.fit : 3;

    // imperative cell paint
    useEffect(() => {
      const cur = ops[head];
      const active = new Set(cur ? cur.cells : []);
      for (let i = 0; i < 256; i++) {
        const el = cellRefs.current[i]; if (!el) continue;
        if (active.has(i)) { el.style.background = 'var(--accent)'; el.style.opacity = '1'; }
        else if (cellDoneOp[i] <= head) { el.style.background = `var(--fit-${fitCol})`; el.style.opacity = '0.5'; }
        else { el.style.background = 'var(--surface-inset)'; el.style.opacity = '1'; }
      }
      if (barRef.current) barRef.current.style.width = ((head / (ops.length - 1)) * 100) + '%';
    }, [head, ops, cellDoneOp, fitCol]);

    // auto-advance
    useEffect(() => {
      if (!playing) return;
      const iv = setInterval(() => {
        setHead((h) => (h >= ops.length - 1 ? 0 : h + 1));
      }, Math.max(28, 90 / (speed || 1)));
      return () => clearInterval(iv);
    }, [playing, ops.length, speed]);

    const cur = ops[head];
    const traceWindow = [];
    for (let i = Math.max(0, head - 5); i <= Math.min(ops.length - 1, head + 2); i++) traceWindow.push({ i, op: ops[i] });

    if (node.outcome === 'reject') {
      return React.createElement('div', { className: 'run-empty' },
        React.createElement('div', { className: 'run-empty-icon' }, '✕'),
        React.createElement('div', null, 'No valid run — candidate was rejected'),
        React.createElement('div', { className: 'mono run-empty-sub' }, 'semantic: ' + node.semantic));
    }

    return React.createElement('div', { className: 'run' },
      React.createElement('div', { className: 'run-grid', ref: (el) => {
        if (el && el.childElementCount === 0) {
          for (let i = 0; i < 256; i++) { const d = document.createElement('div'); d.className = 'rc'; el.appendChild(d); cellRefs.current[i] = d; }
        }
      } }),
      React.createElement('div', { className: 'run-controls' },
        React.createElement('button', { className: 'btn icon', onClick: () => setPlaying((p) => !p) }, playing ? '❚❚' : '▶'),
        React.createElement('div', { className: 'run-bar', onClick: (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHead(Math.round(((e.clientX - r.left) / r.width) * (ops.length - 1)));
          setPlaying(false);
        } },
          React.createElement('div', { className: 'run-bar-fill', ref: barRef })),
        React.createElement('span', { className: 'run-count' }, head + '/' + (ops.length - 1))),
      React.createElement('div', { className: 'eyebrow', style: { marginTop: 4 } }, 'op trace · ' + Math.round((head / (ops.length - 1)) * 100) + '% filled'),
      React.createElement('div', { className: 'run-trace', ref: traceRef },
        traceWindow.map(({ i, op }) => React.createElement('div', {
          key: i, className: 'trace-line' + (i === head ? ' on' : ''),
          style: { opacity: i === head ? 1 : 0.4 } },
          React.createElement('span', { className: 'trace-k' }, 'op' + String(i).padStart(3, '0')),
          React.createElement('span', { className: 'trace-t t-' + op.type }, op.type),
          React.createElement('span', { className: 'trace-lbl' }, op.label)))));
  }

  window.RunPlayback = RunPlayback;
})();
