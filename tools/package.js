#!/usr/bin/env node
'use strict';
/**
 * claude.ai 업로드용 zip 만들기 — 의존성 없음(Node 18+).
 *
 *   node tools/package.js            → dist/human-readable-reports.zip
 *
 * zip 안 구조는 Anthropic skill-creator의 package_skill.py와 같다: 맨 위에 스킬 폴더 하나, 그 안에 SKILL.md.
 *   human-readable-reports/SKILL.md
 *   human-readable-reports/scripts/…
 *   human-readable-reports/references/…
 * 묶기 전에 같은 도구의 quick_validate.py 규칙으로 frontmatter를 검사한다
 * (허용 키 name·description·license·allowed-tools·metadata·compatibility, name은 kebab-case 64자 이하,
 *  description은 1024자 이하·꺾쇠 괄호 금지).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const NAME = 'human-readable-reports';
const SKILL = path.join(ROOT, 'skills', NAME);
const OUT = path.join(ROOT, 'dist', `${NAME}.zip`);

// ── frontmatter 검사 ──────────────────────────────────────────────────────
function validate() {
  const src = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('SKILL.md frontmatter 없음');
  const keys = [], fm = {};
  let cur = null;
  for (const line of m[1].split('\n')) {
    const k = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (k) { cur = k[1]; keys.push(cur); fm[cur] = k[2] === '>-' || k[2] === '|' ? '' : k[2]; }
    else if (cur && /^\s+/.test(line)) fm[cur] += (fm[cur] ? ' ' : '') + line.trim();
  }
  const allowed = ['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'];
  const bad = keys.filter(k => !allowed.includes(k));
  if (bad.length) throw new Error(`허용되지 않는 frontmatter 키: ${bad.join(', ')}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name || '') || fm.name.length > 64) throw new Error(`name 형식 오류: ${fm.name}`);
  if (fm.name !== NAME) throw new Error(`name(${fm.name})이 폴더 이름(${NAME})과 다름`);
  const d = (fm.description || '').trim();
  if (!d) throw new Error('description 없음');
  if (d.length > 1024) throw new Error(`description ${d.length}자 — 1024자 이하`);
  if (/[<>]/.test(d)) throw new Error('description에 꺾쇠 괄호(< >) 금지');
  return fm;
}

// ── zip 쓰기(deflate) ─────────────────────────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };

function walk(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') return [];
    return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
  });
}

function zip(files) {
  const local = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;   // 고정 날짜 — 같은 내용이면 같은 zip
  for (const rel of files) {
    const data = fs.readFileSync(path.join(SKILL, rel));
    const name = Buffer.from(`${NAME}/${rel}`, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, name, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const fm = validate();
const files = walk(SKILL);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, zip(files));
console.log(`${fm.name}: ${files.length}개 파일 → ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)}KB)`);
files.forEach(f => console.log(`  ${NAME}/${f}`));
