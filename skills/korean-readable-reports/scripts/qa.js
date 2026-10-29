#!/usr/bin/env node
'use strict';
/**
 * 렌더 후 검사 — 만든 HTML을 헤드리스 Chrome/Edge로 화면 폭마다 열어 본다(의존성 없음, 설치된 브라우저만 씀)
 *
 *   node qa.js report.html
 *   exit 0 = 문제 없음 · 1 = 문제 있음 · 2 = 입력 파일·브라우저 없음 또는 측정 실패
 *
 *   보는 것(1280 / 768 / 390px, 라이트):
 *     넘침    글자·상자가 자기 칸 밖으로 나가거나 잘림(카드는 overflow:hidden이라 잘린 글자가 아예 안 보인다).
 *             가로 스크롤이 원래 허용된 곳(표·코드·Mermaid)과 말줄임(…) 처리된 상단 제목은 뺀다
 *     앵커    #링크가 가리키는 id가 없음(목차·본문 링크)
 *     이미지  불러오지 못한 그림
 *     그림    ```svg·```bars 안 글자가 자기 상자·그림 밖으로 나감, 다른 상자나 글자와 겹침(폭과 무관하게 한 번만 보고)
 *     연결선  svg의 ln·node·lbl만 첫 폭에서 루트 SVG 단위로 검사(관통·라벨 근접·겹침·연결점·모서리·테두리). 경고만, 표본 상한 초과는 미검사
 *     파일    상대 링크가 가리키는 파일이 없음(옆 보고서 md를 렌더하지 않아 .html이 없는 경우 등)
 *     Mermaid 문법 오류로 그림 대신 소스가 보임 · 같은 id를 받은 그림(한 칸에 포개짐) — 문제.
 *             12초 안에 안 그려짐(CDN이 막혔거나 느림)·접힌 칸 안이라 미검사 — 알리기만
 *   브라우저 위치를 바꾸려면 KRR_BROWSER=경로. macOS는 Playwright의 chrome-headless-shell이 있으면 먼저 쓴다
 *
 * 사례: 2026-09-30 flow 설명의 `InvoiceMailStatusNotifyTasklet의`가 카드 밖으로 37px 삐져나온 것을 눈으로 보고서야 찾았다
 * (design-guide.md "좁은 카드의 긴 이름"). 이 검사가 그런 넘침을 렌더 직후에 잡는다.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');

const WIDTHS = [1280, 768, 390];

function findBrowser() {
  const env = process.env.KRR_BROWSER;
  if (env) return fs.existsSync(env) ? env : null;
  const cands = process.platform === 'win32'
    ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
        .flatMap(d => [path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe')])
    : process.platform === 'darwin'
      ? ['Google Chrome', 'Microsoft Edge', 'Chromium'].map(n => `/Applications/${n}.app/Contents/MacOS/${n}`)
      : (process.env.PATH || '').split(':').flatMap(d => ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'].map(n => path.join(d, n)));
  // macOS: node가 띄운 Chrome 앱은 화면 동기화(CVDisplayLink)를 못 얻어 Mermaid가 있는 페이지에서 끝나지 않았다
  // (2026-10-29 실측: 같은 페이지가 셸에서 직접 3초, node에서 50초 초과). 화면이 필요 없는 chrome-headless-shell
  // (Playwright가 설치)은 1.5초 — 있으면 먼저 쓴다
  if (process.platform === 'darwin') {
    const root = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
    let shells = [];
    try {
      shells = fs.readdirSync(root).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse()
        .flatMap(d => ['arm64', 'x64'].map(a => path.join(root, d, `chrome-headless-shell-mac-${a}`, 'chrome-headless-shell')));
    } catch (e) { /* 없으면 Chrome 앱 */ }
    cands.unshift(...shells);
  }
  return cands.find(p => fs.existsSync(p)) || null;
}

// 헤드리스 창은 500px보다 좁아지지 않는다(2026-10-21 Chrome 실측: 390 요청 → 500). 그래서 창 하나에 폭별 iframe을 두고
// 그 안에서 잰다 — 미디어 쿼리는 iframe 폭을 따르므로 실제 휴대폰 폭과 같다. srcdoc iframe은 부모와 같은 출처라 안을 읽을 수 있다
const HARNESS = (src, widths) => `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
var SRC = ${JSON.stringify(src).replace(/</g, '\\u003c')}, WIDTHS = ${JSON.stringify(widths)}, results = [];
var SKIP = 'script, style, pre, .code-dark, .mermaid, svg, .table-wrap, .topbar, .toc';
function name(el) { return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''); }
function connectors(svg, fig, figs, unchecked) {
  var rootInverse = svg.getScreenCTM().inverse(), point = svg.createSVGPoint();
  var dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  var convert = function (x, y, matrix) { point.x = x; point.y = y; return point.matrixTransform(matrix).matrixTransform(rootInverse); };
  var bounds = function (points) {
    return points.reduce(function (b, p) { return { l: Math.min(b.l, p.x), t: Math.min(b.t, p.y), r: Math.max(b.r, p.x), b: Math.max(b.b, p.y) }; }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
  };
  var nearBox = function (a, b, pad) { return a.l <= b.r + pad && a.r >= b.l - pad && a.t <= b.b + pad && a.b >= b.t - pad; };
  var inBox = function (p, b, pad) { return p.x >= b.l - pad && p.x <= b.r + pad && p.y >= b.t - pad && p.y <= b.b + pad; };
  var corners = function (el, matrix) {
    var b = el.getBBox();
    return [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]].map(function (p) { return convert(p[0], p[1], matrix); });
  };
  var describe = function (el, i) {
    var matrix = el.getScreenCTM(), m = rootInverse.multiply(matrix), length = el.getTotalLength();
    // 가장 많이 늘어나는 방향으로 표본 간격을 정해 비균일 scale·회전에서도 1단위를 넘지 않게 한다.
    var sum = m.a * m.a + m.b * m.b + m.c * m.c + m.d * m.d, det = m.a * m.d - m.b * m.c;
    var scale = Math.sqrt((sum + Math.sqrt(Math.max(0, sum * sum - 4 * det * det))) / 2);
    return { el: el, id: i + 1, matrix: matrix, inverse: matrix.inverse(), length: length, steps: Math.ceil(length * scale), corners: corners(el, matrix) };
  };
  var lines = [].map.call(svg.querySelectorAll('path.ln, line.ln, polyline.ln'), describe);
  if (!lines.length) return;
  var nodes = [].map.call(svg.querySelectorAll('rect.node, polygon.node, circle.node, ellipse.node, path.node'), describe);
  // 노드 외곽 표본도 예산에 넣는다 — 복잡한 도형의 안쪽 2단위 판정이 브라우저를 붙잡지 않게 한다.
  var count = lines.concat(nodes).reduce(function (n, g) { return n + g.steps + 1; }, 0);
  if (!Number.isFinite(count) || count > 40000) { unchecked.push({ fig: fig, why: '표본 ' + count + '개가 상한 40000을 넘음' }); return; }
  var sample = function (g) {
    g.points = []; g.segments = []; g.total = 0;
    for (var i = 0; i <= g.steps; i++) {
      var local = g.el.getPointAtLength(g.steps ? g.length * i / g.steps : 0), p = convert(local.x, local.y, g.matrix);
      var prev = g.points[i - 1], step = prev ? dist(prev, p) : 0;
      // 이동 명령 M은 길이가 0이다. 큰 도약은 선분으로 잇지 않아 빈 구간을 관통으로 오인하지 않는다.
      p.join = !!prev && step <= 1.5;
      if (p.join) { g.total += step; g.segments.push({ a: prev, b: p, line: g.id }); }
      p.along = g.total; g.points.push(p);
    }
    g.box = bounds(g.corners);
    g.ends = [g.points[0], g.points[g.points.length - 1]];
  };
  lines.concat(nodes).forEach(sample);
  // 열린 path도 채움은 각 subpath를 닫는다. 길이 API가 빼는 닫는 변을 보완해야 테두리 근처를 관통으로 오인하지 않는다.
  var closures = [];
  nodes.filter(function (node) { return node.el.tagName.toLowerCase() === 'path'; }).forEach(function (node) {
    var first = node.points[0];
    node.points.forEach(function (p, i) {
      if (i && !p.join) { closures.push({ node: node, a: node.points[i - 1], b: first }); first = p; }
    });
    closures.push({ node: node, a: node.ends[1], b: first });
  });
  closures.forEach(function (c) { c.steps = Math.ceil(dist(c.a, c.b)); count += c.steps; });
  if (count > 40000) { unchecked.push({ fig: fig, why: '표본 ' + count + '개가 상한 40000을 넘음' }); return; }
  closures.forEach(function (c) {
    var prev = c.a;
    for (var i = 1; i <= c.steps; i++) {
      var p = { x: c.a.x + (c.b.x - c.a.x) * i / c.steps, y: c.a.y + (c.b.y - c.a.y) * i / c.steps };
      c.node.segments.push({ a: prev, b: p, line: c.node.id }); prev = p;
    }
  });
  var distance = function (p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
    var t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  // 짧은 선분을 공간 격자에 보관해 가까운 표본끼리만 비교한다(긴 선의 표본 전체를 매번 훑지 않음).
  var grid = function (segments) {
    var cells = new Map();
    segments.forEach(function (s) {
      for (var x = Math.floor(Math.min(s.a.x, s.b.x) / 4); x <= Math.floor(Math.max(s.a.x, s.b.x) / 4); x++) {
        for (var y = Math.floor(Math.min(s.a.y, s.b.y) / 4); y <= Math.floor(Math.max(s.a.y, s.b.y) / 4); y++) {
          var key = x + ',' + y; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(s);
        }
      }
    });
    return cells;
  };
  var nearby = function (cells, p, visit) {
    var x = Math.floor(p.x / 4), y = Math.floor(p.y / 4);
    for (var a = x - 1; a <= x + 1; a++) for (var b = y - 1; b <= y + 1; b++) {
      var cell = cells.get(a + ',' + b); if (cell) cell.forEach(visit);
    }
  };
  var reported = new Set();
  var warn = function (kind, line, node, other, text) {
    var key = [kind, line, node, other].join('|'); if (reported.has(key)) return; reported.add(key);
    figs.push({ fig: fig, level: 'warn', kind: kind, line: line, node: node, other: other, px: 0, text: text });
  };
  var at = function (p) { return '(' + Math.round(p.x) + ', ' + Math.round(p.y) + ')'; };
  var labels = [].map.call(svg.querySelectorAll('text.lbl'), function (el, i) { return { id: i + 1, box: bounds(corners(el, el.getScreenCTM())), text: (el.textContent || '').trim().slice(0, 30) }; });
  nodes.forEach(function (node) {
    node.box = bounds(node.corners); node.boundary = grid(node.segments); node.ports = [];
  });
  lines.forEach(function (line) {
    labels.forEach(function (label) {
      if (!nearBox(line.box, label.box, 6)) return;
      // 문서 기준이 "6~10 띄움"이라 딱 6은 통과 — 6 미만만 붙음
      var p = line.points.find(function (p) { return p.x > label.box.l - 6 && p.x < label.box.r + 6 && p.y > label.box.t - 6 && p.y < label.box.b + 6; });
      if (p) warn('라벨이 선에 붙음', line.id, 0, label.id, '라벨 ' + label.id + ' “' + label.text + '” 근처 ' + at(p));
    });
    nodes.forEach(function (node) {
      if (!nearBox(line.box, node.box, 4)) return;
      var hit = line.points.find(function (p) {
        if (p.along <= 12 || line.total - p.along <= 12 || !inBox(p, node.box, -2)) return false;
        point.x = p.x; point.y = p.y;
        var local = point.matrixTransform(svg.getScreenCTM()).matrixTransform(node.inverse);
        if (!node.el.isPointInFill(local)) return false;
        var border = false;
        nearby(node.boundary, p, function (s) { if (distance(p, s.a, s.b) <= 2) border = true; });
        return !border;
      });
      if (hit) warn('선이 상자를 지나감', line.id, node.id, 0, '노드 ' + node.id + ' 내부 ' + at(hit));
      if (node.el.tagName.toLowerCase() !== 'rect') return;
      var edges = node.corners.map(function (a, i) { var b = node.corners[(i + 1) % 4]; return { a: a, b: b, length: dist(a, b) }; });
      line.ends.forEach(function (p, role) {
        var edge = -1, nearest = Infinity;
        edges.forEach(function (e, i) { var d = distance(p, e.a, e.b); if (d < nearest) { nearest = d; edge = i; } });
        if (nearest > 4) return;
        var e = edges[edge], along = ((p.x - e.a.x) * (e.b.x - e.a.x) + (p.y - e.a.y) * (e.b.y - e.a.y)) / e.length;
        node.ports.push({ line: line.id, role: role, edge: edge, along: along, minimum: e.length < 48 ? 8 : 12 });
        // 변 위 위치로 잰다 — 테두리 2 앞에서 멈춘 선은 모서리와의 직선거리가 늘어 7.8 떨어진 점을 놓쳤다
        if (along < 8 - 0.001 || along > e.length - 8 + 0.001) warn('모서리에 연결', line.id, node.id, 0, '노드 ' + node.id + ' 모서리 근처 ' + at(p));
      });
      edges.forEach(function (edge, index) {
        var run = 0;
        line.points.forEach(function (p, i) {
          var a = line.points[i - 1], dx = a ? p.x - a.x : 0, dy = a ? p.y - a.y : 0;
          var ex = edge.b.x - edge.a.x, ey = edge.b.y - edge.a.y;
          var parallel = Math.abs(dx * ey - dy * ex) <= 0.01 * edge.length;
          if (p.join && (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) && parallel && distance(a, edge.a, edge.b) <= 2 && distance(p, edge.a, edge.b) <= 2) run += dist(a, p);
          else run = 0;
          if (run > 4 + 0.001) warn('테두리를 따라감', line.id, node.id, 0, '노드 ' + node.id + '의 변 ' + (index + 1) + ' 근처 ' + at(p));
        });
      });
    });
  });
  nodes.forEach(function (node) {
    // 같은 변·역할끼리 정렬해 가까운 연결점만 비교한다.
    node.ports.sort(function (a, b) { return a.edge - b.edge || a.role - b.role || a.along - b.along; });
    node.ports.forEach(function (p, i) {
      for (var j = i - 1; j >= 0; j--) {
        var prev = node.ports[j];
        if (prev.edge !== p.edge || prev.role !== p.role || p.along - prev.along >= p.minimum) break;
        if (prev.line !== p.line) warn('연결점이 붙음', p.line, node.id, prev.line, prev.line + '번 선과 노드 ' + node.id + '의 같은 변, 간격 ' + Math.round((p.along - prev.along) * 10) / 10);
      }
    });
  });
  var strokes = grid(lines.flatMap(function (line) { return line.segments; }));
  lines.forEach(function (line) {
    var runs = new Map();
    line.points.forEach(function (p, i) {
      var matches = new Set();
      nearby(strokes, p, function (s) {
        if (s.line === line.id || matches.has(s.line)) return;
        var other = lines[s.line - 1];
        if (!nearBox(line.box, other.box, 1) || distance(p, s.a, s.b) > 1) return;
        // 머리-꼬리 이음만 8단위 제외한다. 분기·합류의 공통 줄기는 처음부터 센다.
        if ((dist(line.ends[0], other.ends[1]) <= 1 && dist(p, line.ends[0]) < 8) || (dist(line.ends[1], other.ends[0]) <= 1 && dist(p, line.ends[1]) < 8)) return;
        matches.add(s.line);
      });
      matches.forEach(function (id) {
        var prev = runs.get(id), run = prev && prev.index === i - 1 && p.join ? prev.run + dist(p, line.points[i - 1]) : 0;
        runs.set(id, { index: i, run: run });
        if (run > 4 + 0.001) warn('선이 겹침', Math.min(line.id, id), 0, Math.max(line.id, id), Math.max(line.id, id) + '번 선과 4단위 넘게 겹침 ' + at(p));
      });
    });
  });
}
function measure(f, w) {
  var win = f.contentWindow, doc = f.contentDocument, de = doc.documentElement, over = [];
  // 클릭을 받지 않는 절대 위치 장식(flow 화살표 SVG)은 상자 밖으로 조금 나가도 글자가 잘리지 않는다 — 재는 동안 숨긴다
  [].forEach.call(doc.querySelectorAll('body *'), function (el) { var s = win.getComputedStyle(el); if (/absolute|fixed/.test(s.position) && s.pointerEvents === 'none') el.style.display = 'none'; });
  if (de.scrollWidth > de.clientWidth + 1) over.push({ el: '페이지 전체(가로 스크롤)', px: de.scrollWidth - de.clientWidth, text: '' });
  var hit = [].filter.call(doc.querySelectorAll('body *'), function (el) {
    if (el.closest(SKIP) || !el.clientWidth) return false;
    var s = win.getComputedStyle(el);
    if (/auto|scroll/.test(s.overflowX) || s.textOverflow === 'ellipsis') return false;
    return el.scrollWidth > el.clientWidth + 1;
  });
  // 바깥 상자는 안쪽 넘침 때문에 같이 걸린다 — 가장 안쪽만 보고
  hit.filter(function (el) { return !hit.some(function (o) { return o !== el && el.contains(o); }); }).forEach(function (el) {
    over.push({ el: name(el), px: el.scrollWidth - el.clientWidth, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 50) });
  });
  var anchors = [].map.call(doc.querySelectorAll('a[href^="#"]'), function (a) { return a.getAttribute('href').slice(1); })
    .filter(function (h) { if (!h) return false; try { h = decodeURIComponent(h); } catch (e) {} return !doc.getElementById(h); });
  var images = [].filter.call(doc.images, function (i) { return i.complete && !i.naturalWidth; }).map(function (i) { return i.getAttribute('src'); });
  // 그림(svg·bars 블록 — 이 HARNESS는 템플릿 문자열이라 백틱을 쓰지 않는다): 글자 넘침·겹침은 화면 좌표로 잰다.
  // 연결선은 첫 폭에서만 루트 SVG 좌표로 잰다 — 그룹 변환은 반영하되 화면 축소에 임계값이 바뀌지 않게 한다.
  // 글자의 "집" = 글자 가운데를 품은 가장 작은 rect. 집 밖으로 가로로 나가면 넘침, 집이 아닌 rect와 겹치면 겹침
  var figs = [], unchecked = [];
  [].forEach.call(doc.querySelectorAll('.fig > svg'), function (svg, k) {
    var box = function (el) { var r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    var meet = function (a, b) { return [Math.min(a.r, b.r) - Math.max(a.l, b.l), Math.min(a.b, b.b) - Math.max(a.t, b.t)]; };
    var has = function (p, x, y) { return x >= p.l && x <= p.r && y >= p.t && y <= p.b; };
    var S = box(svg), rects = [].map.call(svg.querySelectorAll('rect'), box);
    var texts = [].map.call(svg.querySelectorAll('text'), function (el) { return { b: box(el), s: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30) }; })
      .filter(function (t) { return t.s && t.b.r > t.b.l; });
    var add = function (kind, px, s) { figs.push({ fig: k + 1, level: 'error', line: 0, node: 0, kind: kind, px: Math.round(px), text: s }); };
    texts.forEach(function (t, i) {
      var cx = (t.b.l + t.b.r) / 2, cy = (t.b.t + t.b.b) / 2;
      var out = Math.max(S.l - t.b.l, t.b.r - S.r);
      if (out > 1) add('그림 밖으로 나감', out, t.s);
      var home = rects.filter(function (r) { return has(r, cx, cy); })
        .sort(function (a, b) { return (a.r - a.l) * (a.b - a.t) - (b.r - b.l) * (b.b - b.t); })[0];
      if (home) { var o = Math.max(home.l - t.b.l, t.b.r - home.r); if (o > 1) add('상자 밖으로 나감', o, t.s); }
      rects.forEach(function (r) { if (has(r, cx, cy)) return; var m = meet(t.b, r); if (m[0] > 2 && m[1] > 2) add('상자와 겹침', m[0], t.s); });
      texts.slice(i + 1).forEach(function (u) { var m = meet(t.b, u.b); if (m[0] > 2 && m[1] > 2) add('글자끼리 겹침', m[0], t.s + ' / ' + u.s); });
    });
    // 빈 경로·크기 0 도형·역행렬 없는 transform은 기하 API가 예외를 던진다 — 그 그림만 미검사로 두고 나머지 검사는 살린다
    if (w === WIDTHS[0]) {
      if (!svg.getScreenCTM() || !svg.getBoundingClientRect().width) unchecked.push({ fig: k + 1, why: '보이지 않는 그림(접힌 칸 등)' });
      else try { connectors(svg, k + 1, figs, unchecked); } catch (e) { unchecked.push({ fig: k + 1, why: '측정 오류 — ' + e.message }); }
    }
  });
  return { want: w, width: win.innerWidth, over: over, anchors: anchors, images: images, figs: figs, unchecked: unchecked };
}
function next(i) {
  if (i === WIDTHS.length) { var p = document.createElement('pre'); p.textContent = 'KRRQA' + encodeURIComponent(JSON.stringify(results)) + 'KRRQA'; document.body.appendChild(p); return; }
  var f = document.createElement('iframe');
  f.style.cssText = 'width:' + WIDTHS[i] + 'px;height:900px;border:0;display:block';
  f.onload = function () {
    var fonts = f.contentDocument.fonts;
    (fonts ? fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { results.push(measure(f, WIDTHS[i])); f.remove(); next(i + 1); }, 300); });
  };
  f.srcdoc = SRC;
  document.body.appendChild(f);
}
next(0);
</script></body></html>`;

// 브라우저를 한 번 띄워 page를 열고, 페이지가 MARK…MARK 사이에 적은 결과를 읽는다.
// 프로필 폴더는 실행마다 따로 — 앞 브라우저가 아직 닫히는 중이면 같은 프로필을 잠가 두어 다음 실행이 90초 동안 멈췄다
function dump(browser, tmp, page, mark, wait, limit = 90000) {
  const r = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--user-data-dir=${path.join(tmp, 'profile-' + mark)}`, '--window-size=1400,1000', wait, '--dump-dom', pathToFileURL(page).href],
    {encoding: 'utf8', timeout: limit, maxBuffer: 64 * 1024 * 1024});
  // 결과 앞뒤 표식만 찾는다 — 페이지 안 스크립트 소스에 적힌 표식("+…+")은 따옴표가 있어 걸리지 않는다
  const m = [...(r.stdout || '').matchAll(new RegExp(mark + '([^<\\s"]*)' + mark, 'g'))].pop();
  if (!m) return {error: (r.error && r.error.message) || (r.stderr || '').trim().split('\n').pop() || '결과 표식 없음'};
  return {value: JSON.parse(decodeURIComponent(m[1]))};
}

// Mermaid 검사는 폭별 iframe 밖에서 원래 페이지 그대로 한 번. 폭별 iframe 안에서 CDN 모듈을 받으면 Mermaid 있는 문서 하나에
// 66초가 걸려(2026-10-29 실측, 제한 90초) 폭 검사에서는 모듈을 빼고, 그림은 여기서 따로 본다.
// 접힌 <details> 안(data-pending)은 펼칠 때 그리므로 미검사로 센다
const MM_PROBE = `<script>(function () {
  var t0 = Date.now(), all = function () { return [].slice.call(document.querySelectorAll('pre.mermaid')); };
  var settled = function () { return all().every(function (p) { return p.hasAttribute('data-processed') || p.hasAttribute('data-pending') || p.classList.contains('mermaid-error'); }); };
  var done = function () {
    var r = { error: 0, missing: 0, pending: 0, dup: 0 }, ids = {};
    all().forEach(function (p) {
      if (p.classList.contains('mermaid-error')) r.error++;
      else if (p.hasAttribute('data-pending')) r.pending++;
      else if (!p.hasAttribute('data-processed') || !p.querySelector('svg')) r.missing++;
      var s = p.querySelector('svg[id]'); if (s) ids[s.id] = (ids[s.id] || 0) + 1;
    });
    for (var k in ids) if (ids[k] > 1) r.dup += ids[k];
    var o = document.getElementById('krr-qa-mm') || document.body.appendChild(document.createElement('pre'));
    o.id = 'krr-qa-mm'; o.textContent = 'KRRMM' + encodeURIComponent(JSON.stringify(r)) + 'KRRMM';
  };
  // 다 그려지거나(오류 포함) 12초가 지날 때까지 0.2초마다 상태를 다시 적는다(마지막 것만 읽음)
  window.addEventListener('load', function () { done(); (function again() { if (!settled() && Date.now() - t0 < 12000) setTimeout(function () { done(); again(); }, 200); })(); });
})();</script>`;

function measure(browser, file) {
  // <base>로 원래 폴더를 가리켜 상대 경로 그림이 그대로 열리게 한다
  const base = `<base href="${pathToFileURL(path.dirname(path.resolve(file))).href}/">`;
  const html = fs.readFileSync(file, 'utf8').replace(/<head([^>]*)>/i, m => m + base);
  // 폭 검사에서는 Mermaid 모듈을 뺀다(render.js --offline과 같은 방식) — Mermaid 칸은 원래 가로 스크롤이라 넘침 검사 대상이 아니다
  const src = html.replace(/<script type="module">[\s\S]*?<\/script>/g, '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krr-qa-'));
  try {
    const page = path.join(tmp, 'page.html');
    fs.writeFileSync(page, HARNESS(src, WIDTHS));
    const q = dump(browser, tmp, page, 'KRRQA', '--virtual-time-budget=15000');
    if (q.error) return q;
    let mermaid = null;
    if (/<pre class="mermaid/.test(html) && /<script type="module">/.test(html)) {
      // 임시 폴더에 쓴다(<base>가 원래 폴더를 가리켜 상대 경로는 그대로 열림) — 보고서 폴더에는 아무것도 만들지 않는다
      const mpage = path.join(tmp, 'mermaid.html');
      try {
        fs.writeFileSync(mpage, html.replace(/<\/body>/i, () => MM_PROBE + '</body>'));
        // 45초 상한: CDN이 막힌 환경(폐쇄망·샌드박스)에서는 브라우저가 끝나지 않고 기다린다
        const r = dump(browser, tmp, mpage, 'KRRMM', '--virtual-time-budget=20000', 45000);
        mermaid = r.error ? {failed: r.error} : r.value;
      } catch (e) { mermaid = {failed: e.message}; }
    }
    return {results: q.value, mermaid};
  } finally {
    try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (e) { /* 브라우저가 프로필을 늦게 놓으면 남는다 — tmp라 둔다 */ }
  }
}

// 파일 링크: render.js는 옆 보고서 md 링크를 .html로 바꾸는데, 그 md를 렌더하지 않으면 독자는 빈 페이지를 연다.
// 브라우저 없이 파일이 있는지만 본다(주소·#앵커·메일 링크 제외)
function missingFiles(file) {
  const dir = path.dirname(path.resolve(file));
  const hrefs = [...fs.readFileSync(file, 'utf8').matchAll(/<a\s[^>]*?href="([^"#?][^"]*)"/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  return [...new Set(hrefs.filter(h => !/^[a-z][\w+.-]*:|^\/\//i.test(h)).map(h => h.replace(/[#?].*$/, '')))]
    .filter(h => { let p = h; try { p = decodeURIComponent(h); } catch (e) { /* 그대로 */ } return !fs.existsSync(path.resolve(dir, p)); });
}

function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('사용: node qa.js report.html'); return 2; }
  const browser = findBrowser();
  if (!browser) { console.error('qa: Chrome·Edge를 찾지 못했습니다 — 설치하거나 KRR_BROWSER=브라우저경로 로 지정하세요'); return 2; }
  console.log(`qa: ${file}`);
  const m = measure(browser, file);
  if (m.error) { console.log(`  측정 실패 — ${m.error}`); return 2; }
  let problems = 0, failed = 0;
  const anchors = new Set(), images = new Set(), figs = new Map(), unchecked = new Map();
  for (const r of m.results) {
    // 화면 폭이 요청과 다르면 그 폭은 잰 것이 아니다(세로 스크롤 막대 몫은 허용)
    if (Math.abs(r.width - r.want) > 20) { failed++; console.log(`  ${r.want}px: 측정 실패 — 실제 화면 폭 ${r.width}px`); continue; }
    problems += r.over.length;
    console.log(`  ${r.want}px: 넘침 ${r.over.length}곳`);
    for (const o of r.over) console.log(`    - ${o.px}px  ${o.el}${o.text ? `  "${o.text}"` : ''}`);
    r.anchors.forEach(a => anchors.add(a)); r.images.forEach(i => images.add(i));
    // 그림은 폭에 비례해 줄 뿐이라 어느 폭에서나 같은 곳이 걸린다 — 한 번만, 가장 큰 폭(px)으로
    for (const f of r.figs) { const key = `${f.fig}|${f.level}|${f.line}|${f.node}|${f.other || 0}|${f.kind}|${f.text}`; if (!figs.has(key) || figs.get(key).px < f.px) figs.set(key, f); }
    for (const f of r.unchecked) unchecked.set(f.fig, f.why);
  }
  if (anchors.size) console.log(`  가리키는 곳이 없는 #링크 ${anchors.size}개: ${[...anchors].map(a => '#' + a).join(', ')}`);
  if (images.size) console.log(`  불러오지 못한 그림 ${images.size}개: ${[...images].join(', ')}`);
  const errors = [...figs.values()].filter(f => f.level === 'error'), warnings = [...figs.values()].filter(f => f.level === 'warn');
  if (errors.length) {
    console.log(`  그림 안 글자 문제 ${errors.length}곳 — 상자를 넓히거나 글자를 줄이거나 좌표를 옮기기:`);
    for (const f of errors) console.log(`    - 그림 ${f.fig}: ${f.kind} ${f.px}px  "${f.text}"`);
  }
  if (warnings.length) console.log(`  그림 연결선 경고 ${warnings.length}곳 — 문제 수에는 넣지 않음. 선을 직각으로 돌려 상자·라벨을 피하고 연결점을 12 이상 띄우기:`);
  for (const f of warnings) console.log(`    - 그림 ${f.fig} 선 ${f.line}: ${f.kind}  ${f.text}`);
  for (const [fig, why] of unchecked) console.log(`  그림 ${fig} 연결선 미검사 — ${why}`);
  const mm = m.mermaid;
  // 폭 검사는 이미 끝났으므로 Mermaid만 못 본 것은 측정 실패(exit 2)로 치지 않고 알린다
  if (mm && mm.failed) console.log(`  Mermaid 미검사 — ${mm.failed}. CDN이 막혔거나 브라우저가 시간 안에 끝나지 않음 등, 브라우저로 열어 확인`);
  else if (mm) {
    if (mm.error) console.log(`  Mermaid 문법 오류 ${mm.error}개 — 그림 대신 소스 글자가 보임("문법 오류" 상자를 찾아 고치기)`);
    if (mm.dup) console.log(`  Mermaid 그림 ${mm.dup}개가 같은 id — 한 칸에 포개져 그려짐(템플릿 renderOne의 고유 id 확인)`);
    if (mm.missing) console.log(`  Mermaid ${mm.missing}개가 12초 안에 그려지지 않음 — CDN이 막혔거나(폐쇄망·샌드박스) 느림. 문제 수에는 넣지 않으니 브라우저로 열어 확인`);
    if (mm.pending) console.log(`  접힌 칸 안 Mermaid ${mm.pending}개는 펼칠 때 그리므로 미검사`);
    problems += mm.error + mm.dup;
  }
  problems += anchors.size + images.size + errors.length;
  const files = missingFiles(file);
  if (files.length) console.log(`  없는 파일로 가는 링크 ${files.length}개: ${files.join(', ')} — 옆 보고서(-근거.md 등)면 그 md도 렌더하기`);
  problems += files.length;
  if (failed) return 2;
  return problems ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = {findBrowser, missingFiles};
