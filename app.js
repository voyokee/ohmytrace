(() => {
'use strict';

/* ================= constants ================= */

// Fictional sample shown on first visit; real data is imported by each visitor and stays in their browser.
const DEFAULT_CSV = `日期,行程,地点,类型,备注,坐标
2021-07~至今,,上海,现居地,,"31.2304,121.4737"
2015-09~2021-06,,四川成都,曾居地,,"30.5728,104.0668"
2022-10-01~2022-10-06,川西秋色,四川稻城亚丁,旅行,雪山与彩林,"28.4300,100.3500"
2023-05-20~2023-05-27,冰岛自驾,冰岛维克,旅行,黑沙滩,"63.4186,-19.0060"
2024-08-10~2024-08-18,独库公路,新疆那拉提,旅行,空中草原,"43.2500,84.0000"
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
const NIGHT_DARKNESS = 0.64; // 0 = daylight everywhere, 1 = black; unlit land keeps ~30% of its colour
const lightName = i => 'fpL' + String(i).padStart(2, '0'); // fixed width so no name prefixes another

// Night globe: a globe material laid over the imagery dims everything except soft pools of
// daylight around visited places, with a faint warm rim where the light fades out.
function makeNightMaterial() {
  const uniforms = { fpRadius: 60000, fpDark: NIGHT_DARKNESS };
  let lines = '';
  for (let i = 0; i < MAX_LIGHTS; i++) {
    uniforms[lightName(i)] = new Cesium.Cartesian4(0, 0, 0, 0);
    lines += `  lit = max(lit, fpGlow(pos, ${lightName(i)}));\n`;
  }
  const source = `
float fpGlow(vec3 pos, vec4 l) {
  return (1.0 - smoothstep(fpRadius * 0.28, fpRadius, distance(pos, l.xyz))) * l.w;
}
czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material m = czm_getDefaultMaterial(materialInput);
  vec3 pos = (czm_inverseView * vec4(-materialInput.positionToEyeEC, 1.0)).xyz;
  float lit = 0.0;
${lines}
  float rim = lit * (1.0 - lit) * 4.0;
  m.diffuse = mix(vec3(0.015, 0.026, 0.06), vec3(1.0, 0.72, 0.4), rim * 0.4);
  m.alpha = fpDark * (1.0 - lit) + rim * 0.08;
  return m;
}`;
  return new Cesium.Material({ translucent: false, fabric: { type: 'FootprintNight', uniforms, source } });
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
let flying = false, orbit = null, lastInput = 0, pickName = null, playToken = 0;
let markers = [], arcSource = null, arcEntities = [], originEntity = null;
let geo = { busy: false, done: 0, total: 0, failed: false };
// name -> { pos, cur, wake }; cur fades toward the target brightness once performance.now() >= wake
const lights = new Map();
let nightMaterial = null, lightsOn = false, replayLit = null;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (d && Array.isArray(d.rows)) { state.rows = d.rows; state.places = d.places || {}; return; }
  } catch (e) { /* fall through to sample data */ }
  importCsvText(DEFAULT_CSV, 'replace');
}
function save() {
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
  const mobile = isMobile();
  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 18,
    credit: new Cesium.Credit('影像 © Esri, Maxar, Earthstar Geographics · 地名 © OpenStreetMap'),
  });
  const terrain = new Cesium.Terrain(Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(
    'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'));

  viewer = new Cesium.Viewer('globe', {
    baseLayer: new Cesium.ImageryLayer(imagery),
    terrain,
    animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, creditContainer: $('#credits'), msaaSamples: mobile ? 1 : 4,
    useBrowserRecommendedResolution: false,
  });
  scene = viewer.scene;
  const dpr = window.devicePixelRatio || 1;
  viewer.resolutionScale = Math.min(dpr, mobile ? 1.75 : 2) / dpr;

  const layer = viewer.imageryLayers.get(0);
  layer.saturation = 1.12; layer.contrast = 1.08; layer.gamma = 1.04;

  const g = scene.globe;
  g.enableLighting = false;
  g.showGroundAtmosphere = false; // it washes the night tint out to pale grey
  g.depthTestAgainstTerrain = true;
  g.maximumScreenSpaceError = mobile ? 2 : 1.5;
  g.tileCacheSize = 400;
  g.baseColor = Cesium.Color.fromCssColorString('#cfdbe6'); // imagery stops near ±85°, so the poles show this icy tone
  scene.backgroundColor = Cesium.Color.BLACK;
  scene.skyAtmosphere.show = true;
  scene.fog.enabled = true;
  scene.postProcessStages.fxaa.enabled = true;
  const ssc = scene.screenSpaceCameraController;
  ssc.minimumZoomDistance = 150;
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

  nightMaterial = makeNightMaterial();
  g.material = nightMaterial;
  scene.skyAtmosphere.brightnessShift = -0.15;

  // Idle motion: slow spin from space, gentle orbit around a selected place.
  let lastT = performance.now();
  scene.preUpdate.addEventListener(() => {
    const now = performance.now(), dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    updateLights(now, dt);
    if (flying || pickName || now - lastInput < 4000) return;
    const cam = viewer.camera;
    if (orbit) {
      cam.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(orbit));
      cam.rotateRight(0.045 * dt);
      cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } else if (!state.sel && cam.positionCartographic.height > 4e6) {
      cam.rotate(Cesium.Cartesian3.UNIT_Z, -0.035 * dt);
    }
  });
  scene.postRender.addEventListener(updateMarkers);

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
      const now = performance.now();
      [...lights.values()].forEach((L, i) => { L.wake = now + i * 420; });
    }, 2600);
  };
  const check = () => {
    if (scene.globe.tilesLoaded && performance.now() - t0 > 800) { scene.postRender.removeEventListener(check); onLoaded(); }
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
  return p && p.lat != null ? Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.h || 0) + lift) : null;
}

function homeView(duration = 2.4) {
  if (!viewer) return;
  orbit = null;
  const c = centroid();
  flying = true;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - 4, isMobile() ? 2.1e7 : 1.35e7),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    duration,
    complete: () => { flying = false; },
    cancel: () => { flying = false; },
  });
}

function flyToPoints(positions, { duration = 3.2, heading = 12 } = {}) {
  if (!viewer || !positions.length) return Promise.resolve(false);
  orbit = null;
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const r = sphere.radius;
  const range = Math.max(30000, r * 3.4);
  const pitch = Cesium.Math.toRadians(r > 800000 ? -75 : r > 40000 ? -50 : -26);
  flying = true;
  return new Promise(res => {
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(sphere.center, 0), {
      offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), pitch, range),
      duration,
      complete: () => { flying = false; orbit = r < 800000 ? Cesium.Cartesian3.clone(sphere.center) : null; lastInput = 0; res(true); },
      cancel: () => { flying = false; res(false); },
    });
  });
}

function flyToItem(item, opts) {
  const names = item.kind === 'trip' ? item.stops.map(s => s.place) : [item.place];
  const pts = names.map(n => posOf(n)).filter(Boolean);
  if (!pts.length) { toast('这里的地点还没有定位，可以在「地点校正」里设置'); return Promise.resolve(false); }
  return flyToPoints(pts, opts);
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

function updateLights(now, dt) {
  const u = nightMaterial.uniforms;
  // Lit pools keep a sensible size on screen: tens of km up close, a few hundred km from space.
  u.fpRadius = Math.max(55000, viewer.camera.positionCartographic.height * 0.036);
  let n = 0;
  for (const [name, L] of lights) {
    if (n >= MAX_LIGHTS) break;
    const target = now >= L.wake ? lightTarget(name) : 0;
    L.cur += (target - L.cur) * Math.min(1, dt * 1.8);
    const v = u[lightName(n++)];
    v.x = L.pos.x; v.y = L.pos.y; v.z = L.pos.z; v.w = L.cur;
  }
  for (; n < MAX_LIGHTS; n++) u[lightName(n)].w = 0;
}

/* ---------- HTML markers ---------- */

let lastNear = null;

function renderMarkers() {
  const box = $('#markers');
  box.innerHTML = '';
  markers = [];
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
    flyToPoints([posOf(name)]);
    return;
  }
  const candidates = info.trips.filter(inYear);
  const target = candidates[candidates.length - 1] || info.home || info.trips[info.trips.length - 1];
  if (target) select(target.id);
}

function updateMarkerClasses() {
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
}

function updateMarkers() {
  if (!markers.length) return;
  const cam = viewer.camera;
  const camPos = cam.positionWC;
  const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, camPos);
  const near = cam.positionCartographic.height < 1.8e6;
  if (near !== lastNear) { body.classList.toggle('near', near); lastNear = near; }
  const toWin = Cesium.SceneTransforms.worldToWindowCoordinates || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
  const dir = cam.directionWC, tmp = new Cesium.Cartesian3();
  for (const m of markers) {
    let vis = !m.filtered && occluder.isPointVisible(m.pos) &&
      Cesium.Cartesian3.dot(dir, Cesium.Cartesian3.subtract(m.pos, camPos, tmp)) > 0;
    if (vis) {
      const w = toWin(scene, m.pos);
      if (w) m.el.style.transform = `translate3d(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px, 0)`;
      else vis = false;
    }
    if (vis !== m.vis) { m.el.style.display = vis ? '' : 'none'; m.vis = vis; }
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
  $('#stats').innerHTML = parts.join('<i>·</i>');
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
    ${st.pending ? `<span class="badge ${st.cls}">${st.text}</span>` : ''}</button></li>`;
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
      if (pos) flyToPoints([pos]); else openModal('places');
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
    } else if (state.sel && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
  });

  $('#btn-home').addEventListener('click', () => { stopPlay(); deselect(); });
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
  if (window.innerWidth > 1100) body.classList.add('list-open');
  buildModel();
  if (!window.Cesium) {
    $('#ld-sub').textContent = '地图引擎加载失败，请检查网络后刷新';
    return;
  }
  initGlobe();
  window.__footprints = { viewer, state, get terrainReady() { return terrainReady; }, get orbit() { return orbit; }, get flying() { return flying; } };
  refresh();
  geocodeMissing();
}

boot();
})();
