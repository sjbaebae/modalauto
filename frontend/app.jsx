/* Autoresearch app — header + evotree + live agent rail + inspector + time scrubber. */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  let E = null;

  const ACCENTS = {
    blue:  { '--accent': 'oklch(0.55 0.10 245)', '--accent-deep': 'oklch(0.48 0.10 245)', '--accent-soft': 'oklch(0.55 0.10 245 / 0.10)', '--accent-glow': 'oklch(0.55 0.10 245 / 0.14)' },
    teal:  { '--accent': 'oklch(0.52 0.085 195)', '--accent-deep': 'oklch(0.45 0.085 195)', '--accent-soft': 'oklch(0.52 0.085 195 / 0.10)', '--accent-glow': 'oklch(0.52 0.085 195 / 0.14)' },
    plum:  { '--accent': 'oklch(0.52 0.09 310)', '--accent-deep': 'oklch(0.45 0.09 310)', '--accent-soft': 'oklch(0.52 0.09 310 / 0.10)', '--accent-glow': 'oklch(0.52 0.09 310 / 0.14)' },
  };

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "accent": "blue",
    "density": "regular",
    "speed": 1,
    "scoreLabels": true,
    "dimOffLineage": true,
    "showFeed": true
  }/*EDITMODE-END*/;

  const fmt = (n) => n == null ? '—' : n.toLocaleString();
  const mmss = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.round(t % 60)).padStart(2, '0');

  function Logo() {
    return React.createElement('div', { className: 'logo' },
      React.createElement('svg', { viewBox: '0 0 34 34', width: 26, height: 26, fill: 'none' },
        React.createElement('circle', { cx: 6, cy: 17, r: 3, fill: 'var(--fit-1)' }),
        React.createElement('circle', { cx: 17, cy: 8, r: 2.6, fill: 'var(--fit-3)' }),
        React.createElement('circle', { cx: 17, cy: 26, r: 2.6, fill: 'var(--fit-2)' }),
        React.createElement('circle', { cx: 28, cy: 6, r: 3.4, fill: 'var(--accent)' }),
        React.createElement('circle', { cx: 28, cy: 20, r: 2.4, fill: 'var(--fit-4)' }),
        React.createElement('circle', { cx: 28, cy: 28, r: 2.2, fill: 'var(--fit-3)' }),
        React.createElement('path', { d: 'M9 17 L14.6 9 M9 17 L14.6 25 M19.4 8 L25 6.5 M19.4 8 L26 19 M19.4 26 L26 27.5', stroke: 'var(--line-strong)', strokeWidth: 1.2 })),
      React.createElement('span', { className: 'logo-name' }, 'Autoresearch'));
  }

  function StatTiles({ T }) {
    const born = E.fns.bornCount(T);
    const best = E.fns.frontierAt(T);
    const act = E.fns.agentActivity(T);
    const liveAgents = E.agents.filter((a) => act[a.id] && act[a.id].alive).length;
    const working = E.agents.filter((a) => act[a.id] && act[a.id].alive && act[a.id].status === 'working').length;
    return React.createElement('div', { className: 'stat-row' },
      React.createElement('div', { className: 'stat' }, React.createElement('span', { className: 'k' }, 'Best energy'),
        React.createElement('span', { className: 'v', style: { color: 'var(--fit-6)' } }, fmt(best))),
      React.createElement('div', { className: 'stat' }, React.createElement('span', { className: 'k' }, 'Experiments'),
        React.createElement('span', { className: 'v' }, born)),
      React.createElement('div', { className: 'stat' }, React.createElement('span', { className: 'k' }, 'Live agents'),
        React.createElement('span', { className: 'v' }, liveAgents, React.createElement('span', { className: 'stat-frac mono' }, working + ' busy'))));
  }

  function ChangelogBadge() {
    const [info, setInfo] = useState(null);
    useEffect(() => {
      let stopped = false;
      async function load() {
        try {
          const res = await fetch('/api/changelog?ts=' + Date.now(), { cache: 'no-store' });
          if (!res.ok) return;
          const next = await res.json();
          if (!stopped) setInfo(next);
        } catch (_) {}
      }
      load();
      const id = setInterval(load, 3000);
      return () => { stopped = true; clearInterval(id); };
    }, []);
    if (!info || !info.frames) return null;
    const last = info.frames[info.frames.length - 1];
    const counts = last && last.counts ? last.counts : {};
    return React.createElement('div', { className: 'run-badge', title: info.changelog || info.journal || 'live database' },
      React.createElement('span', { className: 'live-tag' }, '● LIVE DB'),
      React.createElement('span', { className: 'mono' }, (counts.hypotheses || E.meta.totalNodes) + ' hyp'));
  }

  function Scrubber({ T, setT, playing, setPlaying, speed, setSpeed }) {
    const trackRef = useRef(null);
    const dragging = useRef(false);
    const empty = E.meta.totalNodes === 0;
    const live = T >= E.meta.tNow - 1;
    if (empty) {
      return React.createElement('div', { className: 'scrubber scrubber-empty' },
        React.createElement('button', { className: 'btn primary play-btn', disabled: true },
          '●', React.createElement('span', null, 'Live')),
        React.createElement('div', { className: 'scrub-track-wrap' },
          React.createElement('div', { className: 'scrub-time mono' },
            React.createElement('span', null, '00:00'),
            React.createElement('span', { className: 'live-tag' }, '● LIVE'),
            React.createElement('span', { className: 'mono scrub-born' }, '0 experiments')),
          React.createElement('div', { className: 'scrub-empty-track' }, 'waiting for first run')),
        React.createElement('button', { className: 'btn jump-btn', disabled: true }, 'Jump to now'));
    }

    const sparkPath = useMemo(() => {
      const s = E.series; const max = E.meta.baseline, min = E.meta.best;
      return s.map((p, i) => {
        const x = (p.t / E.meta.tMax) * 100;
        const denom = Math.max(1, max - min);
        const y = p.best == null || min == null ? 92 : 92 - ((p.best - min) / denom) * 84;
        return (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
      }).join(' ');
    }, []);
    const sparkFill = sparkPath + ` L 100 100 L 0 100 Z`;

    const setFromX = (clientX) => {
      const r = trackRef.current.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      setT(f * E.meta.tMax); setPlaying(false);
    };
    const down = (e) => { dragging.current = true; setFromX(e.clientX); };
    const move = (e) => { if (dragging.current) setFromX(e.clientX); };
    const up = () => { dragging.current = false; };
    useEffect(() => { window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; }, []);

    const pct = (T / E.meta.tMax) * 100;
    const bornNow = E.fns.bornCount(T);
    const playLabel = playing ? 'Pause' : live ? 'Live' : 'Replay';
    const playIcon = playing ? '❚❚' : live ? '●' : '▶';

    return React.createElement('div', { className: 'scrubber' },
      React.createElement('button', { className: 'btn primary play-btn', onClick: () => setPlaying((p) => !p) },
        playIcon, React.createElement('span', null, playLabel)),
      React.createElement('div', { className: 'scrub-track-wrap' },
        React.createElement('div', { className: 'scrub-time mono' },
          React.createElement('span', null, mmss(T)),
          live ? React.createElement('span', { className: 'live-tag' }, '● LIVE') : React.createElement('span', { className: 'mono scrub-of' }, 'of ' + mmss(E.meta.tMax)),
          React.createElement('span', { className: 'mono scrub-born' }, bornNow + ' experiments')),
        React.createElement('div', { className: 'scrub-track', ref: trackRef, onPointerDown: down },
          React.createElement('svg', { className: 'spark', viewBox: '0 0 100 100', preserveAspectRatio: 'none' },
            React.createElement('path', { d: sparkFill, fill: 'var(--accent-soft)' }),
            React.createElement('path', { d: sparkPath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.2, vectorEffect: 'non-scaling-stroke' })),
          React.createElement('div', { className: 'scrub-done', style: { width: pct + '%' } }),
          React.createElement('div', { className: 'scrub-head', style: { left: pct + '%' } }))),
      React.createElement('div', { className: 'scrub-right' },
        React.createElement('div', { className: 'speed-seg' },
          [1, 2, 4].map((s) => React.createElement('button', { key: s, className: 'speed-btn' + (speed === s ? ' on' : ''), onClick: () => setSpeed(s) }, s + '×'))),
        React.createElement('button', { className: 'btn jump-btn' + (live ? ' on' : ''), onClick: () => { setT(E.meta.tNow); setPlaying(false); } }, 'Jump to now')));
  }

  function App() {
    const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
    const [T, setT] = useState(E.meta.tNow);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(t.speed || 1);
    const [selected, setSelected] = useState(null);

    // theme + accent
    useEffect(() => { if (t.theme === 'dark') document.documentElement.dataset.theme = 'dark'; else document.documentElement.removeAttribute('data-theme'); }, [t.theme]);
    useEffect(() => { const a = ACCENTS[t.accent] || ACCENTS.blue; Object.entries(a).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)); }, [t.accent]);
    useEffect(() => { document.documentElement.dataset.density = t.density; }, [t.density]);
    useEffect(() => { setSpeed(t.speed || 1); }, [t.speed]);

    // playback loop
    useEffect(() => {
      if (!playing) return;
      const step = E.meta.tMax / 900;
      const iv = setInterval(() => {
        setT((cur) => { const nx = cur + step * speed; if (nx >= E.meta.tMax) { setPlaying(false); return E.meta.tMax; } return nx; });
      }, 33);
      return () => clearInterval(iv);
    }, [playing, speed]);

    const onSelect = useCallback((id) => setSelected(id), []);

    return React.createElement('div', { className: 'app' },
      React.createElement('header', { className: 'top' },
        React.createElement('div', { className: 'top-left' },
          React.createElement(Logo),
          React.createElement('nav', { className: 'nav-tabs' },
            React.createElement('a', { className: 'nav-tab active', href: 'index.html' }, 'Tree'),
            React.createElement('a', { className: 'nav-tab', href: 'Compare.html' }, 'Compare')),
          React.createElement('div', { className: 'prob' },
            React.createElement('span', { className: 'prob-name' }, E.meta.problem),
            React.createElement('span', { className: 'prob-sub mono' }, 'minimize ' + E.meta.metric + ' · baseline ' + fmt(E.meta.baseline))),
          React.createElement(ChangelogBadge)),
        React.createElement(StatTiles, { T })),

      React.createElement('div', { className: 'body' },
        React.createElement('main', { className: 'canvas' },
          React.createElement(window.EvoTree, { T, selected, onSelect, density: t.density, scoreLabels: t.scoreLabels, dimOffLineage: t.dimOffLineage })),
        React.createElement('aside', { className: 'sidebar' },
          selected
            ? React.createElement(window.InspectorPanel, { nodeId: selected, T, speed, onClose: () => setSelected(null), onSelect })
            : React.createElement('div', { className: 'sb-split' },
                React.createElement(window.TeamPanel, { T, onSelect }),
                React.createElement(window.HypothesesPanel, { T, onSelect }),
                t.showFeed ? React.createElement(window.ActivityPanel, { T, onSelect }) : null))),

      React.createElement('footer', { className: 'bottom' },
        React.createElement(Scrubber, { T, setT, playing, setPlaying, speed, setSpeed })),

      // Tweaks
      React.createElement(window.TweaksPanel, null,
        React.createElement(window.TweakSection, { label: 'Appearance' }),
        React.createElement(window.TweakRadio, { label: 'Theme', value: t.theme, options: ['light', 'dark'], onChange: (v) => setTweak('theme', v) }),
        React.createElement(window.TweakColor, { label: 'Accent', value: t.accent, options: ['blue', 'teal', 'plum'].map((k) => ACCENTS[k]['--accent']), onChange: (v) => {
          const key = Object.keys(ACCENTS).find((k) => ACCENTS[k]['--accent'] === v) || 'blue'; setTweak('accent', key); } }),
        React.createElement(window.TweakRadio, { label: 'Density', value: t.density, options: ['compact', 'regular', 'comfy'], onChange: (v) => setTweak('density', v) }),
        React.createElement(window.TweakSection, { label: 'Tree' }),
        React.createElement(window.TweakToggle, { label: 'Score labels', value: t.scoreLabels, onChange: (v) => setTweak('scoreLabels', v) }),
        React.createElement(window.TweakToggle, { label: 'Dim off-lineage', value: t.dimOffLineage, onChange: (v) => setTweak('dimOffLineage', v) }),
        React.createElement(window.TweakSection, { label: 'Playback' }),
        React.createElement(window.TweakRadio, { label: 'Default speed', value: String(t.speed), options: ['1', '2', '4'], onChange: (v) => setTweak('speed', +v) }),
        React.createElement(window.TweakToggle, { label: 'Show message feed', value: t.showFeed, onChange: (v) => setTweak('showFeed', v) })));
  }

  function boot() {
    E = window.APP;
    if (!E) {
      ReactDOM.createRoot(document.getElementById('root')).render(
        React.createElement('div', { className: 'app app-empty' },
          React.createElement('header', { className: 'top' },
            React.createElement('div', { className: 'top-left' },
              React.createElement(Logo),
              React.createElement('div', { className: 'prob' },
                React.createElement('span', { className: 'prob-name' }, 'No live autoresearch data'),
                React.createElement('span', { className: 'prob-sub mono' }, 'start the Autoresearch server with a journal DB'))))))
      return;
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
  }

  async function loadLiveData() {
    try {
      const base = window.FRONTEND_API_URL || 'http://127.0.0.1:5175';
      const res = await fetch(base.replace(/\/$/, '') + '/api/data?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.payload && window.appWorld) {
        window.APP = window.appWorld(data.payload);
      }
    } catch (_) {
      window.APP = null;
    }
  }

  loadLiveData().then(boot);
})();
