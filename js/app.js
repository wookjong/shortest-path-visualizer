'use strict';
/* 화면(UI) / 그리기 / 편집 / 애니메이션 제어 */

const CW = 620, CH = 420;          // 메인 캔버스 논리 크기
const HW = 460, HH = 380;          // 힙 캔버스 논리 크기
const EXAMPLE_SEED = 6, EXAMPLE_N = 14;
const NODE_R = 16;
const C = {
  wall: '#1f2937', gridLine: '#e5e7eb', cellBg: '#ffffff',
  open: '#bbf7d0', closed: '#dbeafe', pathCell: '#c7d2fe',
  openNode: '#86efac', closedNode: '#93c5fd',
  start: '#059669', goal: '#dc2626', current: '#7c3aed', relax: '#f59e0b',
  edge: '#cbd5e1', tree: '#93c5fd', path: '#4338ca', text: '#111827', arrow: '#475569',
  accent: '#4338ca', accentSoft: '#eef2ff', muted: '#9ca3af',
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const app = {
  env: 'graph',
  algo: 'dijkstra',
  grid: null, gridSeed: 1, cell: 0, offX: 0, offY: 0,
  graph: null, graphSeed: EXAMPLE_SEED,
  weightMode: 'random',
  tool: 'move', gtool: 'wall',
  opts: { diagonal: false, heuristic: 'manhattan', showValues: true, showParents: true, showWeights: true },
  gran: 'op',
  playing: false,
  stepsPerSec: 3, acc: 0, lastT: 0,
  runners: {},       // dijkstra / astar → {gen, state}
  P: null,
  valid: false,
  edgePick: null,    // + EDGE 모드에서 첫 번째로 고른 노드
  labelRects: [],    // 간선 가중치 라벨 위치 (클릭 편집용)
  logShown: 0, logAlgo: null,
};

/* ---------------- 맵 준비 ---------------- */
function setGridSize(cols, rows) {
  app.grid = new GridMap(rows, cols);
  app.grid.presetDefault();
  app.cell = Math.min(CW / cols, CH / rows);
  app.offX = (CW - cols * app.cell) / 2;
  app.offY = (CH - rows * app.cell) / 2;
}
setGridSize(13, 9);
app.graph = GraphMap.random(EXAMPLE_SEED, EXAMPLE_N, CW, CH, 'random');

function setupCanvas(cv, w, h, dprMin = 2) {
  const dpr = Math.max(dprMin, window.devicePixelRatio || 1);
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
const ctxMain = setupCanvas($('#cv-main'), CW, CH);
const ctxHeap = setupCanvas($('#cv-heap'), HW, HH);
const thumbs = $$('.cmp').map((el) => ({ algo: el.dataset.algo, el, ctx: setupCanvas(el.querySelector('canvas'), CW, CH, 1), stats: el.querySelector('.cmp-stats') }));

function env() { return app.env === 'grid' ? app.grid : app.graph; }
function problem() {
  return app.env === 'grid' ? gridProblem(app.grid, app.opts.diagonal) : graphProblem(app.graph);
}
function cur() { return app.runners[app.algo].state; }

/* 시작/도착이 없을 때 쓰는 빈 상태 */
function emptyState() {
  return {
    name: '', pq: new MinHeap(() => false), g: new Map(), h: null, prev: new Map(),
    open: new Set(), closed: new Set(), current: null, batch: new Map(),
    op: { type: 'ready', line: [], title: 'READY',
      lines: () => [tr('시작(START) 노드와 도착(GOAL) 노드를 지정하세요.', 'Choose a START node and a GOAL node.')] },
    path: null, cost: null, steps: 0, micro: 0, maxPQ: 0, done: false, found: false, log: [],
  };
}

/* ---------------- 탐색 제어 ---------------- */
function resetSearch() {
  app.playing = false;
  const E = env();
  app.valid = E.start !== null && E.goal !== null && E.start !== E.goal;
  if (!app.valid) {
    app.runners = { dijkstra: { state: emptyState() }, astar: { state: emptyState() } };
    app.P = app.env === 'graph' ? graphProblem(app.graph) : null;
  } else {
    const P = problem();
    app.P = P;
    const h = app.env === 'grid' ? P.heuristics[app.opts.heuristic] : P.heuristics.euclidean;
    for (const algo of ['dijkstra', 'astar']) {
      const gen = algo === 'dijkstra' ? dijkstra(P, E.start, E.goal) : astar(P, E.start, E.goal, h);
      app.runners[algo] = { gen, state: gen.next().value };
    }
  }
  app.logShown = 0;
  $('#log').innerHTML = '';
  render();
}

const STOP_AT_NODE = new Set(['expanded', 'found', 'nopath']);
function stepRunner(r) {
  if (!r.gen || r.state.done) return;
  let guard = 0;
  do {
    r.state = r.gen.next().value || r.state;
  } while (app.gran === 'node' && !r.state.done && !STOP_AT_NODE.has(r.state.op.type) && guard++ < 100000);
}
function stepAll() {
  if (!app.valid) return;
  stepRunner(app.runners.dijkstra);
  stepRunner(app.runners.astar);
  if (allDone()) app.playing = false;
}
function allDone() { return app.valid && app.runners.dijkstra.state.done && app.runners.astar.state.done; }
function started() { return app.valid && cur().micro > 0; }

function finishAll() {
  if (!app.valid) return;
  app.playing = false;
  const g = app.gran;
  app.gran = 'node';
  let guard = 0;
  while (!allDone() && guard++ < 200000) stepAll();
  app.gran = g;
  render();
}
function run() {               // RUN: 처음부터 다시 시작해서 재생
  if (!app.valid) return;
  resetSearch();
  app.playing = true;
  app.acc = 1;
  app.lastT = performance.now();
  render();
}
function pause() { app.playing = false; render(); }
function resume() {
  if (!app.valid || allDone()) return;
  app.playing = true;
  app.acc = 1;
  app.lastT = performance.now();
  render();
}
function togglePlay() {
  if (app.playing) pause();
  else if (!started() || allDone()) run();
  else resume();
}

function loop(t) {
  if (app.playing) {
    app.acc += ((t - app.lastT) / 1000) * app.stepsPerSec;
    let n = Math.min(Math.floor(app.acc), 500);
    app.acc -= Math.floor(app.acc);
    if (n > 0) {
      while (n-- > 0 && app.playing) stepAll();
      render();
    }
  }
  app.lastT = t;
  requestAnimationFrame(loop);
}

/* ---------------- 공통 그리기 도구 ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function arrow(ctx, x1, y1, x2, y2, head) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
  ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
  ctx.closePath(); ctx.fill();
}
function dotBg(ctx) {
  ctx.fillStyle = '#fbfaff';
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = '#dcd9ec';
  for (let x = 9; x < CW; x += 18) for (let y = 9; y < CH; y += 18) ctx.fillRect(x, y, 1.2, 1.2);
}

/* ---------------- 격자 그리기 ---------------- */
function drawGrid(ctx, S, mini) {
  const G = app.grid;
  const cs = app.cell, ox = app.offX, oy = app.offY;
  const X = (c) => ox + c * cs, Y = (r) => oy + r * cs;
  const showVals = !mini && app.opts.showValues && cs >= 36;

  dotBg(ctx);
  ctx.fillStyle = C.cellBg;
  ctx.fillRect(ox, oy, G.cols * cs, G.rows * cs);
  const pathSet = S.path ? new Set(S.path) : null;
  for (let id = 0; id < G.rows * G.cols; id++) {
    const [r, c] = G.rc(id);
    let col = null;
    if (G.walls[id]) col = C.wall;
    else if (pathSet && pathSet.has(id)) col = C.pathCell;
    else if (S.closed.has(id)) col = C.closed;
    else if (S.open.has(id)) col = C.open;
    if (col) { ctx.fillStyle = col; ctx.fillRect(X(c), Y(r), cs, cs); }
  }
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= G.cols; c++) { ctx.moveTo(X(c), oy); ctx.lineTo(X(c), oy + G.rows * cs); }
  for (let r = 0; r <= G.rows; r++) { ctx.moveTo(ox, Y(r)); ctx.lineTo(ox + G.cols * cs, Y(r)); }
  ctx.stroke();

  const center = (id) => { const [r, c] = G.rc(id); return [X(c) + cs / 2, Y(r) + cs / 2]; };
  for (const [id, col] of [[G.start, C.start], [G.goal, C.goal]]) {
    const [r, c] = G.rc(id);
    ctx.fillStyle = col;
    roundRect(ctx, X(c) + 1.5, Y(r) + 1.5, cs - 3, cs - 3, 5);
    ctx.fill();
  }

  if (S.path) {
    ctx.strokeStyle = C.path;
    ctx.lineWidth = Math.max(3, cs * 0.14);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    S.path.forEach((id, i) => { const [x, y] = center(id); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }

  if (!mini && app.opts.showParents) {
    ctx.strokeStyle = ctx.fillStyle = C.arrow;
    ctx.lineWidth = Math.max(1.2, cs * 0.04);
    const a0 = showVals ? 0.30 : 0.05, a1 = 0.48;
    for (const [v, u] of S.prev) {
      if (pathSet && pathSet.has(v) && pathSet.has(u)) continue;
      const [vx, vy] = center(v), [ux, uy] = center(u);
      const dx = ux - vx, dy = uy - vy, len = Math.hypot(dx, dy);
      arrow(ctx, vx + (dx / len) * cs * a0, vy + (dy / len) * cs * a0,
        vx + (dx / len) * cs * a1, vy + (dy / len) * cs * a1, Math.max(3, cs * 0.12));
    }
  }

  if (showVals) {
    ctx.textBaseline = 'middle';
    for (const [id, g] of S.g) {
      const [r, c] = G.rc(id);
      const light = id === G.start || id === G.goal;
      ctx.fillStyle = light ? '#fff' : C.text;
      if (S.h) {
        const h = S.h.get(id);
        ctx.font = `bold ${Math.round(cs * 0.34)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(g + h), X(c) + cs / 2, Y(r) + cs * 0.62);
        ctx.font = `${Math.round(cs * 0.22)}px sans-serif`;
        ctx.fillStyle = light ? '#fff' : '#1d4ed8';
        ctx.textAlign = 'left';
        ctx.fillText(fmt(g), X(c) + 3, Y(r) + cs * 0.2);
        ctx.fillStyle = light ? '#fff' : '#b45309';
        ctx.textAlign = 'right';
        ctx.fillText(fmt(h), X(c) + cs - 3, Y(r) + cs * 0.2);
      } else {
        ctx.font = `bold ${Math.round(cs * 0.36)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(fmt(g), X(c) + cs / 2, Y(r) + cs / 2 + 1);
      }
    }
  }

  // 이번 확장에서 갱신된 이웃 / 지금 검사 중인 이웃 / 현재 u
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = C.relax;
  for (const id of S.batch.keys()) {
    const [r, c] = G.rc(id);
    ctx.strokeRect(X(c) + 2.5, Y(r) + 2.5, cs - 5, cs - 5);
  }
  ctx.setLineDash([]);
  const op = S.op || {};
  if (op.nbr !== undefined && !S.done) {
    const [r, c] = G.rc(op.nbr);
    ctx.strokeStyle = C.relax; ctx.lineWidth = 4;
    ctx.strokeRect(X(c) + 2, Y(r) + 2, cs - 4, cs - 4);
    const [ux, uy] = center(op.node), [vx, vy] = center(op.nbr);
    ctx.fillStyle = C.relax; ctx.lineWidth = 3;
    arrow(ctx, ux, uy, vx - (vx - ux) * 0.3, vy - (vy - uy) * 0.3, 8);
  }
  if (S.current !== null && !S.found) {
    const [r, c] = G.rc(S.current);
    ctx.strokeStyle = C.current; ctx.lineWidth = 3.5;
    ctx.strokeRect(X(c) + 2, Y(r) + 2, cs - 4, cs - 4);
  }

  for (const [id, txt] of [[G.start, 'S'], [G.goal, 'G']]) {
    const [r, c] = G.rc(id);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    if (showVals && S.g.has(id)) {
      ctx.font = `bold ${Math.round(cs * 0.22)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(txt, X(c) + cs - 4, Y(r) + cs * 0.85);
    } else {
      ctx.font = `bold ${Math.round(Math.min(cs * 0.55, 22))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(txt, X(c) + cs / 2, Y(r) + cs / 2 + 1);
    }
  }
}

/* ---------------- 그래프 그리기 ---------------- */
function drawGraph(ctx, S, mini) {
  const M = app.graph, N = M.nodes;
  dotBg(ctx);
  if (!mini) app.labelRects = [];
  if (!N.length) {
    ctx.fillStyle = C.muted; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(tr('+ NODE 모드에서 캔버스를 클릭해 노드를 만드세요 (또는 RANDOM GRAPH)', 'Click the canvas in + NODE mode to create vertices (or RANDOM GRAPH)'), CW / 2, CH / 2);
    return;
  }
  const pathEdges = new Set();
  if (S.path) for (let i = 1; i < S.path.length; i++) {
    pathEdges.add(S.path[i - 1] + '-' + S.path[i]);
    pathEdges.add(S.path[i] + '-' + S.path[i - 1]);
  }
  const isTree = (a, b) => S.prev.get(b) === a || S.prev.get(a) === b;
  const op = S.op || {};
  const relaxKey = op.nbr !== undefined && !S.done ? op.node + '-' + op.nbr : null;

  ctx.lineCap = 'round';
  for (const e of M.edges) {
    const A = N[e.a], B = N[e.b];
    const k1 = e.a + '-' + e.b, k2 = e.b + '-' + e.a;
    if (pathEdges.has(k1)) { ctx.strokeStyle = C.path; ctx.lineWidth = 6; }
    else if (relaxKey === k1 || relaxKey === k2) { ctx.strokeStyle = C.relax; ctx.lineWidth = 6; }
    else if (isTree(e.a, e.b)) { ctx.strokeStyle = C.tree; ctx.lineWidth = 3.5; }
    else { ctx.strokeStyle = C.edge; ctx.lineWidth = 1.6; }
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  if (!mini && app.opts.showParents) {
    for (const [v, u] of S.prev) {
      const A = N[v], B = N[u];
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      const t = (d - NODE_R - 3) / d;
      ctx.fillStyle = ctx.strokeStyle = pathEdges.has(v + '-' + u) ? '#312e81' : '#2563eb';
      ctx.lineWidth = 1;
      arrow(ctx, A.x + (B.x - A.x) * (t - 12 / d), A.y + (B.y - A.y) * (t - 12 / d),
        A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, 11);
    }
  }
  if (app.env === 'graph' && app.tool === 'edge' && app.edgePick !== null && !mini) {
    const A = N[app.edgePick];
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(A.x, A.y, NODE_R + 7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (app.opts.showWeights && !mini) {
    ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    M.edges.forEach((e, k) => {
      const x = (N[e.a].x + N[e.b].x) / 2, y = (N[e.b].y + N[e.a].y) / 2;
      const t = fmt(e.w), w = ctx.measureText(t).width + 10;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.2;
      roundRect(ctx, x - w / 2, y - 9, w, 18, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.fillText(t, x, y + 0.5);
      app.labelRects.push({ k, x: x - w / 2, y: y - 9, w, h: 18 });
    });
  }
  const pathSet = S.path ? new Set(S.path) : null;
  N.forEach((n, i) => {
    let fill = '#fff', ring = '#374151', txt = C.text;
    if (pathSet && pathSet.has(i)) { fill = C.accentSoft; ring = C.path; }
    else if (S.closed.has(i)) fill = C.closedNode;
    else if (S.open.has(i)) fill = C.openNode;
    if (i === M.start) { fill = C.start; ring = C.start; txt = '#fff'; }
    if (i === M.goal) { fill = C.goal; ring = C.goal; txt = '#fff'; }

    if (i === S.current && !S.found) {
      ctx.strokeStyle = C.current; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 5, 0, Math.PI * 2); ctx.stroke();
    } else if (S.batch.has(i) || i === op.nbr) {
      ctx.strokeStyle = C.relax; ctx.lineWidth = 3;
      if (i !== op.nbr) ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = fill; ctx.strokeStyle = ring; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = txt;
    ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, n.x, n.y + 0.5);
    if (!mini && (i === M.start || i === M.goal)) {
      ctx.fillStyle = i === M.start ? C.start : C.goal;
      ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
      ctx.fillText(i === M.start ? 'START' : 'GOAL', n.x, n.y + NODE_R + 9);
    }
  });
  if (!mini && app.opts.showValues) {
    ctx.font = 'bold 11.5px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    N.forEach((n, i) => {
      let t;
      if (S.g.has(i)) {
        const g = S.g.get(i);
        t = S.h ? `${fmt(g)}+${fmt(S.h.get(i))}=${fmt(g + S.h.get(i))}` : fmt(g);
      } else t = app.valid && started() ? '∞' : '';
      if (!t) return;
      const w = ctx.measureText(t).width + 8;
      ctx.fillStyle = !S.g.has(i) ? '#9ca3af' : S.closed.has(i) ? '#1e3a8a' : '#166534';
      roundRect(ctx, n.x - w / 2, n.y - NODE_R - 21, w, 16, 4); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(t, n.x, n.y - NODE_R - 13);
    });
  }
}

function drawMap(ctx, S, mini) { app.env === 'grid' ? drawGrid(ctx, S, mini) : drawGraph(ctx, S, mini); }

/* ---------------- 힙 트리 그리기 ---------------- */
function isStale(S, it) { return S.closed.has(it.node) || it.g > S.g.get(it.node) + 1e-9; }

function drawHeap(ctx, S) {
  ctx.clearRect(0, 0, HW, HH);
  const a = S.pq.a;
  const L = app.P ? app.P.label : String;
  const isA = !!S.h;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!a.length) {
    ctx.fillStyle = C.muted; ctx.font = '13px ui-monospace, Consolas, monospace';
    ctx.fillText(S.micro === 0 ? tr('RUN / STEP 을 누르면 큐가 초기화됩니다', 'Run or step to initialize the queue.') : 'queue empty', HW / 2, HH / 2);
    $('#heap-foot').textContent = '';
    return;
  }
  const MAXD = 4;
  const depthOf = (i) => Math.floor(Math.log2(i + 1));
  const shown = Math.min(a.length, 2 ** MAXD - 1);
  const top = 34, gap = 82;
  const pos = (i) => {
    const d = depthOf(i), k = i - (2 ** d - 1);
    return [HW * (k + 0.5) / 2 ** d, top + d * gap];
  };
  // 간선
  ctx.strokeStyle = '#c7c9d9'; ctx.lineWidth = 1.4;
  for (let i = 1; i < shown; i++) {
    const [x, y] = pos(i), [px, py] = pos((i - 1) >> 1);
    ctx.beginPath(); ctx.moveTo(px, py + 18); ctx.lineTo(x, y - 18); ctx.stroke();
  }
  const pushed = S.op ? S.op.pushed : undefined;
  for (let i = 0; i < shown; i++) {
    const it = a[i], d = depthOf(i);
    const [x, y] = pos(i);
    const bw = Math.min(88, HW / 2 ** d - 8), bh = 36;
    const stale = isStale(S, it);
    const isNew = it.seq === pushed;
    ctx.fillStyle = isNew ? '#fef3c7' : i === 0 ? C.accentSoft : '#fff';
    ctx.strokeStyle = isNew ? C.relax : stale ? '#d1d5db' : i === 0 ? C.accent : '#64748b';
    ctx.lineWidth = i === 0 || isNew ? 2.2 : 1.3;
    if (stale) ctx.setLineDash([4, 3]);
    roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 6); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    const small = bw < 60;
    ctx.fillStyle = stale ? '#9ca3af' : C.text;
    ctx.font = `bold ${small ? 10 : 12}px ui-monospace, Consolas, monospace`;
    ctx.fillText(L(it.node), x, y - 7);
    ctx.font = `${small ? 9.5 : 11}px ui-monospace, Consolas, monospace`;
    ctx.fillStyle = stale ? '#9ca3af' : isA ? '#b45309' : '#1d4ed8';
    ctx.fillText(isA ? (small ? fmt(it.f) : `f=${fmt(it.f)}`) : fmt(it.g), x, y + 8);
    if (stale) {
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - bw / 2 + 4, y); ctx.lineTo(x + bw / 2 - 4, y); ctx.stroke();
    }
    if (i === 0) {
      ctx.fillStyle = C.accent; ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
      ctx.fillText(stale ? 'MIN (stale)' : 'MIN', x, y - bh / 2 - 9);
    }
    if (isNew && i !== 0) {
      ctx.fillStyle = '#b45309'; ctx.font = 'bold 9.5px ui-monospace, Consolas, monospace';
      ctx.fillText('NEW', x, y - bh / 2 - 7);
    }
    if (d === MAXD - 1 && 2 * i + 1 < a.length) {
      ctx.fillStyle = C.muted; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('⋯', x, y + bh / 2 + 9);
    }
  }
  const nStale = a.filter((it) => isStale(S, it)).length;
  const arr = a.slice(0, 12).map((it) => `${L(it.node)}:${fmt(isA ? it.f : it.g)}`).join(', ');
  $('#heap-foot').textContent =
    `size ${a.length} · ${tr('유효', 'valid')} ${a.length - nStale} · stale ${nStale}` +
    (a.length > shown ? tr(` · 트리는 위 ${shown}개만 표시`, ` · tree shows the top ${shown}`) : '') +
    `\n${tr('배열', 'array')} H = [${arr}${a.length > 12 ? ', …' : ''}]`;
}

/* ---------------- 패널 갱신 ---------------- */
const NAMES = { dijkstra: 'DIJKSTRA', astar: 'A*' };
function renderCode() {
  const pre = $('#code');
  pre.replaceChildren(...PSEUDO[app.algo].map((t, i) => {
    const s = document.createElement('span');
    s.className = 'ln'; s.dataset.i = i; s.textContent = (typeof t === 'function' ? t() : t) + '\n';
    return s;
  }));
  $('#code-title').textContent = NAMES[app.algo];
  $('#exec-title').textContent = NAMES[app.algo] + ' EXECUTION';
}

function heuristicText() {
  if (app.algo === 'dijkstra') return tr('h(n) = 0  — Dijkstra 는 h ≡ 0 인 A* 와 같습니다 (key = dist).', 'h(n) = 0  — Dijkstra is A* with h ≡ 0 (key = dist).');
  if (app.env === 'graph') {
    return `h(n) = k × ‖n − t‖₂,  k = min w(e)/${tr('길이', 'len')}(e) = ${app.graph.ratio.toFixed(4)}\n` +
      tr('→ 어떤 간선도 직선거리×k 보다 싸지 않으므로 과대추정 없음 (admissible, consistent)',
        '→ no edge is cheaper than k × its straight-line length, so h never overestimates (admissible, consistent)');
  }
  const m = app.opts.heuristic === 'manhattan' ? `h(n) = |dx| + |dy|  (${tr('맨해튼', 'Manhattan')})` : `h(n) = √(dx² + dy²)  (${tr('유클리드', 'Euclidean')})`;
  const warn = app.opts.diagonal && app.opts.heuristic === 'manhattan'
    ? tr('\n⚠ 8방향 이동에서 맨해튼은 대각선(√2)을 2로 과대추정 → 최적 보장 X', '\n⚠ with 8-way moves Manhattan counts a diagonal (√2) as 2 → overestimates, optimality not guaranteed')
    : tr('\n→ 실제 남은 거리를 넘지 않음 (admissible)', '\n→ never exceeds the true remaining distance (admissible)');
  return m + warn;
}

function render() {
  const S = cur();
  drawMap(ctxMain, S, false);
  drawHeap(ctxHeap, S);

  // 의사코드 줄 강조
  const hl = new Set(S.op ? S.op.line : []);
  $$('#code .ln').forEach((el) => el.classList.toggle('hl', hl.has(+el.dataset.i)));
  $('#heur-text').textContent = heuristicText();
  $('#heur-text').style.whiteSpace = 'pre-wrap';
  const E = env();
  const nV = app.env === 'graph' ? app.graph.nodes.length : app.grid.walls.filter((w) => !w).length;
  const nE = app.env === 'graph' ? app.graph.edges.length : '≈' + (app.opts.diagonal ? 4 : 2) * nV;
  $('#time-text').textContent = `T = O((|V| + |E|) log |V|)`;
  $('#code-cx').textContent = `|V| = ${nV}, |E| = ${nE}`;

  // 연산 카드
  const op = S.op;
  const t = $('#op-title');
  t.textContent = op.title;
  t.className = 'op-title mono' + (op.type === 'insert' || op.type === 'decreasekey' || op.type === 'norelax' ? ' relax'
    : op.type === 'found' ? ' done' : op.type === 'stale' ? ' stale' : '');
  $('#op-lines').textContent = op.lines().join('\n');
  $('#op-count').textContent = S.micro ? `· #${S.micro}` : '';

  // 상태 배지
  const st = $('#status');
  const status = !app.valid ? 'READY' : allDone() ? 'DONE' : app.playing ? 'RUNNING' : started() ? 'PAUSED' : 'READY';
  st.textContent = status;
  st.className = 'mono badge ' + status.toLowerCase();
  $('#btn-pause').disabled = !app.playing;
  $('#btn-resume').disabled = app.playing || !started() || allDone();
  $('#btn-run').disabled = !app.valid;
  $('#btn-step').disabled = !app.valid || allDone();

  $('#st-closed').textContent = S.closed.size;
  $('#st-open').textContent = S.open.size;
  $('#st-heap').textContent = S.pq.size;
  $('#st-ops').textContent = S.micro;
  $('#st-cost').textContent = S.found ? fmt(S.cost) : '-';

  // 상태 메시지
  $('#msg').textContent = statusMessage(E, status);

  // 비교
  for (const th of thumbs) {
    const T = app.runners[th.algo].state;
    drawMap(th.ctx, T, true);
    th.el.classList.toggle('on', th.algo === app.algo);
    th.stats.textContent =
      tr(`확정 노드  ${T.closed.size}\n연산 수    ${T.micro}\n최대 힙    ${T.maxPQ}\n경로 비용  `, `finalized  ${T.closed.size}\noperations ${T.micro}\nmax heap   ${T.maxPQ}\npath cost  `) +
      (T.found ? fmt(T.cost) : T.done ? tr('없음', 'none') : '-');
  }
  $('#cmp-summary').textContent = compareText();
  updateLog(S);
  refreshTip();
}

function statusMessage(E, status) {
  const L = (i) => (app.env === 'graph' ? app.graph.nodes[i].label : app.grid.rc(i).join(','));
  const toolHelp = app.env === 'graph' ? {
    node: tr('+ NODE: 빈 곳을 클릭하면 노드가 생깁니다.', '+ NODE: click anywhere on the canvas to create a vertex.'),
    edge: app.edgePick === null ? tr('+ EDGE: 간선의 첫 번째 노드를 클릭하세요.', '+ EDGE: click the first endpoint.')
      : tr(`+ EDGE: ${L(app.edgePick)} 와 이을 두 번째 노드를 클릭하세요.`, `+ EDGE: click the node to connect with ${L(app.edgePick)}.`),
    start: tr('START: 시작 노드로 지정할 노드를 클릭하세요.', 'START: click the node to use as the source.'),
    goal: tr('GOAL: 도착 노드로 지정할 노드를 클릭하세요.', 'GOAL: click the node to use as the target.'),
    move: tr('MOVE: 노드를 드래그해서 옮길 수 있습니다.', 'MOVE: drag a vertex to move it.'),
    delete: tr('DELETE: 노드나 간선(또는 가중치 라벨)을 클릭하면 삭제됩니다.', 'DELETE: click a vertex or an edge (or its label) to delete it.'),
  }[app.tool] : {
    wall: tr('WALL: 드래그로 벽을 그리거나 지웁니다.', 'WALL: drag to draw or erase walls.'),
    start: tr('START: 시작 칸을 클릭하세요.', 'START: click the start cell.'),
    goal: tr('GOAL: 도착 칸을 클릭하세요.', 'GOAL: click the goal cell.'),
  }[app.gtool];
  if (!app.valid) return toolHelp + tr('  ·  시작/도착을 먼저 지정하세요.', '  ·  set the start and goal first.');
  const se = tr(`시작: ${L(E.start)} · 도착: ${L(E.goal)}`, `Source: ${L(E.start)} · Target: ${L(E.goal)}`);
  if (status === 'READY') return tr(`준비 완료. ${se}. RUN 또는 STEP 을 누르세요.  (${toolHelp})`, `Ready. ${se}. Press RUN or STEP.  (${toolHelp})`);
  if (status === 'DONE') return tr(`탐색 완료. ${se}.  편집하면 탐색이 초기화됩니다.`, `Search finished. ${se}.  Editing resets the search.`);
  return `${status === 'RUNNING' ? tr('실행 중', 'Running') : tr('일시정지', 'Paused')} · ${se}`;
}

function compareText() {
  if (!app.valid) return tr('시작/도착을 지정하면 두 알고리즘을 비교합니다.', 'Set a start and a goal to compare the two algorithms.');
  const d = app.runners.dijkstra.state, a = app.runners.astar.state;
  if (!(d.done && a.done)) {
    return d.micro ? tr('진행 중… 두 알고리즘이 같은 맵에서 동시에 한 연산씩 진행됩니다. FINISH 를 누르면 결과를 바로 비교합니다.',
        'Running… both algorithms advance one operation at a time on the same map. Press FINISH to compare right away.')
      : tr('RUN 을 누르면 두 알고리즘이 같은 맵에서 동시에 진행되고, 여기서 확정 노드 수와 경로 비용을 비교합니다.',
        'Press RUN: both algorithms run on the same map, and this box compares finalized nodes and path cost.');
  }
  if (!d.found) return tr('시작점에서 도착점으로 가는 경로가 없습니다.', 'There is no path from the start to the goal.');
  const dn = d.closed.size, an = a.closed.size, diff = dn - an;
  const pct = dn ? Math.round((Math.abs(diff) / dn) * 100) : 0;
  let s = tr(`확정 노드: Dijkstra ${dn} vs A* ${an} → `, `Finalized nodes: Dijkstra ${dn} vs A* ${an} → `) +
    (diff > 0 ? tr(`A* 가 ${diff}개 (${pct}%) 적게 확정.`, `A* finalized ${diff} fewer (${pct}%).`)
      : diff < 0 ? tr(`A* 가 ${-diff}개 더 확정.`, `A* finalized ${-diff} more.`) : tr('같음.', 'equal.'));
  s += tr(`\n연산 수: ${d.micro} vs ${a.micro}.`, `\nOperations: ${d.micro} vs ${a.micro}.`);
  s += Math.abs(d.cost - a.cost) < 1e-6
    ? tr(`\n경로 비용은 둘 다 ${fmt(d.cost)} → A* 도 최적 경로.`, `\nBoth path costs are ${fmt(d.cost)} → A* is optimal too.`)
    : tr(`\n⚠ A* 경로 비용 ${fmt(a.cost)} > 최적 ${fmt(d.cost)}: 휴리스틱이 과대추정해서 최적성이 깨졌습니다.`,
      `\n⚠ A* path cost ${fmt(a.cost)} > optimum ${fmt(d.cost)}: the heuristic overestimates, so optimality is lost.`);
  return s;
}

function updateLog(S) {
  const box = $('#log');
  if (app.logAlgo !== app.algo || app.logLang !== LANG || app.logShown > S.log.length) {
    box.innerHTML = ''; app.logShown = 0; app.logAlgo = app.algo; app.logLang = LANG;
  }
  const frag = document.createDocumentFragment();
  for (let i = Math.max(app.logShown, S.log.length - 300); i < S.log.length; i++) {
    const d = document.createElement('div');
    const e = S.log[i];
    d.textContent = `${String(e.n).padStart(3)} ${e.title.padEnd(20)} ${e.lines().join(' | ')}`;
    frag.appendChild(d);
  }
  app.logShown = S.log.length;
  box.appendChild(frag);
  while (box.childElementCount > 300) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

/* ---------------- 툴팁 ---------------- */
let tipAt = null;
function canvasPoint(e) {
  const r = $('#cv-main').getBoundingClientRect();
  return { x: ((e.clientX - r.left) * CW) / r.width, y: ((e.clientY - r.top) * CH) / r.height };
}
function nodeAtPoint({ x, y }) {
  if (app.env === 'grid') {
    const c = Math.floor((x - app.offX) / app.cell), r = Math.floor((y - app.offY) / app.cell);
    return app.grid.inside(r, c) ? app.grid.id(r, c) : null;
  }
  let best = null, bd = NODE_R + 6;
  app.graph.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
function refreshTip() {
  const tip = $('#tip');
  if (!tipAt || tipAt.node === null || !app.P) { tip.hidden = true; return; }
  const node = tipAt.node, S = cur(), L = app.P.label, E = env();
  if (app.env === 'graph' && node >= app.graph.nodes.length) { tip.hidden = true; return; }
  if (app.env === 'grid' && app.grid.walls[node]) tip.textContent = `${L(node)}  ${tr('벽', 'wall')}`;
  else {
    const st = S.closed.has(node) ? tr('확정 (closed)', 'finalized (closed)') : S.open.has(node) ? tr('H 안 (프론티어)', 'in H (frontier)') : tr('미방문', 'unvisited');
    const tag = node === E.start ? ' [START]' : node === E.goal ? ' [GOAL]' : '';
    const g = S.g.has(node) ? S.g.get(node) : Infinity;
    const D = S.h ? 'g' : 'dist';
    const lines = [`${NAMES[app.algo]} · ${L(node)}${tag}`, `${tr('상태', 'state')}  ${st}`, `${D.padEnd(4)}  ${fmt(g)}`];
    if (S.h) {
      const h = S.h.has(node) ? S.h.get(node) : null;
      lines.push(`h     ${h === null ? tr('(아직 계산 안 함)', '(not computed yet)') : fmt(h)}`);
      if (h !== null) lines.push(`f     ${fmt(g + h)}`);
    }
    lines.push(`prev  ${S.prev.has(node) ? L(S.prev.get(node)) : 'nil'}`);
    tip.textContent = lines.join('\n');
  }
  tip.hidden = false;
  tip.style.left = Math.min(tipAt.x + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = tipAt.y + 14 + 'px';
}

/* ---------------- 편집 (마우스) ---------------- */
let drag = null;
function edited() { app.edgePick = app.tool === 'edge' ? app.edgePick : null; resetSearch(); }

function labelAt({ x, y }) {
  return app.labelRects.find((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) || null;
}
function edgeAt(p) {
  const M = app.graph;
  let best = -1, bd = 7;
  M.edges.forEach((e, k) => { const d = pointSegDist(p, M.nodes[e.a], M.nodes[e.b]); if (d < bd) { bd = d; best = k; } });
  return best;
}

function openWeightEditor(rect) {
  const inp = $('#weight-editor');
  const cv = $('#cv-main').getBoundingClientRect();
  const s = cv.width / CW;
  inp.hidden = false;
  inp.value = app.graph.edges[rect.k].w;
  inp.style.left = (rect.x + rect.w / 2) * s - 35 + 'px';
  inp.style.top = (rect.y - 4) * s + 'px';
  inp.dataset.k = rect.k;
  inp.focus(); inp.select();
}
function commitWeight() {
  const inp = $('#weight-editor');
  if (inp.hidden) return;
  const v = parseFloat(inp.value), k = +inp.dataset.k;
  inp.hidden = true;
  if (Number.isFinite(v) && v >= 0 && app.graph.edges[k]) {
    app.graph.setWeight(k, Math.round(v * 10) / 10);
    edited();
  }
}

function onDown(e) {
  if (e.button === 2) return;
  const p = canvasPoint(e);
  if (app.env === 'graph') {
    const M = app.graph;
    const lab = app.opts.showWeights ? labelAt(p) : null;
    const id = nodeAtPoint(p);
    if (app.tool === 'delete') {
      if (id !== null) { M.removeNode(id); edited(); return; }
      const k = lab ? lab.k : edgeAt(p);
      if (k >= 0 && k !== null) { M.removeEdge(k); edited(); }
      return;
    }
    if (lab && id === null) {
      e.preventDefault();                       // 캔버스로 포커스가 넘어가 입력창이 바로 닫히지 않게
      setTimeout(() => openWeightEditor(lab), 0);
      return;
    }
    if (app.tool === 'node') {
      if (id === null && M.nodes.length < 40 &&
          M.nodes.every((n) => Math.hypot(n.x - p.x, n.y - p.y) > NODE_R * 2.4)) {
        M.addNode(Math.max(NODE_R + 4, Math.min(CW - NODE_R - 4, p.x)), Math.max(NODE_R + 24, Math.min(CH - NODE_R - 14, p.y)));
        edited();
      }
    } else if (app.tool === 'edge') {
      if (id === null) { app.edgePick = null; render(); return; }
      if (app.edgePick === null) { app.edgePick = id; render(); return; }
      if (id !== app.edgePick) M.addEdge(app.edgePick, id, app.weightMode);
      app.edgePick = null;
      edited();
    } else if (app.tool === 'start' || app.tool === 'goal') {
      if (id === null) return;
      const other = app.tool === 'start' ? 'goal' : 'start';
      if (M[other] === id) M[other] = M[app.tool];
      M[app.tool] = id;
      edited();
    } else if (app.tool === 'move') {
      if (id !== null) { drag = { node: id }; $('#cv-main').setPointerCapture(e.pointerId); }
    }
  } else {
    const G = app.grid, id = nodeAtPoint(p);
    if (id === null) return;
    if (app.gtool === 'start' || app.gtool === 'goal') {
      drag = { mode: app.gtool };
    } else {
      drag = { mode: id === G.start ? 'start' : id === G.goal ? 'goal' : G.walls[id] ? 'erase' : 'draw' };
    }
    $('#cv-main').setPointerCapture(e.pointerId);
    gridEdit(id);
  }
}
function gridEdit(id) {
  const G = app.grid;
  if (id === null || !drag) return;
  if (drag.mode === 'start' || drag.mode === 'goal') {
    if (G.walls[id] || id === G.start || id === G.goal) return;
    G[drag.mode] = id;
  } else {
    if (id === G.start || id === G.goal) return;
    const v = drag.mode === 'draw' ? 1 : 0;
    if (G.walls[id] === v) return;
    G.walls[id] = v;
  }
  edited();
}
function onMove(e) {
  const p = canvasPoint(e);
  if (drag) {
    if (app.env === 'graph' && drag.node !== undefined) {
      app.graph.moveNode(drag.node, Math.max(NODE_R + 4, Math.min(CW - NODE_R - 4, p.x)),
        Math.max(NODE_R + 24, Math.min(CH - NODE_R - 14, p.y)), app.weightMode);
      edited();
    } else if (app.env === 'grid') gridEdit(nodeAtPoint(p));
    tipAt = null;
  } else {
    tipAt = { node: nodeAtPoint(p), x: e.clientX, y: e.clientY };
  }
  const lab = app.env === 'graph' && app.opts.showWeights ? labelAt(p) : null;
  $('#cv-main').style.cursor = lab ? 'text' : app.env === 'graph' && app.tool === 'move' && nodeAtPoint(p) !== null ? 'grab' : 'crosshair';
  refreshTip();
}
function onUp() { drag = null; }

/* ---------------- 설정 변경 ---------------- */
function setSeg(sel, attr, val) { $$(`${sel} button`).forEach((b) => b.classList.toggle('on', b.dataset[attr] === val)); }

function setEnv(v, keepSearch) {
  app.env = v;
  setSeg('#seg-env', 'env', v);
  $$('.env-graph').forEach((e) => { e.hidden = v !== 'graph'; });
  $$('.env-grid').forEach((e) => { e.hidden = v !== 'grid'; });
  $('#setup-note').textContent = v === 'graph'
    ? tr('그래프: 노드 좌표가 있는 무방향 가중치 그래프. A* 의 h 는 노드 좌표의 직선거리에 배율 k 를 곱한 값입니다.',
      'Graph: an undirected weighted graph whose vertices have coordinates. A*\'s h is the straight-line distance between coordinates times a factor k.')
    : tr('격자: 칸 = 노드, 인접 칸 = 간선 (4방향 비용 1, 대각선 √2). A* 의 h 는 맨해튼 또는 유클리드 거리입니다.',
      'Grid: cell = vertex, neighboring cells = edges (4-way cost 1, diagonal √2). A*\'s h is the Manhattan or Euclidean distance.');
  keepSearch ? render() : resetSearch();
}
function setAlgo(v) {
  app.algo = v;
  setSeg('#seg-algo', 'algo', v);
  renderCode();
  render();
}
function newRandomGraph(seed) {
  const n = Math.max(2, Math.min(30, +$('#in-nodes').value || 14));
  $('#in-nodes').value = n;
  app.graphSeed = seed;
  app.graph = GraphMap.random(seed, n, CW, CH, app.weightMode);
  resetSearch();
}
function setSpeed() {
  const v = +$('#in-speed').value;
  app.stepsPerSec = Math.max(1, Math.round(Math.pow(10, (v / 100) * 2.7)));
  $('#speed-val').textContent = `${app.stepsPerSec} step/s`;
}

function bind() {
  $$('#seg-env button').forEach((b) => b.addEventListener('click', () => setEnv(b.dataset.env)));
  $$('#seg-algo button').forEach((b) => b.addEventListener('click', () => setAlgo(b.dataset.algo)));
  $$('.cmp').forEach((el) => el.addEventListener('click', () => setAlgo(el.dataset.algo)));
  $$('#seg-gran button').forEach((b) => b.addEventListener('click', () => { app.gran = b.dataset.gran; setSeg('#seg-gran', 'gran', app.gran); }));
  $$('#seg-weight button').forEach((b) => b.addEventListener('click', () => {
    app.weightMode = b.dataset.w;
    setSeg('#seg-weight', 'w', app.weightMode);
    app.graph.reweight(app.weightMode, ++app.graphSeed);
    resetSearch();
  }));
  $$('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    app.tool = b.dataset.tool; app.edgePick = null;
    $$('[data-tool]').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  $$('[data-gtool]').forEach((b) => b.addEventListener('click', () => {
    app.gtool = b.dataset.gtool;
    $$('[data-gtool]').forEach((x) => x.classList.toggle('on', x === b));
    render();
  }));
  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const G = app.grid, k = b.dataset.preset;
    if (k === 'default') G.presetDefault();
    else if (k === 'random') G.presetRandom(++app.gridSeed);
    else G.presetMaze(++app.gridSeed);
    resetSearch();
  }));
  $('#btn-clear').addEventListener('click', () => {
    if (app.env === 'graph') app.graph.clear(); else app.grid.clear();
    app.tool === 'edge' && (app.edgePick = null);
    resetSearch();
  });
  $('#btn-random').addEventListener('click', () => newRandomGraph(Math.floor(Math.random() * 1e6)));
  $('#btn-example').addEventListener('click', () => {
    $('#in-nodes').value = EXAMPLE_N;
    app.weightMode = 'random'; setSeg('#seg-weight', 'w', 'random');
    newRandomGraph(EXAMPLE_SEED);
  });
  $('#sel-gridsize').addEventListener('change', (e) => {
    const [c, r] = e.target.value.split('x').map(Number);
    setGridSize(c, r); resetSearch();
  });
  $('#sel-moves').addEventListener('change', (e) => { app.opts.diagonal = e.target.value === '8'; resetSearch(); });
  $('#sel-heur').addEventListener('change', (e) => { app.opts.heuristic = e.target.value; resetSearch(); });
  $('#chk-values').addEventListener('change', (e) => { app.opts.showValues = e.target.checked; render(); });
  $('#chk-parents').addEventListener('change', (e) => { app.opts.showParents = e.target.checked; render(); });
  $('#chk-weights').addEventListener('change', (e) => { app.opts.showWeights = e.target.checked; render(); });

  $('#btn-run').addEventListener('click', run);
  $('#btn-pause').addEventListener('click', pause);
  $('#btn-resume').addEventListener('click', resume);
  $('#btn-step').addEventListener('click', () => { app.playing = false; stepAll(); render(); });
  $('#btn-finish').addEventListener('click', finishAll);
  $('#btn-reset').addEventListener('click', resetSearch);
  $('#in-speed').addEventListener('input', setSpeed);

  const cv = $('#cv-main');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', () => { tipAt = null; refreshTip(); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const we = $('#weight-editor');
  we.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitWeight();
    if (e.key === 'Escape') we.hidden = true;
    e.stopPropagation();
  });
  we.addEventListener('blur', commitWeight);

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); app.playing = false; stepAll(); render(); }
    else if (e.key === 'e' || e.key === 'E') finishAll();
    else if (e.key === 'r' || e.key === 'R') resetSearch();
    else if (e.key === '1') setAlgo('dijkstra');
    else if (e.key === '2') setAlgo('astar');
  });
  $$('button').forEach((b) => b.addEventListener('mouseup', () => b.blur()));
}

bind();
$$('#seg-lang button').forEach((b) => b.addEventListener('click', () => {
  setLang(b.dataset.lang);
  renderCode();
  setEnv(app.env === 'grid' ? 'grid' : 'graph', true);
}));
applyStatic();
setSpeed();
renderCode();
setEnv('graph');
requestAnimationFrame(loop);
