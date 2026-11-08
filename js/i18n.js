'use strict';
/*
 * 한국어 / English 언어 선택
 *  - tr(ko, en): 현재 언어에 맞는 문자열을 돌려줌 (동적 문구용)
 *  - DICT + applyStatic(): HTML 의 data-i18n / data-i18n-html / data-i18n-title 요소를 번역
 *  - 선택한 언어는 브라우저에 기억 (localStorage, 실패해도 동작에는 지장 없음)
 */
let LANG = 'ko';
try { LANG = localStorage.getItem('spl-lang') === 'en' ? 'en' : 'ko'; } catch (e) { /* 저장소 사용 불가 */ }

function tr(ko, en) { return LANG === 'en' ? en : ko; }

const DICT = {
  hero: {
    ko: '그래프나 격자를 직접 만들고, 이진 최소 힙(우선순위 큐)에서 <b>키가 가장 작은 노드를 deletemin</b> 해 확정하고 이웃을 완화(relax)하는 과정을 한 연산씩 따라가 봅니다. A*는 키로 <code>f = g + h</code>를 써서 도착점 쪽으로 탐색을 좁힙니다.',
    en: 'Build a graph or a grid and follow, one operation at a time, how the algorithm <b>deletemins the node with the smallest key</b> from a binary min-heap (priority queue), finalizes it, and relaxes its neighbors. A* uses the key <code>f = g + h</code> to steer the search toward the goal.',
  },
  opt13: { ko: '큰 칸 13×9 (값 표시)', en: 'Large 13×9 (shows values)' },
  opt21: { ko: '보통 21×15', en: 'Medium 21×15' },
  opt31: { ko: '작은 칸 31×21', en: 'Small 31×21' },
  opt4: { ko: '4방향 (비용 1)', en: '4 directions (cost 1)' },
  opt8: { ko: '8방향 (대각선 √2)', en: '8 directions (diagonal √2)' },
  optMan: { ko: 'h: 맨해튼', en: 'h: Manhattan' },
  optEuc: { ko: 'h: 유클리드', en: 'h: Euclidean' },
  heurTitle: { ko: 'A* 휴리스틱', en: 'A* heuristic' },
  presetDefault: { ko: '기본 예제', en: 'Default' },
  presetRandom: { ko: '랜덤 장애물', en: 'Random walls' },
  presetMaze: { ko: '미로', en: 'Maze' },
  hintWeight: { ko: '가중치 라벨 클릭 → 수정 · EUCLIDEAN이면 이동 시 거리 갱신', en: 'click label to edit · EUCLIDEAN: moves update distance' },
  hintGrid: { ko: '드래그로 벽 그리기 / 벽에서 시작하면 지우기 · S, G는 드래그로 이동', en: 'drag to draw walls / start on a wall to erase · drag S, G to move them' },
  granOp: { ko: '연산 1개', en: '1 operation' },
  granNode: { ko: '노드 1개', en: '1 node' },
  chkValues: { ko: '값 표시', en: 'Values' },
  chkParents: { ko: 'prev 화살표', en: 'prev arrows' },
  chkWeights: { ko: '가중치', en: 'Weights' },
  lgStart: { ko: '시작 s', en: 'start s' },
  lgGoal: { ko: '도착 t', en: 'goal t' },
  lgOpen: { ko: 'H 안 (프론티어)', en: 'in H (frontier)' },
  lgClosed: { ko: '확정 (deletemin 완료)', en: 'finalized (deletemin done)' },
  lgCurrent: { ko: '현재 u', en: 'current u' },
  lgRelax: { ko: '검사 중인 간선 (u, v)', en: 'edge being relaxed (u, v)' },
  lgBatch: { ko: '이번 확장에서 갱신된 v', en: 'v updated while expanding u' },
  lgPath: { ko: '최단 경로', en: 'shortest path' },
  lgWall: { ko: '벽', en: 'wall' },
  stClosed: { ko: '확정 노드', en: 'Finalized' },
  stOpen: { ko: '프론티어', en: 'Frontier' },
  stHeap: { ko: '힙 크기', en: 'Heap size' },
  stOps: { ko: '연산 수', en: 'Operations' },
  stCost: { ko: '경로 비용', en: 'Path cost' },
  cmpNote: { ko: '같은 맵 · 같은 연산 수만큼 동시에 진행 · 클릭하면 위 화면 전환', en: 'same map · advanced in lockstep · click to switch the main view' },
  logNote: { ko: '연산 기록 (펼치기)', en: 'operation history (expand)' },
  footer: {
    ko: '단축키 <kbd>Space</kbd> RUN / PAUSE · <kbd>→</kbd> STEP · <kbd>E</kbd> FINISH · <kbd>R</kbd> RESET · <kbd>1</kbd>/<kbd>2</kbd> Dijkstra / A* · 칸·노드에 마우스를 올리면 g, h, f, prev 툴팁',
    en: 'Shortcuts <kbd>Space</kbd> RUN / PAUSE · <kbd>→</kbd> STEP · <kbd>E</kbd> FINISH · <kbd>R</kbd> RESET · <kbd>1</kbd>/<kbd>2</kbd> Dijkstra / A* · hover a cell or node for g, h, f, prev',
  },
};

function applyStatic() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const d = DICT[el.dataset.i18n]; if (d) el.textContent = d[LANG];
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const d = DICT[el.dataset.i18nHtml]; if (d) el.innerHTML = d[LANG];
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const d = DICT[el.dataset.i18nTitle]; if (d) el.title = d[LANG];
  });
  document.querySelectorAll('#seg-lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === LANG));
}

function setLang(l) {
  LANG = l === 'en' ? 'en' : 'ko';
  try { localStorage.setItem('spl-lang', LANG); } catch (e) { /* 무시 */ }
  applyStatic();
}
