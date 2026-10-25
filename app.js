(async () => {
'use strict';
const { createRenderPolicy } = await import('./src/performance/render-policy.js?v=20261025-regional');
const {visualBenchmark,benchmarkDetails}=await import('./src/performance/visual-benchmark.js?v=20261025-regional');
const benchmark=visualBenchmark(location.search);
const { constrainedDevice, runtimeDeviceConfig } = await import('./src/rendering/texture-policy.js?v=20261025-regional');
const { prepareVegetation } = await import('./src/scenery/prepare-vegetation.js?v=20261024');
const { filterSteepPlants } = await import('./src/scenery/terrain-placement.js');
const { setupCinematic } = await import('./src/rendering/hero-earth.js?v=20261025-regional');
const { SceneryManager } = await import('./src/scenery/scenery-manager.js?v=20261025-regional');
const {syncCameraSun}=await import('./src/rendering/sunlight.js');
const { CameraDirector } = await import('./src/rendering/camera-director.js');
const { sceneTemplateFor } = await import('./src/scenery/scene-templates.js');
const { SCENE_DEMOS,demoCsv } = await import('./src/scenery/scene-demos.js');
const demoParams=new URLSearchParams(location.search),demoKey=demoParams.get('demo');
const demoBase=Object.hasOwn(SCENE_DEMOS,demoKey)?SCENE_DEMOS[demoKey]:undefined;
const demoMonth=Number(demoParams.get('month'));
const sceneDemo=demoBase?{...demoBase,...(Number.isInteger(demoMonth)&&demoMonth>=1&&demoMonth<=12?{month:demoMonth}:{})}:undefined;
const { installTerrainPicking } = await import('./src/rendering/terrain-picking.js');
const { createTerrainDaylight, syncTerrainDaylight } = await import('./src/rendering/terrain-daylight.js');
const metricTools=new URLSearchParams(location.search).has('perf')?await import('./src/performance/metrics.js?v=20261025-regional'):null;

/* ================= constants ================= */

// Fictional sample shown on first visit; real data is imported by each visitor and stays in their browser.
const DEFAULT_CSV = `日期,行程,地点,类型,备注,坐标
2021-07~至今,,上海,现居地,,"31.2304,121.4737"
2015-09~2021-06,,四川成都,曾居地,,"30.5728,104.0668"
2022-10-01~2022-10-06,川西秋色,四川稻城亚丁,旅行,雪山与彩林,"28.4300,100.3500"
2023-05-20~2023-05-27,冰岛自驾,冰岛维克,旅行,黑沙滩,"63.4186,-19.0060"
2024-08-10~2024-08-18,独库公路,新疆那拉提,旅行,空中草原,"43.2290,84.4190"
2024-08-10~2024-08-18,独库公路,新疆赛里木湖,旅行,大西洋最后一滴眼泪,"44.6000,81.1700"
2025-04,京都赏樱,日本京都,旅行,,"35.0116,135.7681"`;

const TEMPLATE_CSV = `日期,行程,地点,类型,备注,坐标
2021-07~至今,,上海,现居地,,
2015-09~2021-06,,四川成都,曾居地,,
2022-10-01~2022-10-06,川西秋色,四川稻城亚丁,旅行,雪山与彩林,
2025-04,京都赏樱,日本京都,旅行,,"35.0116,135.7681"
`;

const STORE_KEY = 'footprints.v1';
const PALETTE = ['#ffb547', '#5cc8ff', '#ff7ab0', '#8fe388', '#b69cff', '#ffd76a', '#6ee7d8'];
const HOME_COLOR = '#ffe9c4';
// Longer names first so prefix matching is unambiguous.
const PROVINCES = ['内蒙古', '黑龙江', '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '江苏', '浙江', '安徽', '福建',
  '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '广西', '西藏',
  '宁夏', '新疆', '香港', '澳门'];
const ALIASES = {
  date: ['日期', 'date', '时间', 'time'],
  trip: ['行程', 'trip', '旅行', '标题', 'title', '名称', 'name'],
  place: ['地点', 'place', 'location', '地名', '目的地'],
  type: ['类型', 'type', '分类', 'category'],
  note: ['备注', 'note', 'notes', '描述', '说明', 'description'],
  coord: ['坐标', 'coord', 'coords', 'coordinate', 'coordinates', '经纬度'],
  lat: ['纬度', 'lat', 'latitude'],
  lon: ['经度', 'lon', 'lng', 'longitude'],
};
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8.5 5.8v12.4c0 .6.7 1 1.2.6l9.6-6.2c.5-.3.5-1 0-1.3L9.7 5.2c-.5-.3-1.2 0-1.2.6z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14"/></svg>',
};
const DAY = 86400000;
const MAX_LIGHTS = 64;
const MAX_CLOUDS = matchMedia('(max-width: 720px)').matches ? 4 : 8;
const NIGHT_DARKNESS = 0.64; // 0 = daylight everywhere, 1 = black; unlit land keeps ~30% of its colour
const EXAGGERATION = 1.65;    // a touch of extra relief so mountains read from afar
// Fixed-width names so no uniform name is a prefix of another (Cesium renames them by token).
const lightName = i => 'fpL' + String(i).padStart(2, '0');
const cloudName = i => 'fpC' + String(i).padStart(2, '0');

// One globe material does all the "look" work on top of the imagery:
//  - night: everything is dimmed except soft pools of daylight around visited places
//  - relief: per-pixel slope lighting (the free terrain has no vertex normals, so normals
//    come from screen-space derivatives of the surface position)
//  - warm light inside the lit pools, wind gusts sweeping the place in focus, cloud shadows
let lightCapacity = 8;
function makeNightMaterial() {
  const uniforms = {
    fpRadius: 60000, fpDark: NIGHT_DARKNESS, fpRelief: 0.55, fpTime: 0, fpHaze: 0, fpAutumn: 0,
    fpSpace: 0, fpTerrainDay:0,
    fpLight: new Cesium.Cartesian3(0, 0, 1), fpWind: new Cesium.Cartesian3(1, 0, 0),
    fpFocus: new Cesium.Cartesian4(0, 0, 0, 0),
  };
  let lights = '', clouds = '';
  for (let i = 0; i < lightCapacity; i++) {
    uniforms[lightName(i)] = new Cesium.Cartesian4(0, 0, 0, 0);
    lights += `  lit = max(lit, fpGlow(pos, ${lightName(i)}));\n`;
  }
  for (let i = 0; i < MAX_CLOUDS; i++) {
    uniforms[cloudName(i)] = new Cesium.Cartesian4(0, 0, 0, 0);
    clouds += `  shadow = max(shadow, fpShadow(pos, ${cloudName(i)}));\n`;
  }
  // Keep the words "slope" and "normalEC" out of this source, comments included: Cesium greps for them,
  // then demands terrain vertex normals and refuses (or crashes) to apply the material.
  const source = `
float fpGlow(vec3 pos, vec4 l) {
  if (l.w < 0.001) return 0.0;
  return (1.0 - smoothstep(fpRadius * 0.28, fpRadius, distance(pos, l.xyz))) * l.w;
}
float fpShadow(vec3 pos, vec4 c) {
  return c.w > 0.0 ? 1.0 - smoothstep(c.w * 0.35, c.w, distance(pos, c.xyz)) : 0.0;
}
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 pEC = -materialInput.positionToEyeEC;
  vec3 pos = (czm_inverseView * vec4(pEC, 1.0)).xyz;

  float lit = 0.0;
${lights}
  float shadow = 0.0;
  if (fpFocus.w > 0.0) {
${clouds}
  }
  vec3 n = normalize(cross(dFdx(pEC), dFdy(pEC)));
  if (dot(n, materialInput.positionToEyeEC) < 0.0) n = -n;
  float shade = clamp(0.5 + 0.5 * dot(n, fpLight), 0.0, 1.0);
  // Near the ground, far terrain is coarse (big flat triangles), so its relief lighting fades with
  // distance while blue aerial haze takes over, as real mountain ranges do.
  float dist = length(pEC);
  float far = smoothstep(12000.0, 90000.0, dist) * fpHaze;
  float reliefA = (1.0 - shade) * fpRelief * (1.0 - 0.75 * far);
  float hazeA = far * 0.28;

  float gust = 0.0, inFocus = 0.0;
  if (fpFocus.w > 0.0) {
    vec3 d = pos - fpFocus.xyz;
    inFocus = 1.0 - smoothstep(fpFocus.w * 0.6, fpFocus.w, length(d));
    float across = dot(d, normalize(cross(fpWind, fpFocus.xyz)));
    float wave = sin(dot(d, fpWind) / 700.0 - fpTime * 0.6 + sin(across / 1500.0) * 1.5);
    gust = smoothstep(0.55, 1.0, wave) * inFocus;
  }

  float nightA = fpDark * (1.0 - lit) * (1.0 - fpTerrainDay);
  float rim = lit * (1.0 - lit) * 4.0;
  float w = (rim * 0.1 + lit * 0.05) * (1.0 - fpTerrainDay) + gust * 0.07;
  float autumnA = fpAutumn * inFocus * 0.2;
  // Composite as premultiplied layers over the imagery, in order:
  // relief shadow, cloud shadow, autumn wash, haze, night tint, warm light.
  float keep = (1.0 - reliefA) * (1.0 - shadow * 0.32);
  vec3 acc = vec3(0.0);
  acc = acc * (1.0 - autumnA) + vec3(0.86, 0.62, 0.22) * autumnA; keep *= 1.0 - autumnA;
  acc = acc * (1.0 - hazeA) + vec3(0.6, 0.7, 0.82) * hazeA;      keep *= 1.0 - hazeA;
  acc = acc * (1.0 - nightA) + vec3(0.015, 0.026, 0.06) * nightA; keep *= 1.0 - nightA;
  acc = acc * (1.0 - w) + vec3(1.0, 0.86, 0.6) * w;              keep *= 1.0 - w;
  if (fpSpace > 0.001) {
    vec3 earth = normalize(pos);
    vec3 eye = normalize(czm_inverseView[3].xyz - pos);
    vec3 earthEC = normalize((czm_view * vec4(earth, 0.0)).xyz);
    float daylight = smoothstep(-0.25, 0.85, dot(earthEC, normalize(vec3(0.85, 0.4, 0.9))));
    float dayShadow = (1.0 - daylight) * fpSpace * 0.46;
    acc *= 1.0 - dayShadow; keep *= 1.0 - dayShadow;
    float edge = pow(1.0 - max(0.0, dot(earth, eye)), 6.0) * fpSpace * 0.14;
    acc = acc * (1.0 - edge) + vec3(0.19, 0.57, 0.95) * edge;
    keep *= 1.0 - edge;
  }
  m.alpha = 1.0 - keep;
  m.diffuse = acc / max(m.alpha, 0.0001);
  return m;
}`;
  return new Cesium.Material({ translucent: false, fabric: { type: `FootprintNight${lightCapacity}`, uniforms, source } });
}

/* ================= helpers ================= */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isMobile = () => matchMedia('(max-width: 720px)').matches;
const pad2 = n => String(n).padStart(2, '0');
const body = document.body;

let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ================= state ================= */

const state = { rows: [], places: {}, sel: null, year: null, playing: false };
let trips = [], homes = [], typeColors = {};
let viewer, scene, terrainReady = false;
let flying = false, flightGeneration = 0, orbit = null, lastInput = 0, pickName = null, playToken = 0;
let markers = [], arcSource = null, arcEntities = [], originEntity = null;
let geo = { busy: false, done: 0, total: 0, failed: false };
// name -> { pos, cur, wake }; cur fades toward the target brightness once performance.now() >= wake
const lights = new Map();
let nightMaterial = null, terrainDaylight = null, materialIsolated = false, lightsOn = false, replayLit = null;
let renderPolicy, cinematic, sceneryManager, cameraDirector, terrainPicking, globalSpinUntil = 0, lightsAnimating = true;
let cinematicDay = true, dayMix = 1;
const frameTimings = { engineMs: 0, effectsMs: 0, drawMs: 0 };
let drawCommands = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function load() {
  if(sceneDemo){importCsvText(demoCsv(sceneDemo),'replace');return;}
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.rows)) { state.rows = d.rows; state.places = d.places || {}; return; }
  } catch (e) { /* fall through to sample data */ }
  importCsvText(DEFAULT_CSV, 'replace');
}
function save() {
  if(sceneDemo)return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ rows: state.rows, places: state.places })); } catch (e) { /* storage unavailable */ }
}

/* ================= CSV ================= */

function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const count = ch => first.split(ch).length - 1;
  let delim = ',';
  if (count('\t') > count(',')) delim = '\t';
  else if (!count(',') && count('，')) delim = '，';
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

function mapHeader(h) {
  const k = h.trim().toLowerCase();
  for (const [key, list] of Object.entries(ALIASES)) if (list.includes(k)) return key;
  return null;
}

function parseCoord(s) {
  const m = String(s || '').match(/(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  let a = +m[1], b = +m[2];
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) [a, b] = [b, a];
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

const rowKey = r => [r.date, r.trip, r.place, r.type, r.note].join('\u0001');

function importCsvText(text, mode) {
  const table = parseCSV(text);
  if (table.length < 2) throw new Error('没有读到数据行');
  const cols = table[0].map(mapHeader);
  if (!cols.includes('place')) throw new Error('缺少「地点」列，请检查表头');
  const rows = [];
  for (const r of table.slice(1)) {
    const o = { date: '', trip: '', place: '', type: '', note: '' };
    let coord = '', lat = '', lon = '';
    cols.forEach((k, j) => {
      const v = (r[j] ?? '').trim();
      if (k === 'coord') coord = v;
      else if (k === 'lat') lat = v;
      else if (k === 'lon') lon = v;
      else if (k) o[k] = v;
    });
    if (!o.place) continue;
    const c = parseCoord(coord) || (lat && lon ? parseCoord(lat + ',' + lon) : null);
    if (c) state.places[o.place] = { lat: c[0], lon: c[1], status: 'confirmed', label: '来自表格中的坐标' };
    rows.push(o);
  }
  if (!rows.length) throw new Error('没有读到包含地点的行');
  if (mode === 'append') {
    const seen = new Set(state.rows.map(rowKey));
    for (const r of rows) if (!seen.has(rowKey(r))) { state.rows.push(r); seen.add(rowKey(r)); }
  } else {
    state.rows = rows;
  }
  save();
  return rows.length;
}

const csvCell = v => /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
function coordStr(name) {
  const p = state.places[name];
  return p && p.lat != null ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : '';
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportCsv() {
  const lines = [['日期', '行程', '地点', '类型', '备注', '坐标'].join(',')];
  for (const r of state.rows) lines.push([r.date, r.trip, r.place, r.type, r.note, coordStr(r.place)].map(csvCell).join(','));
  download('我的足迹.csv', lines.join('\n') + '\n');
}

async function readFileText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('gbk').decode(buf); } // Excel on Chinese Windows saves CSV as GBK
}

/* ================= dates ================= */

function parsePart(p, base) {
  const nums = p.split('-').filter(Boolean).map(Number);
  if (!nums.length || nums.some(isNaN)) return null;
  let y, m, d;
  if (nums[0] >= 1000) [y, m, d] = nums;
  else if (base) { y = base.y; if (nums.length >= 2) [m, d] = nums; else if (base.m) { m = base.m; d = nums[0]; } else m = nums[0]; }
  else return null;
  return { y, m: m || null, d: d || null, prec: d ? 'day' : m ? 'month' : 'year' };
}
const startOf = p => new Date(p.y, (p.m || 1) - 1, p.d || 1);
const endOf = p => p.d ? new Date(p.y, p.m - 1, p.d) : p.m ? new Date(p.y, p.m, 0) : new Date(p.y, 11, 31);

function fmtPart(p, withYear = true) {
  if (p.prec === 'day') return (withYear ? p.y + '.' : '') + pad2(p.m) + '.' + pad2(p.d);
  if (p.prec === 'month') return withYear ? `${p.y}年${p.m}月` : `${p.m}月`;
  return `${p.y}年`;
}

function parseDateStr(s) {
  const raw = (s || '').trim();
  if (!raw) return null;
  const norm = raw.replace(/[年月.\/]/g, '-').replace(/日/g, '')
    .replace(/\s*(?:~|～|到|—|–|-)?\s*(至今|现在|now|present)$/i, '~至今');
  const parts = norm.split(/\s*(?:~|～|至(?!今)|到|—|–)\s*|\s+-\s+/);
  const clean = x => (x || '').trim().replace(/^-+|-+$/g, '');
  const a = parsePart(clean(parts[0]));
  if (!a) return null;
  const endRaw = parts.length > 1 ? clean(parts[1]) : null;
  const ongoing = endRaw !== null && (endRaw === '' || /^(至今|今|现在|now|present)$/i.test(endRaw));
  const b = endRaw && !ongoing ? parsePart(endRaw, a) : null;
  const start = startOf(a);
  const end = ongoing ? new Date(new Date().setHours(0, 0, 0, 0)) : endOf(b || a);
  const days = a.prec === 'day' && (!b || b.prec === 'day') && !ongoing ? Math.round((end - start) / DAY) + 1 : null;
  let label, short;
  if (ongoing) { label = `${fmtPart(a)} – 至今`; short = label; }
  else if (!b || (b.y === a.y && b.m === a.m && b.d === a.d)) { label = fmtPart(a); short = fmtPart(a, false); }
  else {
    const sameYear = b.y === a.y;
    label = `${fmtPart(a)} – ${fmtPart(b, !sameYear)}`;
    short = sameYear ? `${fmtPart(a, false)} – ${fmtPart(b, false)}` : label;
  }
  return { start: start.getTime(), end: end.getTime(), days, ongoing, label, short, prec: a.prec };
}

function durationText(d) {
  const months = Math.round((d.end - d.start) / (DAY * 30.44));
  if (months < 1) return '';
  if (months < 12) return `${months} 个月`;
  return `${+(Math.round(months / 6) / 2).toFixed(1)} 年`;
}

/* ================= model ================= */

function kindOf(type) {
  const t = (type || '').trim();
  if (/曾|以前|过去|旧居|老家|故乡/.test(t)) return 'past';
  if (/现居|现住|常驻|居住|^家$|现在/.test(t)) return 'home';
  return 'trip';
}

function detectProvince(name) { return PROVINCES.find(p => name.startsWith(p)) || null; }
function coreName(name, prov = detectProvince(name)) {
  let c = prov ? name.slice(prov.length) : name;
  c = c.replace(/^(省|市|(壮族|回族|维吾尔)?自治区|特别行政区)/, '').trim();
  return c || name;
}

function placeNames() {
  const seen = new Set();
  for (const r of state.rows) if (r.place) seen.add(r.place);
  return [...seen];
}

function buildModel() {
  const tripMap = new Map(), homeList = [];
  for (const r of state.rows) {
    if (!r.place) continue;
    const kind = kindOf(r.type);
    const date = parseDateStr(r.date);
    if (kind !== 'trip') {
      homeList.push({ id: 'h:' + r.place + '|' + r.date, kind, title: r.trip || coreName(r.place), place: r.place, note: r.note, date, type: r.type });
      continue;
    }
    const key = 't:' + (r.trip || r.place) + '|' + r.date;
    if (!tripMap.has(key)) tripMap.set(key, { id: key, kind: 'trip', title: r.trip || coreName(r.place), type: r.type || '旅行', date, stops: [] });
    const t = tripMap.get(key);
    const stop = t.stops.find(s => s.place === r.place);
    if (stop) { if (r.note && !stop.note.includes(r.note)) stop.note += (stop.note ? '；' : '') + r.note; }
    else t.stops.push({ place: r.place, note: r.note || '' });
  }
  const order = x => x.date ? x.date.start : Infinity;
  trips = [...tripMap.values()].sort((a, b) => order(a) - order(b));
  homes = homeList.sort((a, b) => (b.kind === 'home') - (a.kind === 'home') || order(b) - order(a));
  trips.forEach((t, i) => {
    t.n = i + 1;
    t.year = t.date ? new Date(t.date.start).getFullYear() : null;
    t.endYear = t.date ? new Date(t.date.end).getFullYear() : null;
    t.origin = originOf(t);
  });
  typeColors = {};
  let i = 0;
  for (const t of trips) if (!(t.type in typeColors)) typeColors[t.type] = PALETTE[i++ % PALETTE.length];
}

// Where the person lived when the trip started: a dated residence whose period contains the
// trip date, else the single undated current home (if there is exactly one).
function originOf(t) {
  if (!t.date) return null;
  const dated = homes.filter(h => h.date && h.date.start <= t.date.start && t.date.start <= h.date.end);
  if (dated.length) return dated.sort((a, b) => b.date.start - a.date.start)[0];
  const undated = homes.filter(h => h.kind === 'home' && !h.date);
  return undated.length === 1 ? undated[0] : null;
}

const byId = id => trips.find(t => t.id === id) || homes.find(h => h.id === id) || null;
const inYear = t => !state.year || (t.year != null && t.year <= state.year && state.year <= t.endYear);
const visibleTrips = () => trips.filter(inYear);
const located = name => { const p = state.places[name]; return p && p.lat != null; };

/* ================= geocoding ================= */

let lastGeo = 0;
async function nominatim(q, limit = 6) {
  const wait = lastGeo + 1100 - Date.now(); // public Nominatim allows ~1 request/second
  if (wait > 0) await sleep(wait);
  lastGeo = Date.now();
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=zh-CN,zh,en&limit=' + limit + '&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

const CJK = /[㐀-鿿]/;
function coverage(core, text) {
  const chars = [...core].filter(ch => CJK.test(ch));
  if (!chars.length) return 1;
  return chars.filter(ch => text.includes(ch)).length / chars.length;
}
const CAT_BONUS = { natural: .5, tourism: .35, place: .3, leisure: .25, boundary: .25, historic: .25, landuse: -.15, highway: -.45, building: -.45, shop: -.35, amenity: -.3, railway: -.35, office: -.4 };

function pickBest(results, core, prov) {
  let best = null, bestScore = -Infinity;
  for (const r of results) {
    const disp = r.display_name || '';
    if (prov && !disp.includes(prov)) continue;
    if (coverage(core, disp) < 0.6) continue; // reject fuzzy matches that share almost no characters
    let bonus = CAT_BONUS[r.category] ?? 0;
    if (r.category === 'boundary' && /national_park|protected_area/.test(r.type)) bonus = .5;
    const score = (+r.importance || 0) + bonus + coverage(core, r.name || '') * 0.6;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

async function autoLocate(name) {
  const prov = detectProvince(name), core = coreName(name, prov);
  const queries = core !== name ? [name, core] : [name];
  try {
    for (const q of queries) {
      const best = pickBest(await nominatim(q), core, prov);
      if (best) return { lat: +best.lat, lon: +best.lon, status: 'auto', label: best.display_name };
    }
    if (prov) {
      const r = await nominatim(prov, 1);
      if (r[0]) return { lat: +r[0].lat, lon: +r[0].lon, status: 'rough', label: r[0].display_name };
    }
    return { status: 'notfound' };
  } catch (e) {
    return null; // network problem: leave unset so a retry picks it up
  }
}

async function geocodeMissing() {
  if (geo.busy) return;
  const todo = placeNames().filter(n => !state.places[n]);
  if (!todo.length) return;
  geo = { busy: true, done: 0, total: todo.length, failed: false };
  renderChips();
  for (const n of todo) {
    if (state.places[n]) { geo.done++; continue; }
    const r = await autoLocate(n);
    if (r) { state.places[n] = r; save(); refresh(); } else geo.failed = true;
    geo.done++;
    renderChips();
  }
  geo.busy = false;
  renderChips();
  if (!state.sel && !flying && viewer && viewer.camera.positionCartographic.height > 4e6) homeView(2.2);
}

function setPlace(name, data) {
  state.places[name] = data;
  save();
  refresh();
  sampleHeights();
}

/* ================= globe ================= */

function initGlobe() {
  const mobile = constrainedDevice(runtimeDeviceConfig());
  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 18,
    // Esri sometimes responds 200 with a grey "Map data not yet available" image. Reject the
    // sentinel so Cesium keeps the nearest available parent instead of replacing it with grey.
    tileDiscardPolicy: new Cesium.DiscardMissingTileImagePolicy({
      missingImageUrl:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/18/0/0',
      pixelsToCheck:[[0,0],[200,20],[20,200],[80,110],[160,130]].map(p=>new Cesium.Cartesian2(...p)),
      disableCheckIfAllPixelsAreTransparent:true,
    }),
    credit: new Cesium.Credit('影像 © Esri, Maxar, Earthstar Geographics · 地名 © OpenStreetMap'),
  });
  const terrain = new Cesium.Terrain(Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'));

  viewer = new Cesium.Viewer('globe', {
    baseLayer: new Cesium.ImageryLayer(imagery,{maximumAnisotropy:mobile?2:4}),
    terrain,
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, scene3DOnly:true, creditContainer: $('#credits'), msaaSamples: 1,
    useBrowserRecommendedResolution: false,
    orderIndependentTranslucency: false,
    contextOptions: { webgl: { alpha: true } },
  });
  scene = viewer.scene;
  let removeFrameMetrics;
  terrainPicking=installTerrainPicking(viewer,{constrained:mobile});
  renderPolicy = createRenderPolicy(viewer, { mobile, reducedMotion, benchmark:benchmark.enabled });
  sceneryManager = new SceneryManager(viewer, { constrained: mobile, reducedMotion });
  cameraDirector = new CameraDirector(viewer);
  window.addEventListener('pagehide', event => {
    if(event.persisted || viewer.isDestroyed())return;
    removeFrameMetrics?.();terrainPicking.dispose();clearScenery();sceneryManager.dispose();cinematic.dispose();viewer.destroy();
  });
  document.addEventListener('click', () => { lightsAnimating = true; scene.requestRender(); });

  const layer = viewer.imageryLayers.get(0);
  layer.saturation = 1.16; layer.contrast = 1.18; layer.gamma = 1; layer.brightness = 1.04;

  const g = scene.globe;
  g.enableLighting = false;
  g.showGroundAtmosphere = false; // it washes the night tint out to pale grey
  g.depthTestAgainstTerrain = true;
  g.maximumScreenSpaceError = mobile ? 4 : 2;
  scene.verticalExaggeration = EXAGGERATION;
  g.tileCacheSize = 400;
  g.preloadSiblings = false;
  g.baseColor = Cesium.Color.fromCssColorString('#cfdbe6'); // imagery stops near ±85°, so the poles show this icy tone
  scene.backgroundColor = Cesium.Color.TRANSPARENT;
  scene.skyBox.show = false;
  cinematic = setupCinematic(viewer, { terrainExaggeration: EXAGGERATION, onError: () => toast('全球材质加载失败，暂用卫星影像') });
  scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.postProcessStages.fxaa.enabled = true;
  const ssc = scene.screenSpaceCameraController;
  ssc.minimumZoomDistance = 35;
  ssc.maximumZoomDistance = 4.5e7;
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  terrain.readyEvent.addEventListener(() => { terrainReady = true; sampleHeights(); });
  terrain.errorEvent.addEventListener(() => toast('地形服务暂时连不上，先以平面地球显示'));

  arcSource = new Cesium.CustomDataSource('arcs');
  viewer.dataSources.add(arcSource);

  // Web Mercator terrain stops at ±85.05°, leaving holes at the poles; cap them with ice.
  for (const [s, n] of [[85.0, 90], [-90, -85.0]]) {
    viewer.entities.add({ rectangle: { coordinates: Cesium.Rectangle.fromDegrees(-180, s, 180, n), height: 0,
      material: Cesium.Color.fromCssColorString('#3b424d') } }); // ice as it looks under the night tint
  }

  const markInput = () => {
    lastInput = performance.now();
    orbit = null;
    cinematic.setFocus(null);
    if (state.playing && !pickName) stopPlay();
  };
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) viewer.canvas.addEventListener(ev, markInput, { passive: true });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction(e => {
    if (!pickName) return;
    const ray = viewer.camera.getPickRay(e.position);
    const p = (ray && scene.globe.pick(ray, scene)) || viewer.camera.pickEllipsoid(e.position);
    if (!p) return;
    const c = Cesium.Cartographic.fromCartesian(p);
    const name = pickName;
    endPick();
    setPlace(name, { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), status: 'confirmed', label: '在地图上手动选点' });
    toast(`已把「${coreName(name)}」放到这里`);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  lightCapacity = Math.min(MAX_LIGHTS, Math.max(8, 2 ** Math.ceil(Math.log2(placeNames().filter(located).length || 1))));
  nightMaterial = makeNightMaterial();
  terrainDaylight = createTerrainDaylight(MAX_CLOUDS);
  g.material = nightMaterial;
  scene.skyAtmosphere.brightnessShift = -0.12;
  scene.sun.show = false;  // our light is camera-relative; a real sun in the sky would contradict it
  scene.moon.show = false;

  // Idle motion: slow spin from space, gentle orbit around a selected place.
  let lastT = performance.now();
  let frameStart = 0, drawStart = 0;
  let cameraMoving = false;
  viewer.camera.moveStart.addEventListener(() => { cameraMoving = true; });
  viewer.camera.moveEnd.addEventListener(() => { cameraMoving = false; });
  scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    frameStart = now;
    cinematic.update({ altitude: viewer.camera.positionCartographic.height, day: dayMix,
      lightUniforms: nightMaterial.uniforms, reducedMotion, now,terrainReady,localReady:sceneryManager.details().sceneryPhase==='ready' });
    cameraDirector.update({ altitude: viewer.camera.positionCartographic.height, flying, scenery: scenery.name });
    renderPolicy.near(viewer.camera.positionCartographic.height < 20000);
    renderPolicy.still(!cameraMoving && !flying && !state.sel && !pickName && now >= globalSpinUntil &&
      now - lastInput > 800 && viewer.camera.positionCartographic.height > 4e6);
    if (!renderPolicy.tick(now)) return;
    if(benchmark.enabled)scene.requestRender();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const animatedScenery = scenery.name && !reducedMotion && !body.classList.contains('modal-open');
    const moving = flying || !!orbit || !!animatedScenery || cameraMoving;
    if(body.classList.contains('scene-active') !== moving) body.classList.toggle('scene-active',moving);
    if (lightsAnimating || animatedScenery || flying) scene.requestRender();
    if (flying || pickName || body.classList.contains('modal-open') || now - lastInput < 4000 || reducedMotion) return;
    const cam = viewer.camera;
    if (orbit) {
      cam.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(orbit));
      cam.rotateRight(0.045 * dt);
      cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } else if (!state.sel && now < globalSpinUntil && cam.positionCartographic.height > 4e6) {
      cam.rotate(Cesium.Cartesian3.UNIT_Z, -0.035 * dt);
    }
  });
  let lastRender = performance.now();
  scene.preRender.addEventListener(() => {
    drawCommands=0;
    const now = performance.now();
    frameTimings.engineMs = +(now - frameStart).toFixed(1);
    updateLights(now, Math.min((now - lastRender) / 1000, 0.1));
    drawStart = performance.now();
    frameTimings.effectsMs = +(drawStart - now).toFixed(1);
    lastRender = now;
    renderPolicy.frame(now, flying || !!orbit || !!scenery.name || now < globalSpinUntil, frameTimings.drawMs);
  });
  if (metricTools) {
    scene.debugCommandFilter = () => { drawCommands++; return true; };
      removeFrameMetrics=metricTools.attachFrameMetrics(viewer, () => ({ trees: scenery.plants.filter(p=>p.species!=='grass'&&p.species!=='shrub').length, lightSlots: lightCapacity,
        ...frameTimings, drawCommands, terrainVisible:scene.globe.show,logDepth:scene.logarithmicDepthBuffer,
        orbiting:!!orbit,collision:scene.screenSpaceCameraController.enableCollisionDetection,
        terrainMaterial:materialIsolated?'off':scene.globe.material===terrainDaylight?'daylight':'footprint',imageryAnisotropy:mobile?2:4,
        ...cinematic.details(), ...sceneryManager.details(), ...cameraDirector.details(),...terrainPicking.details(),
        ...renderPolicy.details(), qualityProfile:mobile?'mobile':'desktop', ...(benchmark.enabled?benchmarkDetails(viewer):{}), mode: flying ? 'flight' : scenery.name ? 'scenery' : orbit ? 'orbit' :
          performance.now() < globalSpinUntil ? 'intro' : 'idle' }), [
        { label: '隔离植被', run: () => sceneryManager.toggle() },
        { label: '森林 LOD 对比', run: () => cinematic.toggleForestDetail() },
        { label: '隔离材质', run: () => { cinematic.toggleSurface(); materialIsolated=!materialIsolated; } },
        { label: '隔离大气', run: () => { cinematic.toggleAtmosphere(); } },
        { label: '隔离雾与粒子', run: () => sceneryManager.effects.toggle() },
        { label: '隔离地形', run: () => cinematic.toggleTerrain() },
        { label: '深度缓冲对比', run: () => {scene.logarithmicDepthBuffer=!scene.logarithmicDepthBuffer;} },
        { label: '暂停环绕', run: () => {orbit=null;} },
        { label: '碰撞检测对比', run: () => {scene.screenSpaceCameraController.enableCollisionDetection=!scene.screenSpaceCameraController.enableCollisionDetection;} },
      ]);
  }
  // Keep DOM work outside the GPU timer query; submitting its end after label layout would count
  // GPU idle time waiting for the CPU as rendering time on some drivers.
  scene.postRender.addEventListener(()=>{
    const before=performance.now();frameTimings.renderMs=+(before-drawStart).toFixed(1);
    updateMarkers();frameTimings.markersMs=+(performance.now()-before).toFixed(1);
    frameTimings.drawMs=+(performance.now()-drawStart).toFixed(1);
  });

  const c = centroid();
  viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(c.lon + 75, c.lat * 0.3, 3.4e7) });

  const t0 = performance.now();
  let loaded = false;
  const onLoaded = () => {
    if (loaded) return;
    loaded = true;
    $('#loader').classList.add('out');
    setTimeout(() => $('#loader').remove(), 1300);
    setTimeout(() => homeView(3.4), 250);
    // Light the footprints one by one as the globe settles.
    setTimeout(() => {
      lightsOn = true;
      lightsAnimating = true;
      scene.requestRender();
      const now = performance.now();
      [...lights.values()].forEach((L, i) => { L.wake = now + i * 420; });
    }, 2600);
  };
  const check = () => {
    if (cinematic.isReady() && performance.now() - t0 > 800) { scene.postRender.removeEventListener(check); onLoaded(); }
  };
  scene.postRender.addEventListener(check);
  setTimeout(onLoaded, 12000);
}

function centroid() {
  const current = homes.find(h => h.kind === 'home' && located(h.place));
  if (current) { const p = state.places[current.place]; return { lat: p.lat, lon: p.lon }; }
  const pts = placeNames().filter(located).map(n => state.places[n]);
  if (!pts.length) return { lat: 33, lon: 105 };
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
}

function posOf(name, lift = 0) {
  const p = state.places[name];
  return p && p.lat != null ? Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.h || 0) * EXAGGERATION + lift) : null;
}

function homeView(duration = 2.4) {
  if (!viewer) return;
  renderPolicy.home();
  cinematic.setFocus(null);
  if (scenery.name) clearScenery();
  orbit = null;
  const c = centroid(),comparisonView=benchmark.view;
  const flight = flightGeneration = cameraDirector.begin('leaving');
  flying = true;
  const focal = viewer.canvas.clientHeight / (2 * Math.tan(viewer.camera.frustum.fovy / 2));
  const screenRadius = Math.min(viewer.canvas.clientWidth * (benchmark.enabled ? 0.44 : 0.45),
    viewer.canvas.clientHeight * (benchmark.enabled ? 0.435 : 0.48));
  const earthRadius = Cesium.Ellipsoid.WGS84.maximumRadius;
  const altitude = benchmark.altitude??earthRadius * (Math.sqrt(1 + (focal / Math.max(1, screenRadius)) ** 2) - 1);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(comparisonView?.lon??c.lon-30, comparisonView?.lat??c.lat-4, altitude),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration,
    complete: () => { if (flight === flightGeneration) { flying = false; cameraDirector.finish(flight,'global'); globalSpinUntil = benchmark.enabled?0:performance.now() + 8000; } },
    cancel: () => { if (flight === flightGeneration) flying = false; },
  });
}

// close: drop low over a single place so its trees, flowers and clouds are in view
function flyToPoints(positions, { duration = 3.2, heading = 12, close = false, placeName } = {}) {
  if (!viewer || !positions.length) return Promise.resolve(false);
  if (scenery.name) clearScenery();
  orbit = null;
  sceneryManager.preload().catch(() => {});
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  cinematic.setFocus(sphere.center,placeName?seasonFor(placeName,state.places[placeName].lat).month:8);
  const r = sphere.radius;
  const framing=close&&placeName?sceneTemplateFor({name:placeName,...state.places[placeName],height:state.places[placeName]?.h||0}).camera:null;
  const range = close ? framing?.range||1900 : Math.max(30000, r * 3.4);
  const pitch = Cesium.Math.toRadians(close ? framing?.pitch||-19 : r > 800000 ? -75 : r > 40000 ? -50 : -26);
  const flight = flightGeneration = cameraDirector.begin('entering');
  flying = true;
  // Fetch/survey the destination during the flight; distance bands keep local models/effects
  // hidden from orbit. Unknown ground heights retain the normal arrival-time fallback.
  if(close&&placeName&&terrainReady&&Number.isFinite(state.places[placeName]?.h))setScenery(placeName);
  return new Promise(res => {
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(sphere.center, 0), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), pitch, range),
      duration,
      complete: () => {
        if (flight !== flightGeneration) { res(false); return; }
        flying = false; cameraDirector.finish(flight,'place'); orbit = r < 800000 ? Cesium.Cartesian3.clone(sphere.center) : null; lastInput = 0; res(true);
      },
      cancel: () => { if (flight === flightGeneration) flying = false; res(false); },
    });
  });
}

function flyToItem(item, opts) {
  const names = item.kind === 'trip' ? item.stops.map(s => s.place) : [item.place];
  const pts = names.map(n => posOf(n)).filter(Boolean);
  if (!pts.length) { toast('这里的地点还没有定位，可以在「地点校正」里设置'); return Promise.resolve(false); }
  return flyToPoints(pts, {placeName:names.length===1?names[0]:undefined,...opts});
}

let sampling = false;
async function sampleHeights() {
  if (!terrainReady || sampling) return;
  const objs = placeNames().map(n => state.places[n]).filter(p => p && p.lat != null && p.h == null);
  if (!objs.length) return;
  sampling = true;
  const cartos = objs.map(p => Cesium.Cartographic.fromDegrees(p.lon, p.lat));
  try { await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos); }
  catch (e) { try { await Cesium.sampleTerrain(viewer.terrainProvider, 11, cartos); } catch (e2) { /* keep sea level */ } }
  objs.forEach((p, i) => { p.h = Number.isFinite(cartos[i].height) ? cartos[i].height : 0; });
  sampling = false;
  save();
  renderMarkers();
  renderArcs();
  sampleHeights();
}

/* ---------- lights ---------- */

function syncLights() {
  const now = performance.now();
  const names = new Set();
  // Priority order matters only past MAX_LIGHTS: residences, then the most recent trips.
  const ordered = new Set([...homes.map(h => h.place), ...trips.slice().reverse().flatMap(t => t.stops.map(s => s.place)), ...placeNames()]);
  for (const n of ordered) {
    const pos = posOf(n);
    if (!pos) continue;
    names.add(n);
    const L = lights.get(n);
    if (L) L.pos = pos;
    else lights.set(n, { pos, cur: 0, wake: now }); // newly located places fade in
  }
  for (const n of [...lights.keys()]) if (!names.has(n)) lights.delete(n);
  const required = Math.min(MAX_LIGHTS, Math.max(8, 2 ** Math.ceil(Math.log2(lights.size || 1))));
  if (nightMaterial && required > lightCapacity) {
    const previous = nightMaterial.uniforms;
    lightCapacity = required;
    nightMaterial = makeNightMaterial();
    for (const key of Object.keys(nightMaterial.uniforms)) {
      if (key in previous) nightMaterial.uniforms[key] = previous[key];
    }
    scene.globe.material = nightMaterial;
  }
  lightsAnimating = true;
  if (scene) scene.requestRender();
}

function lightTarget(name) {
  if (!lightsOn) return 0;
  if (replayLit) return replayLit.has(name) ? 1 : 0;
  if (state.year) {
    const lit = homes.some(h => h.place === name) || visibleTrips().some(t => t.stops.some(s => s.place === name));
    return lit ? 1 : 0.15;
  }
  return 1;
}

const scratchLight=new Cesium.Cartesian3();
// Keep terrain, foliage and cloud shadows aligned with the orbital presentation's art light.
function updateSun() {
  syncCameraSun(viewer.camera.inverseViewMatrix,nightMaterial.uniforms.fpLight,scratchLight);
}

function updateLights(now, dt) {
  const u = nightMaterial.uniforms;
  u.fpTime = (now / 1000) % 10000;
  // aerial haze only matters when the camera is down among the mountains
  const camH = viewer.camera.positionCartographic.height;
  const space = Math.min(1, Math.max(0, (camH - 800000) / 3700000));
  const targetDay = cinematicDay ? 1 : 0;
  dayMix += (targetDay - dayMix) * Math.min(1, dt * 3);
  if (Math.abs(targetDay - dayMix) < .002) dayMix = targetDay;
  u.fpSpace = space * space * (3 - 2 * space) * dayMix;
  const nearDay=Math.min(1,Math.max(0,(2400000-camH)/1750000));
  u.fpTerrainDay=nearDay*nearDay*(3-2*nearDay)*dayMix;
  u.fpDark = NIGHT_DARKNESS * (1 - u.fpSpace) + 0.025 * u.fpSpace;
  u.fpRelief = 0.55 * (1 - u.fpSpace) + 0.12 * u.fpSpace;
  u.fpHaze = 1 - Math.min(1, Math.max(0, (camH - 25000) / 95000));
  updateSun();
  updateScenery(now, dt);
  // Lit pools keep a sensible size on screen: a few hundred km from space; down among the mountains
  // they widen so the whole visible landscape stays in daylight instead of a dark horizon.
  u.fpRadius = Math.max(55000, camH * 0.036, camH < 120000 ? 140000 * Math.min(1, (120000 - camH) / 90000) : 0);
  let n = 0;
  lightsAnimating = dayMix !== targetDay;
  for (const [name, L] of lights) {
    if (n >= lightCapacity) break;
    const target = now >= L.wake ? lightTarget(name) : 0;
    if (Math.abs(target - L.cur) < 0.002) L.cur = target;
    else { L.cur += (target - L.cur) * Math.min(1, dt * 1.8); lightsAnimating = true; }
    if (now < L.wake && lightsOn) lightsAnimating = true;
    const v = u[lightName(n++)];
    v.x = L.pos.x; v.y = L.pos.y; v.z = L.pos.z;
    const outsideLocalView = camH < 120000 && scenery.name && scenery.center &&
      Cesium.Cartesian3.distance(L.pos, scenery.center) > u.fpRadius * 2;
    v.w = outsideLocalView ? 0 : L.cur;
  }
  for (; n < lightCapacity; n++) u[lightName(n)].w = 0;
  syncTerrainDaylight(terrainDaylight,u,viewer.camera.viewMatrix);
  const material=materialIsolated?undefined:u.fpTerrainDay===1?terrainDaylight:nightMaterial;
  if(scene.globe.material!==material)scene.globe.material=material;
}

/* ---------- scenery: clouds, wind and vegetation around the place in focus ---------- */

const SCENERY_RADIUS = 16000;  // m: clouds, their shadows and wind gusts
const VEG_TILE_ZOOM = 14;      // satellite tiles read to decide where forest and meadow are
const VEG_TILES = 5;           // 5×5 tiles ≈ 6–9 km square, depending on latitude
const VEG_RADIUS = 3000;       // m around the place that gets trees and flowers
const MAX_TREES = 3000;
const WIND_SPEED = 22;         // m/s; faster than real so the drift reads on screen

const scenery = { name: null, token: 0, lastCheck: 0, center: null, east: null, north: null, up: null,
  clouds: [], plants: [], controller: null };

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hashStr = s => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

// Rough vegetation regions: enough to pick the iconic plants of a place. The satellite image still
// decides where trees stand; elevation chooses between the low and high mix, and nothing grows above
// the treeline. darkV: brightness below which green pixels count as forest (broadleaf canopies are lighter).
function biomeAt(lat, lon) {
  const a = Math.abs(lat);
  if (lon > 124 && lon < 146 && lat > 30 && lat < 46) // Japan, Korea
    return { low: { broadleaf: 5, pine: 2, spruce: 2, cherry: 1 }, high: { spruce: 3, birch: 1 }, highAbove: 1400, treeline: 2600, darkV: 0.3 };
  if (lat >= 44 && lon >= 105 && lon <= 145) // NE China, Inner Mongolia: birch and larch
    return { low: { birch: 5, larch: 4, pine: 1 }, treeline: 1900, darkV: 0.3 };
  if (lat >= 36 && lat < 50 && lon >= 70 && lon < 105) // Central Asia: poplar oases below, Tianshan spruce in the mountains
    return { low: { broadleaf: 6, birch: 1 }, high: { spruce: 8, birch: 1, larch: 1 }, highAbove: 1500, treeline: 3200, darkV: 0.25 };
  if (lon >= -140 && lon <= -100 && lat >= 35 && lat < 62) // western North America: Rockies and Cascades
    return { low: { pine: 5, spruce: 4, birch: 1 }, high: { spruce: 5, pine: 3, larch: 1 }, highAbove: 1600, treeline: 3300, darkV: 0.27 };
  if (lon > -100 && lon <= -50 && lat >= 35 && lat < 55) // eastern North America: maple and birch, famous autumn colour
    return { low: { broadleaf: 6, birch: 2, pine: 2 }, high: { spruce: 4, birch: 2 }, highAbove: 1000, treeline: 1700, darkV: 0.3 };
  if (lon >= -12 && lon <= 45 && lat >= 42 && lat < 62) // Europe: beech and oak below, spruce and larch in the mountains
    return { low: { broadleaf: 5, pine: 2, spruce: 3 }, high: { spruce: 6, larch: 2, pine: 2 }, highAbove: 900, treeline: 2100, darkV: 0.28 };
  if (lat <= -32) // southern temperate: evergreen beech and plantation pine
    return { low: { broadleaf: 6, pine: 3, spruce: 1 }, treeline: 1600, darkV: 0.28, evergreen: true };
  if (lat >= 26 && lat < 36 && lon >= 78 && lon < 104) // Hengduan, Himalaya
    return { low: { broadleaf: 3, pine: 3 }, high: { spruce: 5, larch: 3, birch: 1 }, highAbove: 3000, treeline: 4400, darkV: 0.28 };
  if (a < 23.5) // tropics
    return { low: { palm: 3, broadleaf: 6, bamboo: 1 }, high: { broadleaf: 3, pine: 1 }, highAbove: 1800, treeline: 3600, darkV: 0.33, evergreen: true };
  if (lat >= 23.5 && lat < 32 && lon >= 100 && lon <= 123) // south China: evergreen broadleaf and bamboo
    return { low: { broadleaf: 5, bamboo: 3, pine: 2 }, high: { pine: 3, broadleaf: 2, spruce: 1 }, highAbove: 1500, treeline: 2900, darkV: 0.33, evergreen: true };
  if (a >= 55) return { low: { spruce: 5, larch: 3, birch: 2 }, treeline: 900, darkV: 0.27 };
  if (a >= 32) return { low: { broadleaf: 5, pine: 3, birch: 2 }, high: { spruce: 3, pine: 2, birch: 1 }, highAbove: 1200, treeline: 2800, darkV: 0.3 };
  return { low: { broadleaf: 5, pine: 3, spruce: 2 }, treeline: 3000, darkV: 0.3 };
}

// Season of the trip that brought you here, as a northern-hemisphere day of year (shifted half a
// year south of the equator). A month-only date counts as mid-month.
function seasonFor(name, lat) {
  const sel = byId(state.sel);
  const t = sel && sel.kind === 'trip' && sel.stops.some(s => s.place === name) ? sel
    : trips.filter(x => x.stops.some(s => s.place === name)).pop();
  if (!t || !t.date || t.date.prec === 'year') return { name: 'summer', month: 7, day: 196 };
  const d = new Date(t.date.start);
  if (t.date.prec === 'month') d.setDate(15);
  let day = Math.round((d - new Date(d.getFullYear(), 0, 1)) / DAY) + 1;
  if (lat < 0) day = (day + 182) % 365;
  const m = new Date(2001, 0, day).getMonth() + 1;
  const season = m >= 3 && m <= 4 ? 'spring' : m >= 5 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
  return { name: season, month: m, day };
}

function focusPlace() {
  const cam = viewer.camera;
  if (cam.positionCartographic.height > 26000) return null;
  // A flight already supplies its exact orbit centre. Avoid re-intersecting thousands of terrain triangles.
  let hit = orbit;
  if (!hit) {
    hit = cam.pickEllipsoid(new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2), Cesium.Ellipsoid.WGS84);
  }
  if (!hit) return null;
  let best = null, bestD = 30000;
  for (const [name, L] of lights) {
    if (L.cur < 0.5) continue;
    const d = Cesium.Cartesian3.distance(hit, L.pos);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function clearScenery() {
  sceneryManager?.exit();
  scenery.token++;
  scenery.controller?.abort();
  scenery.controller = null;
  scenery.clouds = [];
  scenery.plants = [];
  scenery.name = null;
  const u = nightMaterial.uniforms;
  u.fpFocus.w = 0;
  u.fpAutumn = 0;
  for (let i = 0; i < MAX_CLOUDS; i++) u[cloudName(i)].w = 0;
}

function setScenery(name) {
  clearScenery();
  if (!name) return;
  const center = posOf(name);
  if (!center) return;
  scenery.name = name;
  const location = state.places[name];
  scenery.template = sceneryManager.enter({ name, lon: location.lon, lat: location.lat,
    height: (location.h || 0) * EXAGGERATION, groundHeight:location.h||0,
    exaggeration: EXAGGERATION, month: seasonFor(name, location.lat).month });
  scenery.center = center;
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  scenery.east = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(enu, 0, new Cesium.Cartesian4()));
  scenery.north = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(enu, 1, new Cesium.Cartesian4()));
  scenery.up = Cesium.Cartesian3.fromCartesian4(Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4()));
  const u = nightMaterial.uniforms;
  Cesium.Cartesian3.clone(center, u.fpFocus);
  u.fpFocus.w = SCENERY_RADIUS;
  Cesium.Cartesian3.clone(scenery.east, u.fpWind);

  // Fair-weather clouds drifting east. Only their shadows are drawn: sweeping across the slopes they
  // read as real weather, while billboard clouds in the sky looked like cotton balls.
  const rnd = mulberry32(hashStr(name));
  for (let i = 0; i < MAX_CLOUDS; i++) {
    scenery.clouds.push({
      e: (rnd() * 2 - 1) * SCENERY_RADIUS, n: (rnd() * 2 - 1) * SCENERY_RADIUS * 0.8,
      alt: 1300 + rnd() * 1300, w: 2000 + rnd() * 2400,
    });
  }
  const token = scenery.token;
  scenery.controller = new AbortController();
  scenery.ready = false;
  buildVegetation(name, token, scenery.controller.signal).catch(e => {
    if (e.name !== 'AbortError') {if(token===scenery.token)sceneryManager.unavailable(name);console.warn('Vegetation unavailable:', e.message);}
  }).finally(() => {
    if (token === scenery.token) { scenery.ready = true; scene.requestRender(); }
  });
}

const scratchOff = new Cesium.Cartesian3();
function offsetFrom(center, e, n, h, result) {
  Cesium.Cartesian3.multiplyByScalar(scenery.east, e, scratchOff);
  Cesium.Cartesian3.add(center, scratchOff, result);
  Cesium.Cartesian3.multiplyByScalar(scenery.north, n, scratchOff);
  Cesium.Cartesian3.add(result, scratchOff, result);
  Cesium.Cartesian3.multiplyByScalar(scenery.up, h, scratchOff);
  return Cesium.Cartesian3.add(result, scratchOff, result);
}

function updateScenery(now, dt) {
  if (now - scenery.lastCheck > 600 && !flying && !scenery.pinned) {
    scenery.lastCheck = now;
    const f = focusPlace();
    if (f !== scenery.name) setScenery(f);
  }
  // Close to the ground the trip arcs would shoot through the sky like lasers; hide them there.
  const close = !!scenery.name && viewer.camera.positionCartographic.height -
    (scenery.name ? (state.places[scenery.name].h || 0) * EXAGGERATION : 0) < 20000;
  if (arcSource) arcSource.show = !close;
  if (!scenery.name) return;
  sceneryManager.update({ now, day: dayMix });
  const u = nightMaterial.uniforms, t = u.fpTime;
  u.fpAutumn=scenery.template.autumn||0;
  // Shadow falls away from the light: shift each cloud's footprint along the horizontal light direction.
  const L = scratchLight, Lup = Math.max(0.2, Cesium.Cartesian3.dot(L, scenery.up));
  const Le = Cesium.Cartesian3.dot(L, scenery.east), Ln = Cesium.Cartesian3.dot(L, scenery.north);
  scenery.clouds.forEach((c, i) => {
    c.e += WIND_SPEED * dt;
    if (c.e > SCENERY_RADIUS) c.e -= SCENERY_RADIUS * 2;
    const k = c.alt / Lup, s = u[cloudName(i)];
    offsetFrom(scenery.center, c.e - Le * k, c.n - Ln * k, 0, s);
    s.w = c.w * 0.55;
  });

}

async function buildVegetation(name, token, signal) {
  const p = state.places[name];
  const z = VEG_TILE_ZOOM, n = 2 ** z, T = VEG_TILES, half = (T - 1) / 2;
  const latR = p.lat * Math.PI / 180;
  const fx = (p.lon + 180) / 360 * n;
  const fy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
  const x0 = Math.floor(fx) - half, y0 = Math.floor(fy) - half;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256 * T;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    const jobs = [];
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y0 + j}/${x0 + i}`;
      jobs.push(async () => {
        signal.throwIfAborted();
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Imagery HTTP ${response.status}`);
        const img = await createImageBitmap(await response.blob());
        try { if (!signal.aborted) ctx.drawImage(img, i * 256, j * 256); }
        finally { img.close(); }
      });
    }
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < jobs.length && !signal.aborted) await jobs[next++]();
    }));
  } catch (e) {
    if (token === scenery.token) sceneryManager.unavailable(name);
    if (token === scenery.token) scenery.controller?.abort();
    return;
  }
  if (token !== scenery.token) return;

  const rnd = mulberry32(hashStr(name) ^ 99);
  const biome = biomeAt(p.lat, p.lon), season = seasonFor(name, p.lat);
  const lite = constrainedDevice(runtimeDeviceConfig());
  const theme = scenery.template;
  const plants = await prepareVegetation({
    width: canvas.width, darkV: biome.darkV, blossom: season.name === 'spring' && !!biome.low.cherry,
    arid: theme.id==='desert',
    focusGrass:theme.id==='grassland',
    cpx: (fx - x0) * 256, cpy: (fy - y0) * 256,
    mPerPx: 40075016 * Math.cos(latR) / (n * 256), radius: VEG_RADIUS,
    x0, y0, n, seed: hashStr(name) ^ 99, treeCap: Math.round((lite ? 600 : MAX_TREES) * theme.density),
    flowerCap: theme.id === 'grassland' ? (lite ? 250 : 1200) : 0,
  }, () => ctx.getImageData(0, 0, canvas.width, canvas.height).data, signal);
  if (token !== scenery.token) return;
  if (!plants.length) { await sceneryManager.populate(name, []); return; }

  const cartos = plants.map(s => Cesium.Cartographic.fromDegrees(s.lon, s.lat));
  try { await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, cartos); }
  catch (e) { try { await Cesium.sampleTerrain(viewer.terrainProvider, 13, cartos); } catch (e2) {
    if(token===scenery.token)sceneryManager.unavailable(name);return;
  } }
  if (token !== scenery.token) return;

  const placements = [];
  for (let i = 0; i < plants.length; i++) {
    const ground = cartos[i].height;
    if (!Number.isFinite(ground) || ground > theme.treeline) continue;
    const entries=Object.entries(plants[i].kind==='tree'&&theme.treeSpecies?theme.treeSpecies:theme.species);
    const total=entries.reduce((n,[,w])=>n+w,0);
    let roll = rnd() * total, kind = entries[0][0];
    for (const [species, weight] of entries) if ((roll -= weight) <= 0) { kind = species; break; }
    const small = kind === 'grass' || kind === 'shrub';
    const height = kind === 'grass' ? 1.5 + rnd() * 2 : kind === 'shrub' ? 3 + rnd() * 4 :
      kind === 'spruce' ? 26 + rnd() * 28 : kind === 'birch' ? 20 + rnd() * 15 : 15 + rnd() * 18;
    placements.push({ lon: plants[i].lon, lat: plants[i].lat, ground: ground + 0.3,
      species: kind, height, width: small ? 1.2 : .75 + rnd() * .4, angle: rnd() * Math.PI * 2 });
  }
  if (token !== scenery.token || signal.aborted) return;
  const suitable=await filterSteepPlants(placements,{signal});
  if(token!==scenery.token||signal.aborted)return;
  scenery.plants = suitable;
  await sceneryManager.populate(name, suitable);
}


/* ---------- HTML markers ---------- */

let lastNear = null, markersDirty = true, markerWidth = 0, markerHeight = 0;
let markerMix = -1, markerRelief = false;
const markerView = new Cesium.Matrix4();
const markerOccluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, Cesium.Cartesian3.ZERO);
const markerScratch = new Cesium.Cartesian3(), markerPosition = new Cesium.Cartesian3(), markerWindow = new Cesium.Cartesian2();

function renderMarkers() {
  const box = $('#markers');
  box.innerHTML = '';
  markers = [];
  markersDirty = true;
  if (!viewer) return;
  syncLights();
  const byPlace = new Map();
  for (const t of trips) for (const s of t.stops) {
    if (!byPlace.has(s.place)) byPlace.set(s.place, { trips: [], home: null });
    byPlace.get(s.place).trips.push(t);
  }
  for (const h of homes) {
    if (!byPlace.has(h.place)) byPlace.set(h.place, { trips: [], home: null });
    const e = byPlace.get(h.place);
    if (!e.home || (h.kind === 'home' && e.home.kind !== 'home')) e.home = h;
  }
  for (const [name, info] of byPlace) {
    const pos = posOf(name);
    if (!pos) continue;
    const el = document.createElement('div');
    const latest = info.trips[info.trips.length - 1];
    let cls = 'mk', prefix = '';
    if (info.home) { cls += ' ' + info.home.kind; prefix = info.home.kind === 'home' ? '现居' : '曾居'; }
    el.className = cls;
    el.style.setProperty('--c', latest ? typeColors[latest.type] : HOME_COLOR);
    el.innerHTML = (info.home ? '<span class="mk-ring"></span>' : '<span class="mk-pulse"></span>') +
      `<span class="mk-core"></span><span class="mk-label">${prefix ? `<em>${prefix}</em>` : ''}${esc(coreName(name))}</span>`;
    el.addEventListener('click', e => { e.stopPropagation(); onMarkerClick(name, info); });
    box.appendChild(el);
    markers.push({ name, el, pos, trips: info.trips, home: info.home, vis: null, filtered: false });
  }
  lastNear = null;
  updateMarkerClasses();
}

function onMarkerClick(name, info) {
  const sel = byId(state.sel);
  if (sel && (sel.kind === 'trip' ? sel.stops.some(s => s.place === name) : sel.place === name)) {
    flyToPoints([posOf(name)], { close: true, placeName:name });
    return;
  }
  const candidates = info.trips.filter(inYear);
  const target = candidates[candidates.length - 1] || info.home || info.trips[info.trips.length - 1];
  if (target) select(target.id);
}

function updateMarkerClasses() {
  markersDirty = true;
  const sel = byId(state.sel);
  const selPlaces = new Set();
  if (sel) {
    if (sel.kind === 'trip') { sel.stops.forEach(s => selPlaces.add(s.place)); if (sel.origin) selPlaces.add(sel.origin.place); }
    else selPlaces.add(sel.place);
  }
  for (const m of markers) {
    m.filtered = !!state.year && !m.home && !m.trips.some(inYear);
    m.el.classList.toggle('sel', selPlaces.has(m.name));
    m.el.classList.toggle('dim', !!sel && !selPlaces.has(m.name));
  }
  if (scene) scene.requestRender();
}

function updateMarkers() {
  if (!markers.length) return;
  const cam = viewer.camera;
  const width = viewer.canvas.clientWidth, height = viewer.canvas.clientHeight;
  const mix = +(viewer.canvas.dataset.earthMix || 0), relief = viewer.canvas.dataset.worldRelief === 'true';
  if (!markersDirty && mix === markerMix && relief === markerRelief && width === markerWidth && height === markerHeight && Cesium.Matrix4.equals(cam.viewMatrix, markerView)) return;
  markerMix = mix; markerRelief = relief;
  markersDirty = false; markerWidth = width; markerHeight = height;
  Cesium.Matrix4.clone(cam.viewMatrix, markerView);
  const camPos = cam.positionWC;
  markerOccluder.cameraPosition = camPos;
  const near = cam.positionCartographic.height < 1.8e6;
  const toWin = Cesium.SceneTransforms.worldToWindowCoordinates || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
  const dir = cam.directionWC;
  for (const m of markers) {
    const place = state.places[m.name];
    if (relief && !m.globalPos) m.globalPos = Cesium.Cartesian3.fromDegrees(place.lon,place.lat,cinematic.groundHeight(place.lon,place.lat)+18000);
    const position = m.globalPos ? Cesium.Cartesian3.lerp(m.pos,m.globalPos,mix,markerPosition) : m.pos;
    let vis = !m.filtered && markerOccluder.isPointVisible(position) &&
      Cesium.Cartesian3.dot(dir, Cesium.Cartesian3.subtract(position, camPos, markerScratch)) > 0;
    if (vis) {
      const w=toWin(scene,position,markerWindow);
      if (w && w.x > -120 && w.x < width + 120 && w.y > -80 && w.y < height + 80)
        m.nextTransform = `translate3d(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px, 0)`;
      else vis = false;
    }
    m.nextVisible = vis;
  }
  // Finish every projection before writing any DOM style.
  if (near !== lastNear) { body.classList.toggle('near', near); lastNear = near; }
  for(const m of markers) {
    if(m.nextVisible && m.nextTransform !== m.transform) {m.el.style.transform=m.nextTransform;m.transform=m.nextTransform;}
    if(m.nextVisible !== m.vis) {m.el.style.display=m.nextVisible?'':'none';m.vis=m.nextVisible;}
  }
}

/* ---------- arcs ---------- */

function arcPositions(a, b, n = 72) {
  const ca = Cesium.Cartographic.fromCartesian(a), cb = Cesium.Cartographic.fromCartesian(b);
  const geod = new Cesium.EllipsoidGeodesic(ca, cb);
  const peak = Math.min(Math.max(geod.surfaceDistance * 0.18, 2500), 450000);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, c = geod.interpolateUsingFraction(f);
    out.push(Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, ca.height * (1 - f) + cb.height * f + Math.sin(Math.PI * f) * peak + 40));
  }
  return out;
}

function renderArcs() {
  if (!arcSource) return;
  arcSource.entities.removeAll();
  arcEntities = [];
  originEntity = null;
  for (const t of trips) {
    const pts = t.stops.map(s => posOf(s.place)).filter(Boolean);
    for (let i = 0; i < pts.length - 1; i++) {
      const e = arcSource.entities.add({
        polyline: { positions: arcPositions(pts[i], pts[i + 1]), width: 4, arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.22, color: Cesium.Color.fromCssColorString(typeColors[t.type]).withAlpha(0.8) }) },
      });
      arcEntities.push({ trip: t, e });
    }
  }
  updateArcs();
}

function updateArcs() {
  const sel = byId(state.sel);
  for (const { trip, e } of arcEntities) {
    e.show = inYear(trip);
    e.polyline.width = sel && sel.id === trip.id ? 7 : 4;
  }
  // Dashed arc from where the person lived at the time to the selected trip.
  if (originEntity) { arcSource.entities.remove(originEntity); originEntity = null; }
  if (sel && sel.kind === 'trip' && sel.origin) {
    const a = posOf(sel.origin.place), firstStop = sel.stops.find(s => located(s.place));
    const b = firstStop && posOf(firstStop.place);
    if (a && b && Cesium.Cartesian3.distance(a, b) > 30000) {
      originEntity = arcSource.entities.add({
        polyline: { positions: arcPositions(a, b, 96), width: 2.2, arcType: Cesium.ArcType.NONE,
          material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(HOME_COLOR).withAlpha(0.75), dashLength: 18 }) },
      });
    }
  }
}

/* ================= UI ================= */

function refresh() {
  buildModel();
  body.classList.toggle('is-empty', !state.rows.length);
  renderStats();
  renderChips();
  renderList();
  renderTimeline();
  renderCard();
  renderMarkers();
  renderArcs();
  if (scene) { lightsAnimating = true; scene.requestRender(); }
  if (body.classList.contains('modal-open') && currentTab === 'places') renderTab();
}

function renderStats() {
  const days = trips.reduce((s, t) => s + (t.date && t.date.days || 0), 0);
  const tripPlaces = new Set(trips.flatMap(t => t.stops.map(s => s.place)));
  const years = trips.filter(t => t.year).map(t => t.year);
  const parts = [];
  if (trips.length) parts.push(`<b>${trips.length}</b> 次旅行`, `<b>${tripPlaces.size}</b> 个地点`);
  if (days) parts.push(`<b>${days}</b> 天在路上`);
  if (years.length) {
    const a = Math.min(...years), b = Math.max(...years);
    parts.push(a === b ? `<b>${a}</b>` : `<b>${a}</b>–<b>${b}</b>`);
  }
  const current = homes.find(h => h.kind === 'home');
  if (current) parts.push(`<span class="home-stat">现居 <b>${esc(coreName(current.place))}</b></span>`);
  $('#stats').innerHTML = parts.map(part => `<span class="stat-item">${part}</span>`).join('<i>·</i>');
}

function statusOf(p) {
  if (!p) return { cls: 'wait', text: '定位中', pending: true };
  return {
    confirmed: { cls: 'ok', text: '已确认', pending: false },
    auto: { cls: 'auto', text: '待确认', pending: true },
    rough: { cls: 'rough', text: '仅定位到省份', pending: true },
    notfound: { cls: 'bad', text: '未找到', pending: true },
  }[p.status] || { cls: 'auto', text: '待确认', pending: true };
}
const pendingPlaces = () => placeNames().filter(n => state.places[n] && state.places[n].status !== 'confirmed');

function renderChips() {
  const out = [];
  if(sceneDemo)out.push('<a class="chip" href="./">景观演示 · 返回我的足迹</a>');
  if (geo.busy) out.push(`<span class="chip busy"><span class="spin"></span>正在定位地点 ${geo.done}/${geo.total}</span>`);
  else if (geo.failed) out.push('<button class="chip bad" data-act="retry">定位服务连接失败 · 重试</button>');
  const n = pendingPlaces().length;
  if (n && !geo.busy) out.push(`<button class="chip" data-act="fix">${n} 个地点待确认 →</button>`);
  $('#chips').innerHTML = out.join('');
  $('#tab-badge').textContent = n || '';
  $('#data-dot').hidden = !n;
}

function itemHTML(x) {
  const on = state.sel === x.id ? ' on' : '';
  if (x.kind === 'trip') {
    return `<button class="item${on}" data-id="${esc(x.id)}" style="--c:${typeColors[x.type]}"><span class="item-bar"></span>
      <span class="item-main"><span class="item-title">${esc(x.title)}</span>
      <span class="item-meta">${esc(x.date ? x.date.short : '日期未知')} · ${x.stops.length} 个地点</span></span></button>`;
  }
  return `<button class="item${on}" data-id="${esc(x.id)}"><span class="glyph ${x.kind}"></span>
    <span class="item-main"><span class="item-title">${esc(x.title)}</span>
    <span class="item-meta">${x.kind === 'home' ? '现居' : '曾居'}${x.date ? ' · ' + esc(x.date.label) : ''}</span></span></button>`;
}

function renderList() {
  const list = visibleTrips().slice().reverse();
  $('#list-count').textContent = list.length;
  $('#list-filter').innerHTML = state.year
    ? `<span class="filter-chip">仅看 ${state.year}<button data-act="clear-year" aria-label="取消筛选">${ICON.close}</button></span>` : '';
  const types = Object.keys(typeColors);
  $('#legend').innerHTML = types.length > 1 ? types.map(t => `<span style="--c:${typeColors[t]}"><i></i>${esc(t)}</span>`).join('') : '';
  let html = '<div class="grp"><div class="grp-label">常驻地</div>';
  html += homes.length ? homes.map(itemHTML).join('')
    : '<p class="hint">在表格的「类型」列填 <b>现居地</b> 或 <b>曾居地</b>，日期写居住时段（如 2022-07~至今），就能在地图上标出来。</p>';
  html += '</div>';
  const groups = new Map();
  for (const t of list) {
    const k = t.year ?? '日期未知';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  for (const [y, ts] of groups) html += `<div class="grp"><div class="grp-label">${y}</div>${ts.map(itemHTML).join('')}</div>`;
  $('#list-body').innerHTML = html;
}

function renderTimeline() {
  const dated = trips.filter(t => t.date);
  $('#timeline').classList.toggle('empty', !dated.length);
  if (!dated.length) { $('#tl-track').innerHTML = ''; return; }
  const y0 = Math.min(...dated.map(t => t.year)), y1 = Math.max(...dated.map(t => t.endYear));
  const T0 = new Date(y0, 0, 1).getTime(), T1 = new Date(y1 + 1, 0, 1).getTime();
  const P = d => Math.min(100, Math.max(0, (d - T0) / (T1 - T0) * 100));
  const span = y1 - y0 + 1, step = span > 12 ? Math.ceil(span / 8) : 1;
  let html = '<div class="tl-rail"></div>';
  for (const h of homes) {
    if (!h.date || h.date.end < T0 || h.date.start > T1) continue;
    const l = P(h.date.start), r = P(h.date.end);
    html += `<button class="tl-band ${h.kind}${state.sel === h.id ? ' on' : ''}" data-id="${esc(h.id)}" style="left:${l}%;width:${Math.max(r - l, .6)}%" title="${h.kind === 'home' ? '现居' : '曾居'} · ${esc(coreName(h.place))} · ${esc(h.date.label)}"></button>`;
  }
  for (let y = y0; y <= y1; y++) {
    if (y > y0) html += `<span class="tl-sep" style="left:${P(new Date(y, 0, 1).getTime())}%"></span>`;
    if ((y - y0) % step === 0) {
      const has = dated.some(t => t.year === y);
      html += `<button class="tl-year${has ? ' has' : ''}${state.year === y ? ' on' : ''}" data-year="${y}" style="left:${P(new Date(y, 6, 1).getTime())}%">${y}</button>`;
    }
  }
  for (const t of dated) {
    const edge = P(t.date.start) > 82 ? ' at-end' : P(t.date.start) < 18 ? ' at-start' : '';
    html += `<button class="tl-dot${edge}${state.sel === t.id ? ' on' : ''}${inYear(t) ? '' : ' off'}" data-id="${esc(t.id)}" style="left:${P(t.date.start)}%;--c:${typeColors[t.type]}" aria-label="${esc(t.title)}"><span class="tl-tip">${esc(t.title)} · ${esc(t.date.short)}</span></button>`;
  }
  $('#tl-track').innerHTML = html;
}

function stopHTML(place, note, color) {
  const st = statusOf(state.places[place]);
  return `<li><button class="stop" data-place="${esc(place)}" style="--c:${color}"><span class="stop-dot"></span>
    <span class="stop-main"><span class="stop-name">${esc(place)}</span>${note ? `<span class="stop-note">${esc(note)}</span>` : ''}</span>
    ${st.pending ? `<span class="badge ${st.cls}">${st.text}</span>` : ''}${located(place) ? '<span class="stop-go">近看</span>' : ''}</button></li>`;
}

function renderCard() {
  const el = $('#card');
  const x = byId(state.sel);
  body.classList.toggle('card-open', !!x);
  if (!x) { el.classList.remove('show'); return; }
  let html = `<button class="x card-x" data-act="close" aria-label="关闭">${ICON.close}</button>`;
  if (x.kind === 'trip') {
    const color = typeColors[x.type];
    const list = visibleTrips(), idx = list.indexOf(x);
    el.style.setProperty('--c', color);
    html += `<div class="card-kicker"><span class="dot"></span>${esc(x.type)} · 第 ${x.n} 次</div>
      <h2>${esc(x.title)}</h2>
      <div class="card-date">${esc(x.date ? x.date.label : '日期未知')}${x.date && x.date.days ? ` <span>· ${x.date.days} 天</span>` : ''}</div>
      ${x.origin ? `<div class="card-from">从 <button data-id="${esc(x.origin.id)}">${esc(coreName(x.origin.place))}</button> 出发</div>` : ''}
      <ol class="stops">${x.stops.map(s => stopHTML(s.place, s.note, color)).join('')}</ol>
      <div class="card-nav"><button data-act="prev"${idx <= 0 ? ' disabled' : ''}>‹ 上一次</button>
      <span>${idx + 1} / ${list.length}</span><button data-act="next"${idx < 0 || idx >= list.length - 1 ? ' disabled' : ''}>下一次 ›</button></div>`;
  } else {
    el.style.setProperty('--c', HOME_COLOR);
    const dur = x.date ? durationText(x.date) : '';
    const fromHere = trips.filter(t => t.origin === x);
    html += `<div class="card-kicker"><span class="dot ${x.kind}"></span>${x.kind === 'home' ? '现居地' : '曾居地'}</div>
      <h2>${esc(x.title)}</h2>
      <div class="card-date">${x.date ? esc(x.date.label) : '时间未填写'}${dur ? ` <span>· ${dur}</span>` : ''}</div>
      <ol class="stops">${stopHTML(x.place, x.note, HOME_COLOR)}</ol>
      ${fromHere.length ? `<div class="sub-title">住在这里时的旅行 · ${fromHere.length}</div>
        ${fromHere.map(t => `<button class="mini" data-id="${esc(t.id)}"><span>${esc(t.title)}</span><span>${esc(t.date ? t.date.label : '')}</span></button>`).join('')}` : ''}`;
  }
  el.innerHTML = html;
  el.scrollTop = 0;
  requestAnimationFrame(() => el.classList.add('show'));
}

function updateSelectionUI() {
  for (const b of document.querySelectorAll('[data-id]')) {
    if (b.closest('#card')) continue;
    b.classList.toggle('on', b.dataset.id === state.sel);
  }
  updateMarkerClasses();
  updateArcs();
}

function select(id, { fly = true } = {}) {
  const x = byId(id);
  if (!x) return;
  state.sel = id;
  renderCard();
  updateSelectionUI();
  if (isMobile()) body.classList.remove('list-open');
  if (fly) flyToItem(x);
}

function deselect({ home = true } = {}) {
  state.sel = null;
  renderCard();
  updateSelectionUI();
  if (home) homeView();
}

function step(dir) {
  const list = visibleTrips(), x = byId(state.sel);
  const i = list.indexOf(x);
  const next = list[i + dir];
  if (next) select(next.id);
}

function setYear(y) {
  state.year = state.year === y ? null : y;
  const x = byId(state.sel);
  if (x && x.kind === 'trip' && !inYear(x)) { state.sel = null; renderCard(); }
  renderList();
  renderTimeline();
  updateSelectionUI();
  if (!state.year) { homeView(); return; }
  const pts = [...new Set(visibleTrips().flatMap(t => t.stops.map(s => s.place)))].map(n => posOf(n)).filter(Boolean);
  if (pts.length) flyToPoints(pts, { duration: 2.6 });
}

/* ---------- replay ---------- */

function updatePlayUI() {
  $('#btn-play').innerHTML = state.playing ? ICON.stop : ICON.play;
  $('#btn-play').title = state.playing ? '停止回放' : '按时间顺序回放';
}

function toggleTone() {
  cinematicDay = !cinematicDay;
  body.classList.toggle('night-mode', !cinematicDay);
  const button = $('#btn-tone');
  button.classList.toggle('on', !cinematicDay);
  button.setAttribute('aria-pressed', String(!cinematicDay));
  button.setAttribute('aria-label', cinematicDay ? '切换足迹夜景' : '切换日间地球');
  button.title = cinematicDay ? '切换足迹夜景（N）' : '切换日间地球（N）';
  lightsAnimating = true;
  if (scene) scene.requestRender();
}

async function play() {
  if (state.playing) { stopPlay(); return; }
  const list = visibleTrips().filter(t => t.stops.some(s => located(s.place)));
  if (!list.length) { toast('还没有可以回放的足迹'); return; }
  state.playing = true;
  const token = ++playToken;
  updatePlayUI();
  body.classList.remove('list-open');
  replayLit = new Set(); // the world goes dark, then lights up stop by stop
  const first = list[0];
  if (first.origin && located(first.origin.place)) {
    select(first.origin.id, { fly: false });
    $('#tl-status').textContent = '从这里出发';
    await flyToItem(first.origin, { duration: 3 });
    if (token !== playToken) return;
    replayLit.add(first.origin.place);
    await sleep(2200);
  }
  for (let i = 0; i < list.length; i++) {
    if (token !== playToken) return;
    $('#tl-status').textContent = `回放 ${i + 1} / ${list.length}`;
    select(list[i].id, { fly: false });
    if (list[i].origin) replayLit.add(list[i].origin.place);
    await flyToItem(list[i], { duration: i === 0 && !first.origin ? 3.4 : 4.2 });
    if (token !== playToken) return;
    list[i].stops.forEach(s => replayLit.add(s.place));
    await sleep(4200);
  }
  if (token === playToken) { stopPlay(); deselect(); }
}

function stopPlay() {
  playToken++;
  state.playing = false;
  replayLit = null;
  $('#tl-status').textContent = '';
  updatePlayUI();
}

/* ---------- pick on map ---------- */

function startPick(name) {
  closeModal();
  pickName = name;
  body.classList.add('picking');
  $('#pickbar').innerHTML = `<div>点击地球，设置「${esc(coreName(name))}」的位置<small>可以先拖动、缩放到附近再点</small></div>
    <button class="btn sm" data-act="cancel-pick">取消</button>`;
  const p = state.places[name];
  if (p && p.lat != null) {
    orbit = null;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 160000), duration: 2 });
  }
}
function endPick() {
  pickName = null;
  body.classList.remove('picking');
}

/* ---------- data modal ---------- */

let currentTab = 'import', draft = null;

function openModal(tab = 'import') {
  draft = state.rows.map(r => ({ ...r }));
  body.classList.add('modal-open');
  switchTab(tab);
}
function closeModal() { body.classList.remove('modal-open'); }
function switchTab(tab) {
  currentTab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  renderTab();
}

function renderTab() {
  const el = $('#dlg-body');
  if (currentTab === 'import') {
    el.innerHTML = `
      <label class="drop" id="drop">${ICON.upload}<input type="file" id="file" accept=".csv,.txt,text/csv" hidden>
        <div><b>拖入 CSV 文件</b>，或点击选择</div><div class="faint">支持 Excel / Numbers / 飞书表格导出的 CSV</div></label>
      <div class="or">或者直接粘贴表格内容</div>
      <textarea id="paste" placeholder="日期,行程,地点,类型,备注&#10;2025-04,京都赏樱,日本京都,旅行,"></textarea>
      <div class="imp-actions">
        <div class="seg"><label><input type="radio" name="mode" value="append" checked>追加到现有数据</label><label><input type="radio" name="mode" value="replace">替换全部</label></div>
        <button class="btn primary" data-act="import">导入</button>
      </div>
      <div class="schema"><h4>表格格式</h4><table>
        <tr><td>日期</td><td>建议</td><td><code>2023-03-30~2023-04-04</code>、<code>2024-06</code>、<code>2025</code>；常驻地可写 <code>2022-07~至今</code></td></tr>
        <tr><td>行程</td><td>建议</td><td>同一日期、同一行程的多行会合并成一次旅行</td></tr>
        <tr><td>地点</td><td>必填</td><td>尽量写「省份 + 地名」，例如 <code>四川稻城亚丁</code>，自动定位更准</td></tr>
        <tr><td>类型</td><td>可选</td><td>旅行、出差、徒步……不同类型用不同颜色；填 <code>现居地</code> / <code>曾居地</code> 会标为常驻地</td></tr>
        <tr><td>备注</td><td>可选</td><td>显示在卡片上</td></tr>
        <tr><td>坐标</td><td>可选</td><td><code>纬度,经度</code>，填了就不再自动定位</td></tr>
      </table></div>
      <div class="row-actions">
        <button class="btn" data-act="template">下载模板</button>
        <button class="btn" data-act="export">导出当前数据（含坐标）</button>
        <button class="btn danger" data-act="clear">清空全部</button>
      </div>`;
    const drop = $('#drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]); });
    $('#file').addEventListener('change', e => { if (e.target.files[0]) importFile(e.target.files[0]); });
  } else if (currentTab === 'edit') {
    el.innerHTML = `
      <div class="edit-head"><span class="muted">直接修改单元格，改完点「保存」。</span>
        <div><button class="btn" data-act="add-row">＋ 添加一行</button><button class="btn primary" data-act="save-rows">保存</button></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="c-date">日期</th><th>行程</th><th>地点</th><th class="c-type">类型</th><th>备注</th><th class="c-del"></th></tr></thead>
      <tbody>${draft.map((r, i) => `<tr>${['date', 'trip', 'place', 'type', 'note'].map(k =>
        `<td><input data-i="${i}" data-k="${k}" value="${esc(r[k])}"${k === 'place' ? ' placeholder="必填"' : ''}></td>`).join('')}
        <td><button class="x" data-act="del-row" data-i="${i}" aria-label="删除">${ICON.close}</button></td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const names = placeNames();
    const rank = n => { const p = state.places[n]; return !p ? 1 : p.status === 'confirmed' ? 3 : p.status === 'notfound' ? 0 : 2; };
    names.sort((a, b) => rank(a) - rank(b));
    el.innerHTML = `
      <div class="pl-head"><span class="muted">自动定位不一定准。确认或修正一次后会被记住，再次导入也不用重做。</span></div>
      ${names.length ? names.map(n => {
        const p = state.places[n], st = statusOf(p);
        const sub = !p ? '正在自动定位…' : p.lat == null ? '自动定位没有找到这个地方，可以换个说法搜索，或在地图上点选'
          : `${p.status === 'rough' ? '只找到了省份，' : ''}${esc((p.label || '').slice(0, 60))} · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
        return `<div class="pl" data-name="${esc(n)}">
          <div class="pl-top"><span class="pl-name">${esc(n)}</span><span class="badge ${st.cls}">${st.text}</span></div>
          <div class="pl-sub">${sub}</div>
          <div class="pl-actions">
            ${p && p.lat != null ? '<button class="btn sm" data-act="view">在地图上看</button>' : ''}
            ${p && p.lat != null && p.status !== 'confirmed' ? '<button class="btn sm primary" data-act="ok">位置正确</button>' : ''}
            <button class="btn sm" data-act="search">搜索其他位置</button>
            <button class="btn sm" data-act="pick">在地图上点选</button>
          </div>
          <div class="search-box" hidden><div class="search-row"><input placeholder="换个说法，比如：景区全名、附近的村镇" value="${esc(coreName(n))}"><button class="btn sm" data-act="do-search">搜索</button></div><div class="results"></div></div>
        </div>`;
      }).join('') : '<p class="muted">还没有地点。</p>'}`;
  }
}

async function importFile(file) {
  try { $('#paste').value = await readFileText(file); doImport(); }
  catch (e) { toast('读取文件失败：' + e.message); }
}

function doImport() {
  const text = $('#paste').value.trim();
  if (!text) { toast('先选择文件或粘贴内容'); return; }
  const mode = (document.querySelector('input[name=mode]:checked') || {}).value || 'append';
  try {
    const n = importCsvText(text, mode);
    state.sel = null; state.year = null;
    closeModal();
    refresh();
    toast(`已导入 ${n} 条记录`);
    sampleHeights();
    geocodeMissing();
    homeView();
  } catch (e) {
    toast('导入失败：' + e.message, 4000);
  }
}

async function onPlaceAction(act, card, btn) {
  const name = card.dataset.name;
  if (act === 'view') { closeModal(); flyToPoints([posOf(name)]); }
  else if (act === 'ok') { setPlace(name, { ...state.places[name], status: 'confirmed' }); toast('已确认'); }
  else if (act === 'pick') startPick(name);
  else if (act === 'search') { const box = card.querySelector('.search-box'); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('input').focus(); }
  else if (act === 'do-search') {
    const q = card.querySelector('.search-box input').value.trim();
    const out = card.querySelector('.results');
    if (!q) return;
    out.innerHTML = '<div class="faint" style="padding:6px 10px">搜索中…</div>';
    try {
      const res = await nominatim(q, 6);
      out.innerHTML = res.length ? res.map((r, i) =>
        `<button data-act="choose" data-i="${i}">${esc(r.name || r.display_name.split(',')[0])}<br><small>${esc(r.display_name)}</small></button>`).join('')
        : '<div class="faint" style="padding:6px 10px">没有找到，换个说法试试，或者直接在地图上点选</div>';
      out._results = res;
    } catch (e) { out.innerHTML = '<div class="faint" style="padding:6px 10px">搜索服务连接失败，稍后再试</div>'; }
  } else if (act === 'choose') {
    const r = card.querySelector('.results')._results[+btn.dataset.i];
    setPlace(name, { lat: +r.lat, lon: +r.lon, status: 'confirmed', label: r.display_name });
    toast(`已更新「${coreName(name)}」的位置`);
  }
}

/* ================= events ================= */

function bindEvents() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act],[data-id],[data-year],[data-place],[data-tab]');
    if (!t) return;
    if (t.dataset.tab && t.closest('.tabs')) { switchTab(t.dataset.tab); return; }
    const act = t.dataset.act;
    const plCard = t.closest('.pl');
    if (plCard && act) { onPlaceAction(act, plCard, t); return; }
    switch (act) {
      case 'close': deselect(); return;
      case 'prev': step(-1); return;
      case 'next': step(1); return;
      case 'fix': openModal('places'); return;
      case 'retry': geo.failed = false; geocodeMissing(); return;
      case 'clear-year': setYear(state.year); return;
      case 'cancel-pick': endPick(); return;
      case 'import': doImport(); return;
      case 'template': download('足迹模板.csv', TEMPLATE_CSV); return;
      case 'export': exportCsv(); return;
      case 'clear':
        if (confirm('确定清空全部足迹数据吗？建议先导出备份。')) { state.rows = []; state.sel = null; save(); closeModal(); refresh(); homeView(); }
        return;
      case 'add-row': draft.push({ date: '', trip: '', place: '', type: '旅行', note: '' }); renderTab(); return;
      case 'del-row': draft.splice(+t.dataset.i, 1); renderTab(); return;
      case 'save-rows':
        state.rows = draft.filter(r => r.place.trim()).map(r => ({ ...r, place: r.place.trim() }));
        save(); state.sel = null; closeModal(); refresh(); sampleHeights(); geocodeMissing(); toast('已保存');
        return;
    }
    if (t.dataset.year) { setYear(+t.dataset.year); return; }
    if (t.dataset.place && t.closest('#card')) {
      const pos = posOf(t.dataset.place);
      if (pos) flyToPoints([pos], { close: true,placeName:t.dataset.place }); else openModal('places');
      return;
    }
    if (t.dataset.id) select(t.dataset.id);
  });

  document.addEventListener('input', e => {
    const i = e.target.dataset.i, k = e.target.dataset.k;
    if (draft && i != null && k) draft[+i][k] = e.target.value;
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) {
      if (e.key === 'Enter' && e.target.closest('.search-box')) e.target.closest('.search-row').querySelector('[data-act=do-search]').click();
      return;
    }
    if (e.key === 'Escape') {
      if (pickName) endPick();
      else if (body.classList.contains('modal-open')) closeModal();
      else if (state.playing) stopPlay();
      else if (state.sel) deselect();
      else homeView();
    } else if (e.key.toLowerCase() === 'n') toggleTone();
    else if (state.sel && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
  });

  $('#btn-home').addEventListener('click', () => { stopPlay(); deselect(); });
  $('#btn-tone').addEventListener('click', toggleTone);
  $('#btn-list').addEventListener('click', () => body.classList.toggle('list-open'));
  $('#list-close').addEventListener('click', () => body.classList.remove('list-open'));
  $('#btn-data').addEventListener('click', () => openModal(pendingPlaces().length ? 'places' : 'import'));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#empty-import').addEventListener('click', () => openModal('import'));
  $('#btn-play').addEventListener('click', play);
}

/* ================= boot ================= */

function boot() {
  load();
  bindEvents();
  updatePlayUI();
  buildModel();
  if (!window.Cesium) {
    $('#ld-sub').textContent = '地图引擎加载失败，请检查网络后刷新';
    return;
  }
  initGlobe();
  refresh();
  geocodeMissing();
}

boot();
})();
