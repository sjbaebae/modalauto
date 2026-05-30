/* Sidebar content — Figma-style properties panel.
   Team (collapsible role groups) + Activity feed. Exports a shared
   collapsible Section + Chevron + role helpers used by the inspector too. */
(function () {
  const { useState, useMemo, useRef, useEffect } = React;
  const E = window.APP;

  const ROLE_ORDER = ['topline_manager', 'meta_agent', 'insight_generator', 'creative_explorer', 'global_searcher', 'implementor', 'verifier', 'researcher'];
  const ROLE_LABEL = { topline_manager: 'manager', meta_agent: 'meta', insight_generator: 'insight', creative_explorer: 'explorer', global_searcher: 'searcher', implementor: 'implementor', verifier: 'verifier', researcher: 'researcher' };
  const ROLE_VAR = { topline_manager: '--role-manager', meta_agent: '--role-meta', insight_generator: '--role-insight', creative_explorer: '--role-explorer', global_searcher: '--role-searcher', implementor: '--role-implementor', verifier: '--role-verifier', researcher: '--role-researcher' };
  const roleCol = (r) => `var(${ROLE_VAR[r]})`;

  function Chevron({ className }) {
    return React.createElement('svg', { className: 'sb-chev ' + (className || ''), viewBox: '0 0 16 16', fill: 'none' },
      React.createElement('path', { d: 'M5 6 L8 9.5 L11 6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
  }

  // collapsible section
  function Section({ title, aside, defaultOpen = true, children, flush }) {
    const [open, setOpen] = useState(defaultOpen);
    return React.createElement('div', { className: 'sb-section' },
      React.createElement('div', { className: 'sb-head' + (open ? '' : ' collapsed'), onClick: () => setOpen((o) => !o) },
        React.createElement(Chevron),
        React.createElement('h3', null, title),
        aside != null ? React.createElement('span', { className: 'sb-aside' }, aside) : null),
      open ? React.createElement('div', { className: 'sb-body', style: flush ? { marginLeft: -8, marginRight: -8 } : null }, children) : null);
  }

  function RolePill({ role }) {
    return React.createElement('span', { className: 'role-chip', style: { '--role': roleCol(role) } },
      React.createElement('span', { className: 'glyph' }), ROLE_LABEL[role]);
  }

  // --- Team section ---
  function RoleGroup({ role, agents, act, onSelect }) {
    const [open, setOpen] = useState(true);
    const working = agents.filter((a) => act[a.id].status === 'working').length;
    return React.createElement('div', { className: 'fp-grp' + (open ? '' : ' collapsed') },
      React.createElement('div', { className: 'fp-grp-head', onClick: () => setOpen((o) => !o) },
        React.createElement(Chevron),
        React.createElement('span', { className: 'fp-grp-name', style: { color: roleCol(role) } }, ROLE_LABEL[role]),
        React.createElement('span', { className: 'fp-grp-count' }, working ? working + '/' + agents.length : agents.length)),
      open ? agents.map((a) => React.createElement(AgentRow, { key: a.id, a, act: act[a.id], onSelect })) : null);
  }

  function AgentRow({ a, act, onSelect }) {
    const working = act.status === 'working';
    return React.createElement('div', { className: 'agent-row' + (working ? ' is-working' : '') },
      React.createElement('span', { className: 'ar-dot' + (working ? ' pulsing' : ''), style: { background: working ? roleCol(a.role) : 'var(--idle)' } }),
      React.createElement('span', { className: 'ar-name' }, a.id),
      working
        ? React.createElement('span', { className: 'ar-act busy', onClick: act.item ? () => onSelect(act.item) : null, title: act.kind }, act.kind)
        : React.createElement('span', { className: 'ar-act idle' }, 'idle'));
  }

  function TeamPanel({ T, onSelect }) {
    const [open, setOpen] = useState(true);
    const act = useMemo(() => E.fns.agentActivity(T), [T]);
    const live = E.agents.filter((a) => act[a.id] && act[a.id].alive);
    const working = live.filter((a) => act[a.id].status === 'working').length;
    const grouped = {}; ROLE_ORDER.forEach((r) => (grouped[r] = []));
    live.forEach((a) => grouped[a.role] && grouped[a.role].push(a));

    return React.createElement('div', { className: 'sb-pane sb-pane-team' + (open ? '' : ' collapsed') },
      React.createElement('div', { className: 'pane-head', onClick: () => setOpen((o) => !o) },
        React.createElement(Chevron),
        React.createElement('h3', null, 'Live team'),
        React.createElement('span', { className: 'pane-aside' },
          live.length + ' agents', working ? React.createElement('span', { className: 'pane-working' }, ' · ' + working + ' working') : ' · idle')),
      open ? React.createElement('div', { className: 'pane-scroll' },
        ROLE_ORDER.map((r) => grouped[r].length
          ? React.createElement(RoleGroup, { key: r, role: r, agents: grouped[r], act, onSelect }) : null)) : null);
  }

  function HypothesesPanel({ T, onSelect }) {
    const [open, setOpen] = useState(true);
    const items = useMemo(() => {
      return (E.hypotheses || [])
        .filter((h) => h.createdAt <= T)
        .sort((a, b) => {
          if (a.inTree !== b.inTree) return a.inTree ? 1 : -1;
          if (a.hasSubmission !== b.hasSubmission) return a.hasSubmission ? 1 : -1;
          return b.createdAt - a.createdAt;
        })
        .slice(0, 120);
    }, [T]);
    const active = items.filter((h) => !h.inTree).length;
    return React.createElement('div', { className: 'sb-pane sb-pane-hypotheses' + (open ? '' : ' collapsed') },
      React.createElement('div', { className: 'pane-head', onClick: () => setOpen((o) => !o) },
        React.createElement(Chevron),
        React.createElement('h3', null, 'Hypotheses'),
        React.createElement('span', { className: 'pane-aside' }, active + ' active · ' + items.length + ' total')),
      open ? React.createElement('div', { className: 'pane-scroll hyp-list' },
        items.length
          ? items.map((h) => React.createElement(HypothesisRow, { key: h.id, h, onSelect }))
          : React.createElement('div', { className: 'empty-pane' }, 'No hypotheses yet')) : null);
  }

  function HypothesisRow({ h, onSelect }) {
    const col = h.proposerRole ? roleCol(h.proposerRole) : 'var(--ink-3)';
    const clickable = h.inTree && h.hasSubmission;
    const label = h.inTree ? 'tree' : h.hasSubmission ? 'context' : h.status;
    return React.createElement('div', {
      className: 'hyp-row' + (clickable ? ' clickable' : ''),
      onClick: clickable ? () => onSelect(h.id) : null,
    },
      React.createElement('span', { className: 'hyp-dot', style: { background: h.inTree ? col : 'transparent', borderColor: col } }),
      React.createElement('div', { className: 'hyp-main' },
        React.createElement('div', { className: 'hyp-title' }, h.title),
        React.createElement('div', { className: 'hyp-meta' },
          React.createElement('span', { style: { color: col } }, ROLE_LABEL[h.proposerRole] || h.proposerRole || 'unknown'),
          React.createElement('span', null, ' · ' + mmss(h.createdAt)),
          h.parent ? React.createElement('span', null, ' · parent ' + h.parent.slice(4, 10)) : null)),
      React.createElement('span', { className: 'hyp-state' + (h.inTree ? ' in-tree' : '') }, label));
  }

  // --- Activity feed ---
  function ActivityPanel({ T, onSelect }) {
    const [open, setOpen] = useState(true);
    const feed = useMemo(() => E.events.filter((e) => e.t <= T).slice(-100).reverse(), [T]);
    return React.createElement('div', { className: 'sb-pane sb-pane-activity' + (open ? '' : ' collapsed') },
      React.createElement('div', { className: 'pane-head', onClick: () => setOpen((o) => !o) },
        React.createElement(Chevron),
        React.createElement('h3', null, 'Activity'),
        React.createElement('span', { className: 'pane-aside' }, 'message board · ' + feed.length)),
      open ? React.createElement('div', { className: 'pane-scroll' },
        feed.map((e, i) => React.createElement(ActRow, { key: e.t + '-' + i + '-' + (e.nodeId || e.kind), e, onSelect }))) : null);
  }

  function ActRow({ e, onSelect }) {
    const col = e.role ? roleCol(e.role) : 'var(--ink-3)';
    let body;
    if (e.kind === 'verified') body = React.createElement('span', null, React.createElement('b', null, e.decision === 'accept' ? 'accepted' : 'rejected'), ' ', e.score != null ? React.createElement('span', { className: 'mono' }, e.score.toLocaleString()) : 'invalid');
    else if (e.kind === 'submitted') body = React.createElement('span', null, React.createElement('b', null, 'submitted'), e.score != null ? React.createElement('span', { className: 'mono', style: { marginLeft: 5 } }, '~' + e.score.toLocaleString()) : null);
    else if (e.kind === 'spawn') body = React.createElement('span', null, e.text);
    else if (e.kind === 'research') body = React.createElement('span', null, React.createElement('b', null, 'indexed'), ' ', e.text);
    else if (e.kind === 'scale') body = React.createElement('span', null, 'applied scale plan');
    else if (e.kind === 'proposed') body = React.createElement('span', null, React.createElement('b', null, 'proposed'), React.createElement('span', { style: { color: 'var(--ink-2)' } }, ' — ' + e.text));
    else if (e.kind === 'claimed') body = React.createElement('span', null, React.createElement('b', null, 'claimed'));
    else body = React.createElement('span', null, e.kind);
    return React.createElement('div', { className: 'act-row' + (e.nodeId ? ' clickable' : ''), onClick: e.nodeId ? () => onSelect(e.nodeId) : null },
      React.createElement('span', { className: 'act-dot', style: { background: col } }),
      React.createElement('div', { className: 'act-body' },
        React.createElement('div', { className: 'act-line' }, React.createElement('span', { className: 'act-agent', style: { color: col } }, e.agent), ' ', body),
        React.createElement('div', { className: 'act-meta' }, mmss(e.t), e.nodeId ? ' · ' + e.nodeId : '')));
  }

  function mmss(t) { return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.round(t % 60)).padStart(2, '0'); }

  Object.assign(window, { TeamPanel, HypothesesPanel, ActivityPanel, SBSection: Section, SBChevron: Chevron, SBRolePill: RolePill,
    EVO_ROLE_LABEL: ROLE_LABEL, EVO_ROLE_VAR: ROLE_VAR, evoRoleCol: roleCol, evoMMSS: mmss });
})();
