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
 *   브라우저 위치를 바꾸려면 KRR_BROWSER=경로
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
  return cands.find(p => fs.existsSync(p)) || null;
}

// 헤드리스 창은 500px보다 좁아지지 않는다(2026-10-21 Chrome 실측: 390 요청 → 500). 그래서 창 하나에 폭별 iframe을 두고
// 그 안에서 잰다 — 미디어 쿼리는 iframe 폭을 따르므로 실제 휴대폰 폭과 같다. srcdoc iframe은 부모와 같은 출처라 안을 읽을 수 있다
const HARNESS = (src, widths) => `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
var SRC = ${JSON.stringify(src).replace(/</g, '\\u003c')}, WIDTHS = ${JSON.stringify(widths)}, results = [];
var SKIP = 'script, style, pre, .code-dark, .mermaid, svg, .table-wrap, .topbar, .toc';
function name(el) { return el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''); }
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
  return { want: w, width: win.innerWidth, over: over, anchors: anchors, images: images };
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

function measure(browser, file) {
  // <base>로 원래 폴더를 가리켜 상대 경로 그림이 그대로 열리게 한다
  const base = `<base href="${pathToFileURL(path.dirname(path.resolve(file))).href}/">`;
  const src = fs.readFileSync(file, 'utf8').replace(/<head([^>]*)>/i, m => m + base);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krr-qa-'));
  try {
    const page = path.join(tmp, 'page.html');
    fs.writeFileSync(page, HARNESS(src, WIDTHS));
    const r = spawnSync(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      `--user-data-dir=${path.join(tmp, 'profile')}`, '--window-size=1400,1000', '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(page).href],
      {encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024});
    const m = (r.stdout || '').match(/KRRQA([^<\s]*)KRRQA/);
    if (!m) return {error: (r.error && r.error.message) || (r.stderr || '').trim().split('\n').pop() || '결과 표식 없음'};
    return {results: JSON.parse(decodeURIComponent(m[1]))};
  } finally {
    try { fs.rmSync(tmp, {recursive: true, force: true}); } catch (e) { /* 브라우저가 프로필을 늦게 놓으면 남는다 — tmp라 둔다 */ }
  }
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
  const anchors = new Set(), images = new Set();
  for (const r of m.results) {
    // 화면 폭이 요청과 다르면 그 폭은 잰 것이 아니다(세로 스크롤 막대 몫은 허용)
    if (Math.abs(r.width - r.want) > 20) { failed++; console.log(`  ${r.want}px: 측정 실패 — 실제 화면 폭 ${r.width}px`); continue; }
    problems += r.over.length;
    console.log(`  ${r.want}px: 넘침 ${r.over.length}곳`);
    for (const o of r.over) console.log(`    - ${o.px}px  ${o.el}${o.text ? `  "${o.text}"` : ''}`);
    r.anchors.forEach(a => anchors.add(a)); r.images.forEach(i => images.add(i));
  }
  if (anchors.size) console.log(`  가리키는 곳이 없는 #링크 ${anchors.size}개: ${[...anchors].map(a => '#' + a).join(', ')}`);
  if (images.size) console.log(`  불러오지 못한 그림 ${images.size}개: ${[...images].join(', ')}`);
  problems += anchors.size + images.size;
  if (failed) return 2;
  return problems ? 1 : 0;
}

if (require.main === module) process.exit(main());
module.exports = {findBrowser};
