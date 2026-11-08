'use strict';
/*
 * 탐색 환경 2가지
 *  (1) GridMap  : 2D 격자 + 장애물(벽)
 *  (2) GraphMap : 좌표를 가진 노드 + 가중치 간선
 * 각각 algorithms.js 가 요구하는 problem 객체(neighbors, label, heuristics)를 만든다.
 */

/* 시드 고정 난수 (같은 시드 → 같은 맵, 팀원끼리 재현 가능) */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
 * (1) 격자
 * ============================================================ */
class GridMap {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.walls = new Uint8Array(rows * cols);
    this.start = this.id(Math.floor(rows / 2), 4);
    this.goal = this.id(Math.floor(rows / 2), cols - 5);
  }
  id(r, c) { return r * this.cols + c; }
  rc(id) { return [Math.floor(id / this.cols), id % this.cols]; }
  inside(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  free(r, c) { return this.inside(r, c) && !this.walls[this.id(r, c)]; }

  resetEndpoints() {
    const m = Math.max(1, Math.round(this.cols * 0.13));
    this.start = this.id(Math.floor(this.rows / 2), m);
    this.goal = this.id(Math.floor(this.rows / 2), this.cols - 1 - m);
  }
  clear() { this.walls.fill(0); }

  /* 기본 예제: 가운데 세로 벽 + 시작점 쪽으로 열린 ㄷ자 → A*와 Dijkstra 차이가 잘 보임 */
  presetDefault() {
    this.clear();
    this.resetEndpoints();
    const mid = Math.floor(this.cols / 2);
    const top = Math.max(1, Math.round(this.rows * 0.15)), bot = this.rows - 1 - top;
    const arm = Math.max(2, Math.round(this.cols * 0.13));
    for (let r = top; r <= bot; r++) this.walls[this.id(r, mid)] = 1;
    for (let c = mid - arm; c <= mid; c++) {
      this.walls[this.id(top, c)] = 1;
      this.walls[this.id(bot, c)] = 1;
    }
  }

  presetRandom(seed, density = 0.3) {
    const rng = mulberry32(seed);
    this.clear();
    this.resetEndpoints();
    for (let i = 0; i < this.walls.length; i++) this.walls[i] = rng() < density ? 1 : 0;
    this.walls[this.start] = this.walls[this.goal] = 0;
  }

  /* 미로: 깊이우선 탐색(recursive backtracker) + 일부 벽 제거로 여러 갈래 길 생성 */
  presetMaze(seed) {
    const rng = mulberry32(seed);
    const R = this.rows, C = this.cols;
    this.walls.fill(1);
    const stack = [[1, 1]];
    this.walls[this.id(1, 1)] = 0;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const nb = [[-2, 0], [2, 0], [0, -2], [0, 2]]
        .map(([dr, dc]) => [r + dr, c + dc, r + dr / 2, c + dc / 2])
        .filter(([nr, nc]) => nr > 0 && nr < R - 1 && nc > 0 && nc < C - 1 && this.walls[this.id(nr, nc)]);
      if (!nb.length) { stack.pop(); continue; }
      const [nr, nc, wr, wc] = nb[Math.floor(rng() * nb.length)];
      this.walls[this.id(wr, wc)] = 0;
      this.walls[this.id(nr, nc)] = 0;
      stack.push([nr, nc]);
    }
    for (let r = 1; r < R - 1; r++) {
      for (let c = 1; c < C - 1; c++) {
        if (!this.walls[this.id(r, c)]) continue;
        const h = !this.walls[this.id(r, c - 1)] && !this.walls[this.id(r, c + 1)];
        const v = !this.walls[this.id(r - 1, c)] && !this.walls[this.id(r + 1, c)];
        if ((h || v) && rng() < 0.12) this.walls[this.id(r, c)] = 0;
      }
    }
    this.start = this.id(1, 1);
    this.goal = this.id(R - 2, C - 2);
  }
}

function gridProblem(G, diagonal) {
  const D4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const DD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const diff = (a, b) => {
    const [ra, ca] = G.rc(a), [rb, cb] = G.rc(b);
    return [Math.abs(ra - rb), Math.abs(ca - cb)];
  };
  return {
    neighbors(id) {
      const [r, c] = G.rc(id);
      const out = [];
      for (const [dr, dc] of D4) {
        if (G.free(r + dr, c + dc)) out.push({ to: G.id(r + dr, c + dc), w: 1 });
      }
      if (diagonal) {
        for (const [dr, dc] of DD) {
          // 모서리 끼어가기 금지: 대각선 양옆 두 칸이 모두 비어 있어야 이동 가능
          if (G.free(r + dr, c + dc) && G.free(r + dr, c) && G.free(r, c + dc)) {
            out.push({ to: G.id(r + dr, c + dc), w: Math.SQRT2 });
          }
        }
      }
      return out;
    },
    label(id) { const [r, c] = G.rc(id); return `(${r},${c})`; },
    heuristics: {
      manhattan: (a, b) => { const [dr, dc] = diff(a, b); return dr + dc; },
      euclidean: (a, b) => { const [dr, dc] = diff(a, b); return Math.hypot(dr, dc); },
    },
  };
}

/* ============================================================
 * (2) 가중치 그래프 (노드 좌표 있음)
 * ============================================================ */
function segCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function pointSegDist(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}
function nodeLabel(i) {
  return String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
}

/* 간선 가중치 모드
 *  'euclid' : 직선거리 그대로 (거리/18, 소수 첫째 자리)
 *  'random' : 직선거리 × (1 ~ 1.8) 랜덤 → 정수 (직선으로 가까워 보여도 실제로는 비쌀 수 있음)
 */
const W_SCALE = 18;
function edgeWeight(len, mode, rng = Math.random) {
  if (mode === 'euclid') return Math.max(0.1, Math.round((len / W_SCALE) * 10) / 10);
  return Math.max(1, Math.round((len / W_SCALE) * (1 + rng() * 0.8)));
}

class GraphMap {
  constructor(nodes, edges, start, goal) {
    this.nodes = nodes;   // [{x, y, label}]
    this.edges = edges;   // [{a, b, w}]
    this.start = start;
    this.goal = goal;
    this.rebuild();
  }

  dist(a, b) { return Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].y - this.nodes[b].y); }

  /* 인접 리스트와 휴리스틱 배율 다시 계산 (편집할 때마다 호출) */
  rebuild() {
    this.adj = this.nodes.map(() => []);
    for (const e of this.edges) {
      this.adj[e.a].push({ to: e.b, w: e.w });
      this.adj[e.b].push({ to: e.a, w: e.w });
    }
    // 휴리스틱 배율 k: 모든 간선에서 w >= k × (유클리드 길이) 가 되는 최대 k.
    // h(n) = k × 직선거리(n, goal) 은 과대추정하지 않음(admissible & consistent).
    this.ratio = this.edges.length
      ? Math.min(...this.edges.map((e) => e.w / Math.max(1, this.dist(e.a, e.b))))
      : 0;
    if (this.start !== null && this.start >= this.nodes.length) this.start = null;
    if (this.goal !== null && this.goal >= this.nodes.length) this.goal = null;
  }

  /* ---------- 편집 ---------- */
  nextLabel() {
    const used = new Set(this.nodes.map((n) => n.label));
    for (let i = 0; ; i++) if (!used.has(nodeLabel(i))) return nodeLabel(i);
  }
  addNode(x, y) {
    this.nodes.push({ x: Math.round(x), y: Math.round(y), label: this.nextLabel() });
    const i = this.nodes.length - 1;
    if (this.start === null) this.start = i;
    else if (this.goal === null) this.goal = i;
    this.rebuild();
    return i;
  }
  hasEdge(a, b) { return this.edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }
  addEdge(a, b, mode) {
    if (a === b || this.hasEdge(a, b)) return false;
    this.edges.push({ a, b, w: edgeWeight(this.dist(a, b), mode) });
    this.rebuild();
    return true;
  }
  removeNode(i) {
    this.nodes.splice(i, 1);
    const fix = (k) => (k > i ? k - 1 : k);
    this.edges = this.edges.filter((e) => e.a !== i && e.b !== i).map((e) => ({ ...e, a: fix(e.a), b: fix(e.b) }));
    this.start = this.start === i ? null : this.start === null ? null : fix(this.start);
    this.goal = this.goal === i ? null : this.goal === null ? null : fix(this.goal);
    this.rebuild();
  }
  removeEdge(k) { this.edges.splice(k, 1); this.rebuild(); }
  moveNode(i, x, y, mode) {
    this.nodes[i].x = Math.round(x);
    this.nodes[i].y = Math.round(y);
    if (mode === 'euclid') {
      for (const e of this.edges) if (e.a === i || e.b === i) e.w = edgeWeight(this.dist(e.a, e.b), 'euclid');
    }
    this.rebuild();
  }
  setWeight(k, w) { this.edges[k].w = w; this.rebuild(); }
  reweight(mode, seed) {
    const rng = mulberry32(seed);
    for (const e of this.edges) e.w = edgeWeight(this.dist(e.a, e.b), mode, rng);
    this.rebuild();
  }
  clear() { this.nodes = []; this.edges = []; this.start = null; this.goal = null; this.rebuild(); }

  /* ---------- 랜덤 연결 그래프 생성 ---------- */
  static random(seed, n, W, H, mode = 'random') {
    const rng = mulberry32(seed);
    const pad = 36;
    let minD = Math.sqrt(((W - 2 * pad) * (H - 2 * pad)) / n) * 0.75;
    const nodes = [];
    let tries = 0;
    while (nodes.length < n) {
      const p = { x: pad + rng() * (W - 2 * pad), y: pad + rng() * (H - 2 * pad) };
      if (nodes.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= minD)) nodes.push(p);
      if (++tries % 2000 === 0) minD *= 0.92;
    }
    nodes.forEach((p, i) => { p.x = Math.round(p.x); p.y = Math.round(p.y); p.label = nodeLabel(i); });

    const pairs = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      pairs.push({ a: i, b: j, len: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) });
    }
    pairs.sort((p, q) => p.len - q.len);

    const edges = [], deg = new Array(n).fill(0);
    const parent = nodes.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const ok = (p) =>
      !edges.some((e) => e.a !== p.a && e.a !== p.b && e.b !== p.a && e.b !== p.b &&
        segCross(nodes[p.a], nodes[p.b], nodes[e.a], nodes[e.b])) &&
      !nodes.some((q, k) => k !== p.a && k !== p.b && pointSegDist(q, nodes[p.a], nodes[p.b]) < 18);
    const add = (p) => {
      edges.push({ a: p.a, b: p.b, len: p.len });
      deg[p.a]++; deg[p.b]++;
      parent[find(p.a)] = find(p.b);
    };
    // 짧은 간선부터, 교차하지 않고 차수 4 이하인 것만 추가 → 보기 좋은 평면 그래프
    for (const p of pairs) {
      if (p.len > minD * 2.3) break;
      if (deg[p.a] >= 4 || deg[p.b] >= 4) continue;
      if (ok(p)) add(p);
    }
    // 연결 그래프 보장
    for (const strict of [true, false]) {
      for (const p of pairs) {
        if (find(p.a) !== find(p.b) && (!strict || ok(p))) add(p);
      }
    }
    const out = edges.map((e) => ({ a: e.a, b: e.b, w: edgeWeight(e.len, mode, rng) }));
    let L = 0, R = 0;
    nodes.forEach((p, i) => { if (p.x < nodes[L].x) L = i; if (p.x > nodes[R].x) R = i; });
    return new GraphMap(nodes, out, L, R);
  }
}

function graphProblem(M) {
  return {
    neighbors: (u) => M.adj[u],
    label: (u) => M.nodes[u].label,
    heuristics: {
      euclidean: (a, b) => M.ratio * M.dist(a, b),
    },
  };
}
