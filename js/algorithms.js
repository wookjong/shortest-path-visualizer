'use strict';
/*
 * Dijkstra / A* 구현 (환경 독립적)
 * ------------------------------------------------------------
 * 두 알고리즘은 "problem" 객체만 알면 동작한다. 격자든 그래프든
 * 아래 인터페이스만 제공하면 같은 코드로 탐색할 수 있다.
 *
 *   problem.neighbors(u) -> [{ to: v, w: 간선 가중치 }, ...]
 *   problem.label(u)     -> 화면에 표시할 노드 이름
 *
 * 시각화를 위해 제너레이터(function*)로 작성했다.
 * 의사코드의 연산 하나(초기화, deletemin, 간선 하나 완화 ...)가 끝날 때마다
 * 상태 S 를 yield 한다. S.op 에는 "방금 무슨 연산을 했는지"와
 * 의사코드의 몇 번째 줄인지(line)가 들어 있어서 화면이 그대로 보여 준다.
 *
 * decreasekey 구현 방식 (lazy deletion):
 *   이진 힙에서 원소의 키를 직접 낮추는 대신, 더 작은 키로 새 항목을 insert 한다.
 *   예전 항목은 힙에 남아 있다가(stale) 나중에 deletemin 되면 이미 확정된 노드이므로 버린다.
 *   시간복잡도는 O((|V|+|E|) log |V|) 로 같다.
 */

/* ---------- 이진 힙 기반 최소 우선순위 큐 ---------- */
class MinHeap {
  constructor(less) { this.a = []; this.less = less; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {                       // sift-up
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {                          // sift-down
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/* ---------- 공통 유틸 ---------- */
function fmt(x) {
  if (x === Infinity) return '∞';
  if (x === undefined || x === null) return '-';
  return Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1);
}

function reconstructPath(prev, start, goal) {
  const path = [goal];
  let cur = goal;
  while (cur !== start) {
    cur = prev.get(cur);
    path.push(cur);
  }
  return path.reverse();
}

/* 의사코드 (화면에 표시, op.line 은 이 배열의 인덱스) */
const PSEUDO = {
  dijkstra: [
    'function Dijkstra(G, l, s, t)',
    '  for all u ∈ V do',
    '      dist(u) = ∞;  prev(u) = nil',
    '  dist(s) = 0',
    '  H = makequeue({s})            ▷ key = dist',
    '  while H is not empty do',
    '      u = deletemin(H)',
    '      if u = t then return path(prev)',
    '      for all edges (u, v) ∈ E do',
    '          if dist(v) > dist(u) + l(u, v) then',
    '              dist(v) = dist(u) + l(u, v);  prev(v) = u',
    () => tr('              decreasekey(H, v)    ▷ H에 없으면 insert', '              decreasekey(H, v)    ▷ insert if v ∉ H'),
  ],
  astar: [
    'function A*(G, l, s, t, h)',
    '  for all u ∈ V do',
    '      g(u) = ∞;  prev(u) = nil',
    '  g(s) = 0;  f(s) = g(s) + h(s)',
    '  H = makequeue({s})            ▷ key = f = g + h',
    '  while H is not empty do',
    () => tr('      u = deletemin(H)          ▷ f가 가장 작은 노드', '      u = deletemin(H)          ▷ node with smallest f'),
    '      if u = t then return path(prev)',
    '      for all edges (u, v) ∈ E do',
    '          if g(v) > g(u) + l(u, v) then',
    '              g(v) = g(u) + l(u, v);  prev(v) = u',
    '              f(v) = g(v) + h(v);  decreasekey(H, v)',
  ],
};

/* ============================================================
 * 공통 탐색 골격: Dijkstra = (h ≡ 0, key = g),  A* = (key = f = g + h)
 * 두 알고리즘의 차이는 "우선순위 키"와 "h" 뿐이므로 한 곳에 구현하고,
 * dijkstra(), astar() 가 각각 자기 설정으로 호출한다.
 * ============================================================ */
function* bestFirstSearch(problem, start, goal, cfg) {
  const L = problem.label;
  const isA = cfg.astar;
  const D = isA ? 'g' : 'dist';           // 의사코드 표기
  const pq = new MinHeap(isA
    ? (a, b) => (a.f !== b.f ? a.f < b.f : a.h !== b.h ? a.h < b.h : a.seq < b.seq)
    : (a, b) => (a.g !== b.g ? a.g < b.g : a.seq < b.seq));
  const S = {
    name: isA ? 'A*' : 'Dijkstra',
    pq,
    g: new Map(),       // dist(n) 또는 g(n)
    h: isA ? new Map() : null,
    prev: new Map(),    // 부모(선행자) 포인터
    open: new Set(),    // 프론티어: H 안에 유효한 항목이 있는 노드
    closed: new Set(),  // deletemin 으로 확정된 노드
    current: null,      // 지금 이웃을 검사 중인 노드 u
    batch: new Map(),   // u 를 확장하면서 갱신된 이웃들 (node -> 'insert'|'decreasekey')
    op: null,           // 방금 수행한 연산 {type, title, lines[], line[], node, nbr, pushed}
    path: null, cost: null,
    steps: 0,           // deletemin 으로 확정한 노드 수
    micro: 0,           // 연산 수
    maxPQ: 0,
    done: false, found: false,
    log: [],
  };
  const H = (n) => {
    if (!isA) return 0;
    if (!S.h.has(n)) S.h.set(n, cfg.heuristic(n, goal));
    return S.h.get(n);
  };
  let seq = 0;
  // lines 는 "문자열 배열을 돌려주는 함수" → 화면에 그릴 때 현재 언어(tr)로 만들어짐.
  // 함수 안에서 쓰는 값은 호출 시점에 const 로 고정해 두어야 나중에 바뀌지 않는다.
  const op = (type, line, title, lines, extra = {}) => {
    S.op = { type, line, title, lines, ...extra };
    S.micro++;
    S.maxPQ = Math.max(S.maxPQ, pq.size);
    S.log.push({ n: S.micro, title, lines });
  };
  const keyText = (g, h) => (isA ? `f = ${fmt(g)} + ${fmt(h)} = ${fmt(g + h)}` : `key = ${fmt(g)}`);

  // 0) 준비 상태
  S.op = { type: 'ready', line: [], title: 'READY',
    lines: () => [tr('RUN 또는 STEP 을 누르면 탐색을 시작합니다.', 'Press RUN or STEP to start the search.')] };
  yield S;

  // 1) 초기화
  S.g.set(start, 0);
  const it0 = { node: start, g: 0, h: H(start), f: H(start), seq: seq++ };
  pq.push(it0);
  S.open.add(start);
  op('init', [1, 2, 3, 4], 'INIT', () => [
    tr(`모든 u 에 대해 ${D}(u) = ∞,  prev(u) = nil`, `for every u: ${D}(u) = ∞,  prev(u) = nil`),
    `${D}(${L(start)}) = 0` + (isA ? `,  h(${L(start)}) = ${fmt(it0.h)}` : ''),
    `H = makequeue({${L(start)}})   ${keyText(0, it0.h)}`,
  ], { node: start, pushed: it0.seq });
  yield S;

  while (pq.size) {
    // 2) deletemin
    const it = pq.pop();
    if (S.closed.has(it.node)) {
      op('stale', [5, 6], 'DELETEMIN · STALE', () => [
        `deletemin(H) → ${L(it.node)}  (${isA ? 'f' : 'key'} = ${fmt(isA ? it.f : it.g)})`,
        tr(`${L(it.node)} 은 이미 확정됨 → 예전 decreasekey 가 남긴 옛 항목이므로 버림`,
          `${L(it.node)} is already finalized → stale entry left by an earlier decreasekey, discard`),
      ], { node: it.node });
      S.current = null;
      yield S;
      continue;
    }
    const u = it.node, g = it.g;
    S.open.delete(u);
    S.closed.add(u);
    S.current = u;
    S.batch = new Map();
    S.steps++;
    const nFin = S.steps, nRem = pq.size;
    op('deletemin', [5, 6], 'DELETEMIN', () => [
      `u = deletemin(H) → ${L(u)}   ${keyText(g, it.h)}`,
      tr(`${D}(${L(u)}) = ${fmt(g)} 확정  (확정 노드 ${nFin}개, H 남은 항목 ${nRem}개)`,
        `${D}(${L(u)}) = ${fmt(g)} is final  (${nFin} finalized, ${nRem} entries left in H)`),
    ], { node: u });
    yield S;

    // 3) 도착 검사
    if (u === goal) {
      S.path = reconstructPath(S.prev, start, goal);
      S.cost = g;
      S.done = S.found = true;
      const pathStr = S.path.map(L).join(' → ');
      op('found', [7], 'GOAL REACHED', () => [
        tr(`u = t (${L(u)}) 이므로 종료`, `u = t (${L(u)}), stop`),
        tr(`최단 거리 = ${fmt(g)}`, `shortest distance = ${fmt(g)}`),
        tr(`경로: ${pathStr}`, `path: ${pathStr}`),
      ], { node: u });
      yield S;
      return;
    }

    // 4) 이웃 완화(relax)
    let nIns = 0, nDec = 0, nNo = 0;
    for (const { to: v, w } of problem.neighbors(u)) {
      if (S.closed.has(v)) continue; // 확정된 이웃은 조건이 항상 거짓 → 생략
      const old = S.g.has(v) ? S.g.get(v) : Infinity;
      const ng = g + w;
      if (ng < old - 1e-9) {
        const hv = H(v);
        S.g.set(v, ng);
        S.prev.set(v, u);
        S.open.add(v);
        const ni = { node: v, g: ng, h: hv, f: ng + hv, seq: seq++ };
        pq.push(ni);
        const ins = old === Infinity;
        S.batch.set(v, ins ? 'insert' : 'decreasekey');
        ins ? nIns++ : nDec++;
        op(ins ? 'insert' : 'decreasekey', [8, 9, 10, 11], ins ? 'RELAX · INSERT' : 'RELAX · DECREASEKEY', () => [
          tr(`간선 (${L(u)}, ${L(v)}),  l = ${fmt(w)}`, `edge (${L(u)}, ${L(v)}),  l = ${fmt(w)}`),
          `${D}(${L(v)}) > ${D}(${L(u)}) + l  :  ${fmt(old)} > ${fmt(g)} + ${fmt(w)} = ${fmt(ng)}  ✔`,
          `${D}(${L(v)}) = ${fmt(ng)};  prev(${L(v)}) = ${L(u)}` + (isA ? `;  f(${L(v)}) = ${fmt(ng)} + ${fmt(hv)} = ${fmt(ng + hv)}` : ''),
          ins ? tr(`${L(v)} 는 H에 없음 → insert(H, ${L(v)})`, `${L(v)} is not in H → insert(H, ${L(v)})`)
              : tr(`decreasekey(H, ${L(v)})   (구현: 새 키로 insert, 옛 항목은 stale)`,
                `decreasekey(H, ${L(v)})   (implemented as insert with the new key; old entry becomes stale)`),
        ], { node: u, nbr: v, pushed: ni.seq });
      } else {
        nNo++;
        op('norelax', [8, 9], 'RELAX · NO CHANGE', () => [
          tr(`간선 (${L(u)}, ${L(v)}),  l = ${fmt(w)}`, `edge (${L(u)}, ${L(v)}),  l = ${fmt(w)}`),
          `${D}(${L(v)}) > ${D}(${L(u)}) + l  :  ${fmt(old)} > ${fmt(ng)}  ✘`,
          tr('더 짧은 경로가 아니므로 변경 없음', 'not a shorter path → no change'),
        ], { node: u, nbr: v });
      }
      yield S;
    }
    const cIns = nIns, cDec = nDec, cNo = nNo, cRem = pq.size;
    op('expanded', [8], 'EXPAND DONE', () => [
      tr(`${L(u)} 의 이웃 검사 완료:  insert ${cIns} · decreasekey ${cDec} · 변경 없음 ${cNo}`,
        `finished neighbors of ${L(u)}:  insert ${cIns} · decreasekey ${cDec} · no change ${cNo}`),
      tr(`H 항목 ${cRem}개 → 다시 deletemin`, `${cRem} entries in H → deletemin again`),
    ], { node: u });
    yield S;
  }

  S.done = true;
  S.current = null;
  op('nopath', [5], 'NO PATH', () => [tr('H 가 비었음 → 도착점에 도달할 수 없음', 'H is empty → the goal is unreachable')]);
  yield S;
}

/* Dijkstra: 우선순위 = dist(n) */
function dijkstra(problem, start, goal) {
  return bestFirstSearch(problem, start, goal, { astar: false });
}

/* A*: 우선순위 = f(n) = g(n) + h(n),  동점이면 h 가 작은 노드 먼저 */
function astar(problem, start, goal, heuristic) {
  return bestFirstSearch(problem, start, goal, { astar: true, heuristic });
}
