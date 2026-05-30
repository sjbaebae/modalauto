/* EvoFlow — named run registry for the Compare page.
   Each run is an independent world built from the shared generator
   (window.buildWorld) with different search parameters, so they tell
   genuinely different stories: how far they got, how fast, how messy. */
(function () {
  if (window.EVO_RUNS) return; // real-runs.js already populated runs from live journals
  const B = window.buildWorld;
  const RUNS = [
    {
      id: 'panel', label: 'Panel-first',
      desc: 'Rectangular panel families, then local trace optimization.',
      // Reuse the dashboard's default world only if it's the mock one; if a
      // (possibly empty) real payload set window.EVO, build a fresh mock world.
      world: (window.EVO && window.EVO.nodes && window.EVO.nodes.length)
        ? window.EVO
        : B(20260530, { label: 'Panel-first', tag: 'panel-first' }),
    },
    {
      id: 'lifetime', label: 'Lifetime-reuse',
      desc: 'Leads with dead-storage reuse; deeper, steadier descent.',
      world: B(88123, { label: 'Lifetime-reuse', tag: 'lifetime',
        floor: 70050, localLo: 0.90, localHi: 1.005, jumpRate: 0.20, rejectRate: 0.11, abandonRate: 0.06 }),
    },
    {
      id: 'tiled', label: 'Tiled plateau',
      desc: 'Block-tiled accumulation that stalls early — many dead ends.',
      world: B(4412, { label: 'Tiled plateau', tag: 'tiled',
        floor: 76800, creativeLo: 0.90, creativeHi: 1.16, localLo: 0.94, localHi: 1.02,
        searchLo: 0.86, searchHi: 1.28, jumpRate: 0.12, rejectRate: 0.24, abandonRate: 0.10 }),
    },
    {
      id: 'aggressive', label: 'Aggressive search',
      desc: 'Global searchers dominate — lowest energy, but volatile.',
      world: B(9931, { label: 'Aggressive search', tag: 'global',
        floor: 69600, creativeLo: 0.82, creativeHi: 1.20, localLo: 0.90, localHi: 1.01,
        searchLo: 0.78, searchHi: 1.32, jumpRate: 0.34, rejectRate: 0.20, abandonRate: 0.08 }),
    },
  ];
  window.EVO_RUNS = RUNS;
  window.EVO_RUN_BY_ID = {}; RUNS.forEach((r) => (window.EVO_RUN_BY_ID[r.id] = r));
})();
