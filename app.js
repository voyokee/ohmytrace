(async () => {
'use strict';
const publicViewer=document.body.hasAttribute('data-story-viewer');
const {createLifeBridge}=publicViewer?{}:await import('./src/life/app-bridge.js');
const {mountChapterUI}=publicViewer?{}:await import('./src/life/chapter-ui.js');
const {FirstUseService}=publicViewer?{}:await import('./src/life/first-use.js');
const {mountEarthFirstUse}=publicViewer?{}:await import('./src/ui/earth-first-use.js');
const {createScanPreview}=publicViewer?{}:await import('./src/life/media/scan-preview.js');
const {mountRecordCard,recordCardModel}=publicViewer?{}:await import('./src/life/record-card.js');
const {mountStoryExperience}=await import('./src/life/story/app-integration.js');
const {visualContext}=await import('./src/life/story/schema.js');
const {timelineLayout}=await import('./src/life/timeline-layout.js?v=20261026-mobile-clear');
const {PhotoHistoryService}=publicViewer?{}:await import('./src/life/media/integration.js');
const {geoNameProvider}=publicViewer?{}:await import('./src/life/geocoding/provider.js');
const {LocalSettings}=publicViewer?{}:await import('./src/life/local-settings.js');
const {BackupGuide}=publicViewer?{}:await import('./src/life/backup-guide.js');
const {mountEarthHome}=publicViewer?{}:await import('./src/ui/earth-home.js');
const {earthTripTitle,earthScopedSnapshot}=publicViewer?{}:await import('./src/ui/earth-home-model.js');
const {mountMyPanel}=publicViewer?{}:await import('./src/ui/my-panel.js');
const {saveDocument}=await import('./src/platform/document-save.js');
const {photoRegion}=publicViewer?{}:await import('./src/life/geocoding/region-policy.js');
const {mountPhotoUI}=publicViewer?{}:await import('./src/life/media/photo-ui.js');
const { createRenderPolicy,footprintIntroDelay } = await import('./src/performance/render-policy.js?v=20261026-mobile-clear');
const {createCameraMotionTracker}=await import('./src/performance/camera-motion.js?v=20261025-ridges');
const {visualBenchmark,benchmarkDetails}=await import('./src/performance/visual-benchmark.js?v=20261025-handoff');
const benchmark=visualBenchmark(location.search);
const { constrainedDevice, runtimeDeviceConfig } = await import('./src/rendering/texture-policy.js?v=20261026-mobile-clear');
const { prepareVegetation } = await import('./src/scenery/prepare-vegetation.js?v=20261024');
const { filterSteepPlants,ROOT_LIFT } = await import('./src/scenery/terrain-placement.js?v=20261026-continuity');
const { setupCinematic } = await import('./src/rendering/hero-earth.js?v=20261026-mobile-clear');
const { SceneryManager } = await import('./src/scenery/scenery-manager.js?v=20261026-continuity');
const {syncCameraSun}=await import('./src/rendering/sunlight.js');
const { CameraDirector } = await import('./src/rendering/camera-director.js');
const {inYear:matchesYear,yearOptions,scopedDays,timelineBuckets}=await import('./src/ui/year-scope.js?v=20261026-places');
const {createFootprintOverlay}=await import('./src/ui/footprint-overlay.js?v=20261026-touch');
const {createMapChooser,cityHistory}=await import('./src/ui/map-chooser.js?v=20261027-city');
const {GEOCODER_VERSION,needsGeocoding:legacyNeedsGeocoding,provinceSearchOptions,fitsProvince,provinceFallback,placeQueries}=await import('./src/geocoding/region-scope.js?v=20261026-places');
const { sceneTemplateFor } = await import('./src/scenery/scene-templates.js');
const { SCENE_DEMOS,demoCsv } = await import('./src/scenery/scene-demos.js');
const demoParams=new URLSearchParams(location.search),demoKey=demoParams.get('demo');
const demoBase=!publicViewer&&Object.hasOwn(SCENE_DEMOS,demoKey)?SCENE_DEMOS[demoKey]:undefined;
const demoMonth=Number(demoParams.get('month'));
const sceneDemo=demoBase?{...demoBase,...(Number.isInteger(demoMonth)&&demoMonth>=1&&demoMonth<=12?{month:demoMonth}:{})}:undefined;
const { installTerrainPicking } = await import('./src/rendering/terrain-picking.js');
const { createTerrainDaylight, syncTerrainDaylight } = await import('./src/rendering/terrain-daylight.js');
const metricTools=new URLSearchParams(location.search).has('perf')?await import('./src/performance/metrics.js?v=20261025-ridges'):null;

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

const needsGeocoding=p=>p?.status==='unknown'||legacyNeedsGeocoding(p);
const PALETTE = ['#ffb547', '#5cc8ff', '#ff7ab0', '#8fe388', '#b69cff', '#ffd76a', '#6ee7d8'];
const HOME_COLOR = '#ffe9c4';
// Longer names first so prefix matching is unambiguous.
const PROVINCES = ['内蒙古', '黑龙江', '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林', '江苏', '浙江', '安徽', '福建',
  '江西', '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾', '广西', '西藏',
  '宁夏', '新疆', '香港', '澳门'];
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

const state = { rows: [], places: {}, sel: null, city: null, year: null, playing: false };
let trips = [], homes = [], typeColors = {};
let viewer, scene, terrainReady = false;
let flying = false, flightGeneration = 0, orbit = null, lastInput = 0, pickName = null, playToken = 0;
let footprintOverlay, mapChooser, markerInfo=new Map(), timelineGroups=new Map();
let timelineLayoutKey, timelineFrame, timelineViewportWidth=0, timelineAtLatest=true;
let arcSource = null, arcEntities = [], originEntity = null, arcSignature="", arcGrown="", arcGrowUntil = 0;
let geo = { busy: false, done: 0, total: 0, failed: false };
// name -> { pos, cur, wake }; cur fades toward the target brightness once performance.now() >= wake
const lights = new Map();
let nightMaterial = null, terrainDaylight = null, materialIsolated = false, lightsOn = false, replayLit = null;
let renderPolicy, cinematic, sceneryManager, cameraDirector, terrainPicking, globalSpinUntil = 0, lightsAnimating = true;
let cinematicDay = true, dayMix = 1;
const frameTimings = { engineMs: 0, effectsMs: 0, drawMs: 0 };
let drawCommands = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let life, lifeSnapshot, lifeUI, photoUI, recordCard,firstUse,firstUseUI,myPanel,backupGuide,earthHome;
let storyExperience,storyScene=null,storyBaseLife=null,storyBaseSelection=null,storyExploreCard=false;
let storyFallbackLayer=null;
function storageError(error) {
  const el=$('#life-storage-error');el.hidden=false;
  el.textContent='OnceHere：'+error.message+'。修改未确认保存；请保留原始文件或备份，刷新后重试。';
  toast('保存失败：'+error.message,6000);
}
async function mutateLife(action) {
  if(!life){storageError(new Error('数据存储尚不可用'));return false;}
  try { await action(); $('#life-storage-error').hidden=true;refresh();return true; }
  catch(error){storageError(error);return false;}
}
async function load() {
  if(publicViewer){body.classList.add('story-readonly');return;}
  try {
    life=await createLifeBridge({defaultCSV:DEFAULT_CSV,sceneCSV:sceneDemo?demoCsv(sceneDemo):null});
    if(demoParams.get('preview')==='earth-home'&&life.canPreviewDemo())life.previewDemo();
    // During the first reveal the dot on 我的 carries the reminder; a toast would cover the reveal.
    backupGuide=new BackupGuide({settings:new LocalSettings(),onReminder:message=>{if(!revealPending&&!emptyImport&&!firstUseUI?.isOpen)toast(message,6000);}});
    lifeUI=mountChapterUI({repository:life.repository,adapter:life.adapter,onScope:setChapter,onError:storageError,
      status:()=>life.status(),onBackup:()=>download('OnceHere-records.json',life.repository.backup(),'application/json'),
      onRestore:async file=>{const text=await file.text();if(!confirm('用此记录备份替换当前人生记录？建议先下载当前备份。'))return;
        stopPlay();await life.restore(text);await backupGuide.importCommitted(life.repository.getDataset());life.adapter.setScope({type:'all'});state.year=null;state.sel=null;refresh();sampleHeights();geocodeMissing();toast('人生记录已恢复');}});
    life.repository.subscribe(()=>{if(viewer)refresh();});
    firstUse=new FirstUseService(life.repository,life.edits);
    firstUseUI=mountEarthFirstUse({service:firstUse,onRetry:()=>void photoUI?.open(),onDemo:()=>document.querySelector('#empty-demo')?.click(),earthHome:{host:f=>earthHome.host(f),release:()=>earthHome.release(),render:()=>earthHome.render(),get hosting(){return earthHome.hosting;}},reducedMotion,onOpenChapter:id=>{openRecord({kind:'chapter',id});recordCard.edit();},onShareYear:year=>storyExperience?.composer.open({source:{type:'year',year}}),onIntro:done=>{if(storyExperience)return storyExperience.intro(done);done();}});
    const photos=new PhotoHistoryService(life.repository,{readOnly:!!sceneDemo});
    // The dialog covers the globe while a scan runs; pausing its render loop keeps
    // worker replies and storage commits from queueing behind globe frames.
    let photoPausedLoop=false;
    const onScanning=active=>{body.classList.toggle('photo-scanning',active);if(!viewer)return;
      if(active){scanPreview.reset();if(viewer.useDefaultRenderLoop){photoPausedLoop=true;viewer.useDefaultRenderLoop=false;}}
      else{scanPreview.clear();if(photoPausedLoop){photoPausedLoop=false;viewer.useDefaultRenderLoop=true;scene?.requestRender();}}};
    // Set by the first automatic import; the reveal waits until the import dialog is dismissed.
    // A first import that found no located photo gets an explanation instead of an empty reveal.
    let revealPending=false,emptyImport=null;
    photoUI=mountPhotoUI({service:photos,download,onScanning,onPreview:points=>scanPreview.add(points),onError:error=>toast('照片处理失败：'+error.message,6000),
      onBackupSaved:(data,bytes)=>{backupGuide.markBackup(data,bytes);myPanel?.render();},
      onImportFinished:()=>{const auto=revealPending,empty=emptyImport;revealPending=false;emptyImport=null;if(empty){firstUseUI.explainEmpty(empty);return;}if(!firstUseUI.present({auto}))toast('照片已整理，可在地球上查看旅行');},
      onCommitted:async result=>{let next=null;if(result.automatic){const started=!!firstUse.view(),summary=result.summary||{},located=(summary.photos||0)-(summary.unlocated||0);
        if(!started&&!summary.regrouped&&located<=0){emptyImport={scanned:summary.scanned||0};next='reveal';}
        else{await firstUse.prepare({scanned:summary.scanned});revealPending=!started&&!!firstUse.view();if(revealPending)next='reveal';}}await backupGuide.importCommitted(life.repository.getDataset());recordCard?.close();stopPlay();mapChooser?.close();state.city=null;state.sel=null;state.year=null;life.adapter.setScope({type:'all'});refresh();sampleHeights();myPanel?.render();earthHome?.reset();if(!next)toast('已补充照片与旅行记录');return next;}});
    myPanel=mountMyPanel({repository:life.repository,guide:backupGuide,backup:()=>photoUI.backup(),restore:()=>photoUI.open({storage:true}),onData:tab=>openModal(tab),onError:error=>toast(error.message,6000)});
    recordCard=mountRecordCard({element:$('#card'),repository:life.repository,edits:life.edits,getYear:()=>state.year,getScope:()=>life.adapter.scope,compact:true,titleFor:earthTripTitle,onMode:mode=>earthHome?.modeChanged(mode),
      onClose:()=>earthHome?earthHome.back():deselect({home:false}),onSelect:target=>openRecord(target),onChange:target=>{earthHome?.changed(target);syncRecordSelection(target);},
      onReplay:scope=>{if(!storyExperience)throw new Error('回放正在准备，请稍后重试');return earthHome?earthHome.replay(scope):storyExperience.replay(scope);},
      onShare:scope=>{if(!storyExperience)throw new Error('分享正在准备，请稍后重试');return storyExperience.composer.open({source:scope});},
      onExplore:id=>{const name=Object.keys(lifeSnapshot.placeIds).find(name=>lifeSnapshot.placeIds[name]===id);if(name)focusCardPlace(name);},
      thumbnail:(memory,options)=>photoUI.thumbnail(memory,options)});
    earthHome=mountEarthHome({repository:life.repository,recordCard,getTrips:visibleTrips,getScope:()=>life.adapter.scope,getYear:()=>state.year,onYear:y=>{recordCard.close();pauseOverviewMotion();state.year=y;state.sel=null;state.city=null;life.adapter.setScope({type:'all'});lifeUI.renderStrip();refresh();homeView(1.2);},onChapter:id=>{state.year=null;recordCard.close();state.sel=null;state.city=null;life.adapter.setScope({type:'chapter',id});refresh();homeView(1.2);},onSelect:openRecord,onClear:()=>{state.sel=null;state.city=null;updateSelectionUI();},onReplay:scope=>{if(!storyExperience)throw new Error('回放正在准备，请稍后重试');return storyExperience.replay(scope);},captureCamera,restoreCamera,onPause:pauseOverviewMotion,thumbnail:(m,o)=>photoUI.thumbnail(m,o)});
  } catch(error){storageError(error);$('#btn-life').disabled=true;}
}
async function importCsvText(text,mode) {
  if(!life)throw new Error('存储不可用，未导入；请刷新重试');
  return life.importCSV(text,mode);
}
function download(name,text,type='text/csv;charset=utf-8') {
  const blob=text instanceof Blob?text:new Blob([type.startsWith('text/csv')?'\uFEFF'+text:text],{type});
  return saveDocument(name,blob).catch(error=>{toast('保存失败：'+error.message,6000);return {saved:false};});
}
function exportCsv() { if(life)download('OnceHere.csv',life.exportCSV()); }
function exitDemo() { if(!life?.exitDemo?.())return; stopPlay(); state.sel=null; state.year=null; refresh(); homeView(); }

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
  if(!life)return;
  const previous=state.places;
  lifeSnapshot=life.adapter.getRenderSnapshot();if(earthHome&&!storyBaseLife)lifeSnapshot=earthScopedSnapshot(lifeSnapshot,life.repository.getDataset(),state.year);state.rows=lifeSnapshot.rows;state.places=lifeSnapshot.places;
  for(const [key,p]of Object.entries(state.places)){
    const old=previous[key];if(old?.lat===p.lat&&old?.lon===p.lon&&old?.h!=null)p.h=old.h;
  }
  trips=lifeSnapshot.trips;homes=lifeSnapshot.homes;typeColors={};let i=0;
  for(const t of trips)if(!(t.type in typeColors))typeColors[t.type]=PALETTE[i++%PALETTE.length];
}

const byId = id => trips.find(t => t.id === id) || homes.find(h => h.id === id) || null;
const inYear = t => matchesYear(t,state.year);
const visibleHomes = () => homes.filter(inYear);
const travelTrips = () => trips.filter(t=>t.countsAsTravel!==false);
const visibleTrips = () => travelTrips().filter(inYear);
const located = name => { const p = state.places[name]; return p && p.lat != null; };

/* ================= geocoding ================= */

async function searchPlaces(q, limit = 6, scope = {}) {
  return geoNameProvider.search(q,{limit,...scope});
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
    if (!fitsProvince(r,prov)) continue;
    if (coverage(core, disp) < 0.6) continue; // reject fuzzy matches that share almost no characters
    let bonus = CAT_BONUS[r.category] ?? 0;
    if (r.category === 'boundary' && /national_park|protected_area/.test(r.type)) bonus = .5;
    const score = (+r.importance || 0) + bonus + coverage(core, r.name || '') * 0.6;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

async function autoLocate(name) {
  name=state.places[name]?.sourceName||name;
  const prov = detectProvince(name), core = coreName(name, prov);
  const queries = placeQueries(name,core,PROVINCES),scope=provinceSearchOptions(prov);
  const result=(r,status)=>({lat:+r.lat,lon:+r.lon,status,label:r.display_name,countryCode:r.address?.country_code,source:r.source,state:r.state,geocoderVersion:GEOCODER_VERSION});
  try {
    for (const q of queries) {
      const best = pickBest(await searchPlaces(q,6,scope), core, name.includes('交界')?null:prov);
      if (best) return result(best,'auto');
    }
    if (prov&&(!core||core===prov)) {
      const best=provinceFallback(await searchPlaces(prov,6,provinceSearchOptions(prov,true)),prov);
      if(best)return result(best,'rough');
    }
    return { status: 'notfound',geocoderVersion:GEOCODER_VERSION };
  } catch (e) {
    return null; // network problem: leave unset so a retry picks it up
  }
}

async function geocodeMissing() {
  if(publicViewer||storyBaseLife)return;
  if (geo.busy) return;
  const todo = placeNames().filter(n => needsGeocoding(state.places[n]));
  if (!todo.length) return;
  geo = { busy: true, done: 0, total: todo.length, failed: false };
  renderChips();
  for (const n of todo) {
    if (!needsGeocoding(state.places[n])) { geo.done++; continue; }
    const r = await autoLocate(n);
    if (r) { if(!await setPlace(n,r,false)){geo.failed=true;break;} } else geo.failed = true;
    geo.done++;
    renderChips();
  }
  geo.busy = false;
  renderChips();
  if (!state.sel && !flying && viewer && viewer.camera.positionCartographic.height > 4e6) homeView(2.2);
}

async function setPlace(name,data,manual=true) {
  if(publicViewer||storyBaseLife)return false;
  const id=lifeSnapshot?.placeIds[name];if(!id)return false;
  const ok=await mutateLife(()=>life.setPlace(id,data,manual));
  if(ok)sampleHeights();return ok;
}

/* ================= globe ================= */

async function initGlobe() {
  // Cesium 1.120 starts a Blob request before awaiting this shared probe. Finish
  // it first so immediate offline rejection already has a consumer attached.
  await Cesium.Resource.supportsImageBitmapOptions().catch(()=>false);
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
  let terrainFallback=false,terrainDeadline;
  const fallbackTerrain=()=>{terrainFallback=true;return new Cesium.EllipsoidTerrainProvider();};
  const terrain = new Cesium.Terrain(Promise.race([
    Cesium.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer').catch(fallbackTerrain),
    new Promise(resolve=>{terrainDeadline=setTimeout(()=>resolve(fallbackTerrain()),8000);})
  ]).finally(()=>clearTimeout(terrainDeadline)));

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
    removeFrameMetrics?.();footprintOverlay?.dispose();mapChooser?.dispose();terrainPicking.dispose();clearScenery();sceneryManager.dispose();cinematic.dispose();
    // pagehide precedes visibilitychange. Keep the Viewer alive until the
    // existing visibility policy has stopped its loop, then release Cesium.
    setTimeout(()=>{if(!viewer.isDestroyed())viewer.destroy();},0);
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

  terrain.readyEvent.addEventListener(() => { terrainReady = !terrainFallback;viewer.canvas.dataset.storyTerrain=terrainFallback?'fallback':'available';sampleHeights(); });
  terrain.errorEvent.addEventListener(() => toast('地形服务暂时连不上，先以平面地球显示'));

  arcSource = new Cesium.CustomDataSource('arcs');
  viewer.dataSources.add(arcSource);

  // Web Mercator terrain stops at ±85.05°, leaving holes at the poles; cap them with ice.
  for (const [s, n] of [[85.0, 90], [-90, -85.0]]) {
    viewer.entities.add({ rectangle: { coordinates: Cesium.Rectangle.fromDegrees(-180, s, 180, n), height: 0,
      material: Cesium.Color.fromCssColorString('#3b424d') } }); // ice as it looks under the night tint
  }

  const markInput = () => {
    storyExperience?.pauseForInteraction();
    if(mapChooser?.kind==='places')mapChooser.close();
    lastInput = performance.now();
    orbit = null;
    cinematic.setFocus(null);
    if (state.playing && !pickName) stopPlay();
  };
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) viewer.canvas.addEventListener(ev, markInput, { passive: true });

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction(async e => {
    if (!pickName) return;
    const ray = viewer.camera.getPickRay(e.position);
    const p = (ray && scene.globe.pick(ray, scene)) || viewer.camera.pickEllipsoid(e.position);
    if (!p) return;
    const c = Cesium.Cartographic.fromCartesian(p);
    const name = pickName;
    endPick();
    if(await setPlace(name, { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), status: 'confirmed', label: '在地图上手动选点' }))toast(`已把「${coreName(name)}」放到这里`);
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
  const cameraMotion=createCameraMotionTracker();
  let cameraMoving = false,nativeCameraMoving=false;
  viewer.camera.moveStart.addEventListener(() => { nativeCameraMoving = true; });
  viewer.camera.moveEnd.addEventListener(() => { nativeCameraMoving = false; });
  scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    frameStart = now;
    cameraMoving=cameraMotion.update(viewer.camera,now);
    cinematic.update({ altitude: viewer.camera.positionCartographic.height, day: dayMix,
      lightUniforms: nightMaterial.uniforms, reducedMotion, now,terrainReady,localReady:['ready','empty'].includes(sceneryManager.details().sceneryPhase) });
    cameraDirector.update({ altitude: viewer.camera.positionCartographic.height, flying, scenery: scenery.name });
    renderPolicy.near(viewer.camera.positionCartographic.height < 20000);
    // Resolution follows the camera only. A switch resizes every framebuffer and visibly softens then
    // re-sharpens the globe, so a tap, a UI click or lights fading over a still view keep the current mode.
    const cameraBusy = cameraMoving || flying || !!orbit || !!(scenery.name&&!reducedMotion) || state.playing || now < globalSpinUntil;
    if (cameraBusy) renderPolicy.still(false);
    else if (!pickName && !lightsAnimating && now >= arcGrowUntil && now-lastInput>800) renderPolicy.still(true);
    if (!renderPolicy.tick(now)) return;
    if(benchmark.enabled)scene.requestRender();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const animatedScenery = scenery.name && !reducedMotion && !body.classList.contains('modal-open');
    // Panels drop their backdrop blur while the globe moves. Fading lights are not motion: toggling the
    // class on every click restyled the whole page and made the sheet flicker between glass and solid.
    const moving = flying || !!orbit || !!animatedScenery || cameraMoving;
    if(body.classList.contains('scene-active') !== moving) body.classList.toggle('scene-active',moving);
    if (lightsAnimating || animatedScenery || flying || now < arcGrowUntil) scene.requestRender();
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
        ...frameTimings,...(footprintOverlay?.details()||{}),viewYear:state.year,visibleTrips:visibleTrips().length, drawCommands, terrainVisible:scene.globe.show,logDepth:scene.logarithmicDepthBuffer,
        orbiting:!!orbit,cameraMoving,nativeCameraMoving,...cameraMotion.details(),lightsAnimating,selected:!!state.sel,
        collision:scene.screenSpaceCameraController.enableCollisionDetection,
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
    // Skip the opening overview if a record is already open or a flight has started.
    setTimeout(() => {if(!storyScene&&!state.sel&&!state.city&&!flying)homeView(reducedMotion?0:3.4);}, 250);
    // Light the footprints one by one as the globe settles.
    setTimeout(() => {
      lightsOn = true;
      lightsAnimating = true;
      scene.requestRender();
      const now = performance.now();
      [...lights.values()].forEach((L, i) => { L.wake = now + footprintIntroDelay(i,lights.size); });
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
  const scopeNames=life?.adapter.scope.type==='chapter'?[...new Set([...homes.map(h=>h.place),...trips.flatMap(t=>t.stops.map(s=>s.place))])]:placeNames();
  const pts = scopeNames.filter(located).map(n => state.places[n]);
  if (!pts.length) return { lat: 33, lon: 105 };
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
}

function posOf(name, lift = 0) {
  const p = state.places[name];
  return p && p.lat != null ? Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.h || 0) * EXAGGERATION + lift) : null;
}

function captureCamera(){if(!viewer)return null;const c=viewer.camera;return {position:Cesium.Cartesian3.clone(c.positionWC),direction:Cesium.Cartesian3.clone(c.directionWC),up:Cesium.Cartesian3.clone(c.upWC)};}
function restoreCamera(saved){if(!viewer||!saved)return;pauseOverviewMotion();viewer.camera.cancelFlight();viewer.camera.setView({destination:saved.position,orientation:{direction:saved.direction,up:saved.up}});scene.requestRender();}

function homeView(duration = 2.4) {
  if(reducedMotion)duration=0;
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
    orientation: { heading: 0, pitch: benchmark.pitch, roll: 0 },
    duration,
    complete: () => { if (flight === flightGeneration) { flying = false; cameraDirector.finish(flight,'global'); globalSpinUntil = benchmark.enabled?0:performance.now() + 8000; } },
    cancel: () => { if (flight === flightGeneration) flying = false; },
  });
}

// The earth-home sheet covers the bottom of a phone or the left of a desktop. Aim so the target sits
// in the middle of the uncovered globe instead of behind the sheet. Null keeps the plain centred flight.
let framingCamera;
function framedAboveSheet(center,offset) {
  const sheet=earthHome&&!storyBaseLife&&!body.classList.contains('story-active')&&$('#earth-sheet');
  if(!sheet||sheet.hidden)return null;
  // Measure where the sheet is going, not where its height transition currently is.
  const transition=sheet.style.transition;sheet.style.transition='none';const r=sheet.getBoundingClientRect();sheet.style.transition=transition;
  const w=viewer.canvas.clientWidth,h=viewer.canvas.clientHeight;
  if(!r.height||r.height>h*.7)return null;
  let dx=0,dy=0;
  if(r.width>w*.6)dy=h/2-(($('#brand')?.getBoundingClientRect().bottom||0)+r.top)/2;
  else if(r.left<w/2)dx=(r.right+w)/2-w/2;
  if(Math.hypot(dx,dy)<24)return null;
  framingCamera??=new Cesium.Camera(scene);
  const cam=framingCamera,focal=h/(2*Math.tan(viewer.camera.frustum.fovy/2));
  cam.frustum=viewer.camera.frustum.clone();
  cam.lookAt(center,offset);cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
  if(dy)cam.lookDown(Math.atan(dy/focal));
  if(dx)cam.lookLeft(Math.atan(dx/focal));
  return {position:Cesium.Cartesian3.clone(cam.position),direction:Cesium.Cartesian3.clone(cam.direction),up:Cesium.Cartesian3.clone(cam.up)};
}

// close: drop low over a single place so its trees, flowers and clouds are in view
// overview: a regional view of the place (the first-use tour), never a ground-level dive into unloaded imagery
function flyToPoints(positions, { duration = 3.2, heading = 12, close = false, overview = false, placeName } = {}) {
  if(reducedMotion)duration=0;
  if (!viewer || !positions.length) return Promise.resolve(false);
  if (scenery.name) clearScenery();
  orbit = null;
  sceneryManager.preload().catch(() => {});
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  cinematic.setFocus(storyScene&&visualContext(storyScene).month===null?null:sphere.center,placeName?seasonFor(placeName,state.places[placeName].lat).month:8);
  const r = sphere.radius;
  const framing=close&&placeName?sceneTemplateFor({name:placeName,...state.places[placeName],height:state.places[placeName]?.h||0}).camera:null;
  const storyMinimum=publicViewer||storyBaseLife?!terrainReady?1200000:state.places[placeName]?.granularity!=='precise'?90000:0:0;
  const range = Math.max(storyMinimum,overview?600000:close ? framing?.range||1900 : Math.max(earthHome&&!storyBaseLife?6000000:30000, r * 3.4));
  const pitch = Cesium.Math.toRadians(overview?-55:earthHome&&!storyBaseLife&&!close?-75:close ? framing?.pitch||-19 : r > 800000 ? -75 : r > 40000 ? -50 : -26);
  const flight = flightGeneration = cameraDirector.begin('entering');
  flying = true;
  // Fetch/survey the destination during the flight; distance bands keep local models/effects
  // hidden from orbit. Unknown ground heights retain the normal arrival-time fallback.
  if(close&&placeName&&terrainReady&&Number.isFinite(state.places[placeName]?.h))setScenery(placeName);
  const offset=new Cesium.HeadingPitchRange(Cesium.Math.toRadians(heading), pitch, range);
  const framed=!close&&framedAboveSheet(sphere.center,offset);
  return new Promise(res => {
    const fly=framed?(o=>viewer.camera.flyTo({destination:framed.position,orientation:{direction:framed.direction,up:framed.up},...o}))
      :(o=>viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(sphere.center, 0),{offset,...o}));
    fly({
      duration,
      complete: () => {
        if (flight !== flightGeneration) { res(false); return; }
        flying = false; cameraDirector.finish(flight,'place'); orbit = !earthHome&&r < 800000 ? Cesium.Cartesian3.clone(sphere.center) : null; lastInput = 0; res(true);
      },
      cancel: () => { if (flight === flightGeneration) flying = false; res(false); },
    });
  });
}

function flyToItem(item, opts) {
  const names = item.kind === 'trip' ? item.stops.map(s => s.place) : [item.place];
  const pts = names.map(n => posOf(n)).filter(Boolean);
  if (!pts.length) { toast(publicViewer||storyBaseLife?'作品未公开此处坐标，可继续观看文字与其他地点':'这里的地点还没有定位，可以在「地点校正」里设置'); return Promise.resolve(false); }
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
  // Sampled terrain heights belong to the disposable render cache.
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

// Evaluated per light on every animating frame; rebuild only when the model or the year changes.
let scopedLit = { trips: null, homes: null, snapshot: null, year: undefined, names: new Set() };
function scopedLitPlaces() {
  const c = scopedLit;
  if (c.trips === trips && c.homes === homes && c.snapshot === lifeSnapshot && c.year === state.year) return c.names;
  const names = new Set(visibleHomes().map(h => h.place));
  for (const t of trips) if (inYear(t)) for (const s of t.stops) names.add(s.place);
  for (const p of lifeSnapshot?.photoPlaces || []) if (state.year == null || p.years.includes(state.year)) names.add(p.place);
  scopedLit = { trips, homes, snapshot: lifeSnapshot, year: state.year, names };
  return names;
}

function lightTarget(name) {
  if (!lightsOn) return 0;
  if (replayLit) return replayLit.has(name) ? 1 : 0;
  if (state.year || life?.adapter.scope.type==='chapter') return scopedLitPlaces().has(name) ? 1 : 0;
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
  if(storyScene){const {month}=visualContext(storyScene);if(month===null)return {name:'neutral',month:7,day:0};const m=lat<0?(month+5)%12+1:month;return {month:m,day:Math.round((new Date(2001,m-1,15)-new Date(2001,0,1))/DAY)+1,name:m>=3&&m<=4?'spring':m>=5&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter'};}
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
  if(storyScene&&visualContext(storyScene).month===null)return;
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
    const f = storyScene&&visualContext(storyScene).month===null?null:focusPlace();
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
    placements.push({ lon: plants[i].lon, lat: plants[i].lat, ground: ground + ROOT_LIFT,
      species: kind, height, width: small ? 1.2 : .75 + rnd() * .4, angle: rnd() * Math.PI * 2 });
  }
  if (token !== scenery.token || signal.aborted) return;
  const suitable=await filterSteepPlants(placements,{signal});
  if(token!==scenery.token||signal.aborted)return;
  scenery.plants = suitable;
  await sceneryManager.populate(name, suitable);
}


/* ---------- scan preview: places light up while photos are still being read ---------- */

// The import holds the render loop for worker throughput, so frames are drawn here on demand,
// at most four a second. Points are a preview only; the real markers replace them on commit.
const scanPreview=(()=>{
  let cells=null,points=null,timer=0,last=0;
  const occluder=new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84,Cesium.Cartesian3.ZERO);
  const color=Cesium.Color.fromCssColorString('#ffb547'),outline=Cesium.Color.fromCssColorString('#1c1306');
  const draw=()=>{
    timer=0;last=performance.now();if(!viewer||viewer.isDestroyed()||!points)return;
    occluder.cameraPosition=viewer.camera.positionWC;
    for(let i=0;i<points.length;i++){const p=points.get(i);p.show=occluder.isPointVisible(p.position);}
    scene.requestRender();if(!viewer.useDefaultRenderLoop)viewer.render();
  };
  return {
    reset(){this.clear();cells=createScanPreview();},
    /** Returns how many distinct places the current scan has found so far. */
    add(list){
      if(!viewer||!cells)return cells?.size||0;
      let added=false;
      for(const o of list){
        if(!cells.add(o.latitude,o.longitude))continue;
        points??=scene.primitives.add(new Cesium.PointPrimitiveCollection());
        points.add({position:Cesium.Cartesian3.fromDegrees(o.longitude,o.latitude,0),pixelSize:7,color,outlineColor:outline,outlineWidth:1.5,disableDepthTestDistance:Number.POSITIVE_INFINITY});added=true;
      }
      if(added){viewer.canvas.dataset.scanPoints=String(cells.size);if(!timer)timer=setTimeout(draw,Math.max(0,250-(performance.now()-last)));}
      return cells.size;
    },
    clear(){clearTimeout(timer);timer=0;if(points){scene.primitives.remove(points);points=null;}cells=null;},
  };
})();

/* ---------- footprint overlay ---------- */

function markerObstacles() {
  return [$('#brand'),$('#stats'),$('#chips'),$('#toolbar'),$('#timeline'),body.classList.contains('story-active')?$('#story-player'):null,body.classList.contains('list-open')?$('#list'):null,
    earthHome?$('#earth-sheet'):body.classList.contains('card-open')?$('#card'):null];
}
function renderMarkers() {
  if(!viewer)return;
  if(!mapChooser)mapChooser=createMapChooser({bottom:()=>(body.classList.contains('story-active')?$('#story-player'):$('#timeline')).getBoundingClientRect().top-8});
  if(!footprintOverlay)footprintOverlay=createFootprintOverlay(viewer,{container:$('#markers'),
    groundHeight:(lon,lat)=>cinematic.groundHeight(lon,lat),obstacles:markerObstacles,
    onSelect:name=>onMarkerClick(name,markerInfo.get(name)),onCluster:showPlaceCluster,
    onInteract:()=>{storyExperience?.pauseForInteraction();pauseOverviewMotion();}});
  syncLights();markerInfo=new Map();
  for(const t of trips)for(const stop of t.stops) {
    if(!markerInfo.has(stop.place))markerInfo.set(stop.place,{trips:[],homes:[]});
    const placeTrips=markerInfo.get(stop.place).trips;
    if(!placeTrips.some(trip=>trip.id===t.id))placeTrips.push(t);
  }
  for(const h of homes) {
    if(!markerInfo.has(h.place))markerInfo.set(h.place,{trips:[],homes:[]});
    markerInfo.get(h.place).homes.push(h);
  }
  for(const p of lifeSnapshot?.photoPlaces||[]){
    if(!markerInfo.has(p.place))markerInfo.set(p.place,{trips:[],homes:[]});
    const info=markerInfo.get(p.place);(info.photos||=[]).push(p);
  }
  updateMarkerClasses();
}
function markerTarget(info) {
  return info?.trips.filter(inYear).at(-1)||info?.homes.filter(inYear).find(h=>h.kind==='home')||info?.homes.find(inYear);
}
function onMarkerClick(name,info) {
  storyExperience?.pauseForInteraction();
  if(!info)return;
  showCity(name,info,lastTap,lastTap.element);
}
let lastTap={x:innerWidth/2,y:innerHeight/2,element:null},lastCluster={key:'',at:0};
document.addEventListener('pointerup',e=>{lastTap={x:e.clientX,y:e.clientY,element:e.target.closest?.('.mk,.mk-cluster')||null};},true);
function showCity(name,info,anchor,element) {
  if(recordCard&&!storyBaseLife&&!publicViewer){openRecord({kind:'place',id:lifeSnapshot.placeIds[name]});return;}
  pauseOverviewMotion();
  state.sel=null;state.city=name;expandedCardId=null;
  life?.adapter.focusPlace(lifeSnapshot.placeIds[name]);renderCard();updateSelectionUI();
  const history=cityHistory(info,name,{year:state.year});
  const residenceGroup=(title,items)=>({title,items:items.map(h=>({title:h.title,meta:h.date?.label||'时间未填写',select:()=>select(h.id,{fly:false})}))});
  const groups=[];
  if(history.current.length)groups.push(residenceGroup('现住',history.current));
  if(history.past.length)groups.push(residenceGroup('曾住',history.past));
  groups.push({title:'旅行到访',items:history.journeys.map(({trip,date})=>({title:trip.title,meta:date?.label||'到访日期未知',select:()=>select(trip.id)})),empty:history.journeys.length?'':'没有关联的旅行记录'});
  if(isMobile())body.classList.remove('list-open');
  flyToPoints([posOf(name)],{placeName:name});
  mapChooser.open({title:coreName(name),subtitle:`${history.category} · ${state.year==null?'全部记录':state.year+' 年'} · ${history.journeys.length} 次旅程`,anchor,element,type:'city',groups,
    primary:{title:'近看这里',select:()=>flyToPoints([posOf(name)],{close:true,placeName:name})}});
}
function showPlaceCluster(names,anchor,element) {
  storyExperience?.pauseForInteraction();
  pauseOverviewMotion();
  // First tap zooms in so the cities in this area light up separately; the list is
  // for a second tap on the same cluster when the cities still overlap.
  const key=[...names].sort().join('|');
  if(key!==lastCluster.key||Date.now()-lastCluster.at>15000){lastCluster={key,at:Date.now()};flyToPoints(names.map(n=>posOf(n)).filter(Boolean),{duration:1.6});return;}
  lastCluster={key:'',at:0};
  if(earthHome&&!storyBaseLife){earthHome.openCities(names.map(name=>({name,id:lifeSnapshot.placeIds[name]})));return;}
  mapChooser.open({title:`这一带 · ${names.length} 个地点`,subtitle:'放大地图展开足迹，或直接选择地点',anchor,element,
    items:names.map(name=>{const info=markerInfo.get(name),history=cityHistory(info,name,{year:state.year}),st=statusOf(state.places[name]);
      return {title:name,meta:`${history.category} · ${history.journeys.length} 次旅程`+(st.pending?` · ${st.text}`:''),select:()=>showCity(name,info,anchor,element)};}),
    primary:{title:'放大这片区域',select:()=>flyToPoints(names.map(n=>posOf(n)).filter(Boolean),{duration:2})}});
}
function updateMarkerClasses() {
  if(!footprintOverlay)return;
  const sel=byId(state.sel),selected=new Set(state.city?[state.city]:sel?(sel.kind==='trip'?sel.stops.map(s=>s.place):[sel.place]):[]);
  // The latest trip the earth home is tracing keeps its labels ahead of older footprints.
  const featured=new Set(!sel&&!state.city?byId(earthHome?.featured())?.stops?.map(s=>s.place)||[]:[]);
  const data=[];
  for(const [name,info]of markerInfo) {
    const p=state.places[name],position=posOf(name);if(!position)continue;
    const activeTrips=info.trips.filter(inYear),activeHomes=info.homes.filter(inYear);
    const home=activeHomes.find(h=>h.kind==='home')||activeHomes[0],latest=activeTrips.at(-1),chosen=selected.has(name),observed=info.photos?.some(p=>state.year==null||p.years.includes(state.year));
    data.push({id:name,label:coreName(name),fullName:name,position,lon:p.lon,lat:p.lat,home:home?.anchor?undefined:home?.kind,
      active:!!(activeTrips.length||home||chosen||observed),selected:chosen,dim:!!(sel||state.city)&&!chosen,
      color:latest?typeColors[latest.type]:HOME_COLOR,priority:(home?.kind==='home'?500:chosen?400:featured.has(name)?350:home?300:0)+(latest?.date?.start||0)/1e13});
  }
  footprintOverlay.setItems(data);
}
function updateMarkers(){footprintOverlay?.update();}
function pauseOverviewMotion() {
  stopPlay();orbit=null;globalSpinUntil=0;lastInput=performance.now();
  if(flying){flightGeneration=cameraDirector.begin(viewer.camera.positionCartographic.height>2400000?'global':'place');viewer.camera.cancelFlight();flying=false;}
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

// Draws an arc from its start after `delay`. The line stays dynamic afterwards: swapping in constant
// positions moves it to a static batch that Cesium rebuilds asynchronously, so it blinked out for a few frames.
// Idle frames are not rendered at all, so a dynamic line costs nothing at rest.
function growArc(e,positions,delay,ms) {
  if(reducedMotion)return 0;
  const t0=performance.now()+delay;arcGrowUntil=Math.max(arcGrowUntil,t0+ms+80);
  e.polyline.show=new Cesium.CallbackProperty(()=>performance.now()>=t0,false);
  e.polyline.positions=new Cesium.CallbackProperty(()=>{const f=Math.min(1,(performance.now()-t0)/ms);if(f>=1)return positions;
    const k=1-(1-f)**3;return positions.slice(0,Math.max(2,Math.ceil(k*positions.length)));},false);
  scene.requestRender();return ms;
}
function renderArcs(){arcSignature=null;updateArcs();}
function updateArcs() {
  if(!arcSource)return;
  const sel=byId(state.sel),list=visibleTrips();
  let wanted=state.city?[]:sel?.kind==='trip'?[sel]:(state.year!=null||life?.adapter.scope.type==='chapter')&&list.length<=12?list:[];
  // Earth home overview: trace the latest trip, so the globe itself answers "where did I go last".
  const featured=!wanted.length&&!state.city&&!sel&&!storyBaseLife?list.find(t=>t.id===earthHome?.featured()):null;
  if(featured)wanted=[featured];
  const focus=sel?.kind==='trip'?sel:featured;
  const signature=wanted.map(t=>t.id).join('\u0001')+(featured?'\u0002':''),fresh=signature!==arcSignature;
  // Origin first, then each leg in order. Only the focused trip grows, and only when the focus changes,
  // so data refreshes rebuild the lines without replaying the animation.
  const grow=fresh&&signature!==arcGrown;let delay=0;
  const origin=()=>{
    if(!focus?.origin||focus.inferredConnections)return;
    const a=posOf(focus.origin.place),firstStop=focus.stops.find(s=>located(s.place)),b=firstStop&&posOf(firstStop.place);
    if(!a||!b||Cesium.Cartesian3.distance(a,b)<=30000)return;
    const positions=arcPositions(a,b,96);
    originEntity=arcSource.entities.add({polyline:{positions,width:featured?3.4:2.2,arcType:Cesium.ArcType.NONE,
      material:new Cesium.PolylineDashMaterialProperty({color:Cesium.Color.fromCssColorString(HOME_COLOR).withAlpha(featured?.95:.75),dashLength:18})}});
    if(grow)delay+=growArc(originEntity,positions,delay,900);
  };
  // The focus is part of the signature, so an unchanged signature means the same lines. Rebuilding them
  // on every selection refresh re-batched the geometry for nothing.
  if(!fresh)return;
  arcSignature=signature;if(grow)arcGrown=signature;arcSource.entities.removeAll();arcEntities=[];originEntity=null;
  // Dashed arc from where the person lived at the time to the focused trip.
  origin();
  for(const t of wanted) {
    if(t.routeKind==='unknown')continue;
    const points=t.stops.map(s=>posOf(s.place)).filter(Boolean);
    for(let i=1;i<points.length;i++) {
      const positions=arcPositions(points[i-1],points[i]);
      const e=arcSource.entities.add({polyline:{positions,width:focus?.id===t.id?6:3,arcType:Cesium.ArcType.NONE,
        material:t.inferredConnections?new Cesium.PolylineDashMaterialProperty({dashLength:12,color:Cesium.Color.fromCssColorString(typeColors[t.type]).withAlpha(.65)}):new Cesium.PolylineGlowMaterialProperty({glowPower:.16,color:Cesium.Color.fromCssColorString(typeColors[t.type]).withAlpha(.65)})}});
      if(grow&&focus?.id===t.id)delay+=growArc(e,positions,delay,650);
      arcEntities.push({trip:t,e});
    }
  }
}

/* ================= UI ================= */

function refresh() {
  buildModel();
  if(state.city&&!state.places[state.city]){state.city=null;mapChooser?.close();}
  if(state.sel&&!byId(state.sel))state.sel=null;
  if(!earthHome&&state.year!=null&&!yearOptions(trips).includes(state.year))state.year=null;
  body.classList.toggle('is-empty', !state.rows.length);
  if(!publicViewer)$('#empty-demo').hidden=!life?.canPreviewDemo?.();
  renderStats();
  earthHome?.render();
  renderChips();
  renderList();
  renderTimeline();
  renderYears();
  renderCard();
  renderMarkers();
  renderArcs();
  if (scene) { lightsAnimating = true; scene.requestRender(); }
  if (body.classList.contains('modal-open') && currentTab === 'places') renderTab();
}

function renderStats() {
  const list=visibleTrips(),days=list.reduce((n,t)=>n+scopedDays(t,state.year),0);
  const places=new Set([...list.flatMap(t=>t.stops.filter(s=>s.countsAsTravel!==false).map(s=>s.place)),...visibleHomes().map(h=>h.place),...(lifeSnapshot?.photoPlaces||[]).filter(p=>p.countsAsVisited!==false&&(state.year==null||(p.visitedYears||p.years).includes(state.year))).map(p=>p.place)]),years=yearOptions(list),parts=[];
  if(state.year!=null)parts.push(`<b>${state.year}</b> 年`);
  parts.push(`<b>${list.length}</b> 次旅行`,`<b>${places.size}</b> 个地点`);
  const countries=new Set([...places].map(name=>photoRegion?.(state.places[name]?.photoCity)?.sovereignCode).filter(Boolean));
  if(countries.size)parts.push(`<b>${countries.size}</b> 个国家 / 地区`);
  if(days)parts.push(`<b>${days}</b> 天在路上`);
  if(state.year==null&&years.length)parts.push(years.length===1?`<b>${years[0]}</b>`:`<b>${years[0]}</b>–<b>${years.at(-1)}</b>`);
  const current=state.year==null?homes.find(h=>h.kind==='home'):visibleHomes().find(h=>h.kind==='home')||visibleHomes()[0];
  if(current)parts.push(`<span class="home-stat">${current.anchor?'阶段地点':state.year==null?'现居':'当时居住'} <b>${esc(coreName(current.place))}</b></span>`);
  if(earthHome){const cities=[...places].every(name=>state.places[name]?.photoCity?.key&&state.places[name].photoCity.hasCity!==false);$('#stats').textContent=`${places.size} ${cities?'座城市':'个地点'} · ${list.length} 次旅行`;return;}
  $('#stats').innerHTML=parts.map(part=>`<span class="stat-item">${part}</span>`).join('<i>·</i>');
}
let yearSignature='';
function renderYears() {
  const counted=travelTrips(),options=yearOptions(counted),signature=counted.length+'|'+options.map(y=>`${y}:${counted.filter(t=>matchesYear(t,y)).length}`).join('|');
  const el=$('#year-filter');
  if(signature!==yearSignature||!el.children.length) {
    const scroll=el.scrollLeft;yearSignature=signature;
    el.innerHTML=`<button class="year-option" data-act="all-years" aria-label="全部年份，${counted.length} 次旅行" aria-pressed="false">全部<span>${counted.length}</span></button>`+
      options.map(y=>{const count=counted.filter(t=>matchesYear(t,y)).length;return `<button class="year-option" data-year="${y}" aria-label="按 ${y} 年显示，${count} 次旅行" aria-pressed="false">${y}<span>${count}</span></button>`;}).join('');
    el.scrollLeft=scroll;
  }
  for(const button of el.children){const on=button.dataset.year?+button.dataset.year===state.year:state.year==null;button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));}
}

function statusOf(p) {
  if((publicViewer||storyBaseLife)&&p&&p.lat==null)return {cls:'auto',text:p.granularity==='hidden'?'坐标未公开':'位置未知',pending:true};
  if (!p) return { cls: 'wait', text: '定位中', pending: true };
  return {
    confirmed: { cls: 'ok', text: '已确认', pending: false },
    auto: { cls: 'auto', text: '待确认', pending: true },
    rough: { cls: 'rough', text: '仅定位到省份', pending: true },
    notfound: { cls: 'bad', text: '未找到', pending: true },
  }[p.status] || { cls: 'auto', text: '待确认', pending: true };
}
const pendingPlaces = () => placeNames().filter(n => state.places[n] && state.places[n].status !== 'confirmed');

// One tap replays what the visitor is looking at: the chosen year, else the latest trip.
function replayTarget() {
  if(state.year!=null&&travelTrips().some(t=>matchesYear(t,state.year)))return {source:`year:${state.year}`,label:` ${state.year} 年`};
  const latest=travelTrips().sort((a,b)=>(b.date?.end??-Infinity)-(a.date?.end??-Infinity))[0];
  return latest?{source:`trip:${latest.id}`,label:`「${latest.title.length>8?latest.title.slice(0,8)+'…':latest.title}」`}:null;
}
function renderChips() {
  const out = [];
  if(publicViewer||storyBaseLife){$('#chips').innerHTML=`<span class="chip">${publicViewer?'只读分享 · 不会读取你的数据':'回放中'}</span>`;return;}
  const demo=life?.repository?.getDataset().meta.origin==='demo'&&!sceneDemo;
  if(demo)out.push('<button class="chip" data-act="exit-demo" aria-label="退出示例，回到开始">示例 · 退出</button><button class="chip" data-act="demo-photos">用我的照片开始 →</button>');
  // Replays are made from the visitor's own footprints, so the entry waits for real trips.
  const replay=life&&!sceneDemo&&!demo?replayTarget():null;
  if(replay)out.push(`<button class="chip chip-replay" data-story-quick="${esc(replay.source)}" ${storyExperience?'':'disabled'}>${storyExperience?`▶ 回放${esc(replay.label)}`:'回放准备中…'}</button>`);
  if(sceneDemo)out.push('<a class="chip" href="./">景观演示 · 返回 OnceHere</a>');
  if (geo.busy) out.push(`<span class="chip busy"><span class="spin"></span>正在定位地点 ${geo.done}/${geo.total}</span>`);
  else if (geo.failed) out.push('<button class="chip bad" data-act="retry">定位服务连接失败 · 重试</button>');
  const n = pendingPlaces().length;
  if (n && !geo.busy) out.push(`<button class="chip" data-act="fix">${n} 个地点待确认 →</button>`);
  $('#chips').innerHTML = out.join('');
  $('#tab-badge').textContent = n || '';
  $('#data-dot').hidden = !n;
  const share=$('#btn-share');
  if(share){const data=(storyBaseLife||life)?.repository?.getDataset();share.disabled=!storyExperience?.composer||!data||data.meta.origin==='demo'||!['places','visits','memories','chapters'].some(key=>data[key].length);}
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
    <span class="item-meta">${x.anchor?'阶段地点':x.kind === 'home' ? '现居' : '曾居'}${x.date ? ' · ' + esc(x.date.label) : ''}</span></span></button>`;
}

function renderList() {
  const list = visibleTrips().slice().reverse();
  $('#list-count').textContent = list.length;
  $('#list-filter').innerHTML = state.year
    ? `<span class="filter-chip">仅看 ${state.year}<button data-act="clear-year" aria-label="取消筛选">${ICON.close}</button></span>` : '';
  const types = Object.keys(typeColors).filter(type=>list.some(t=>t.type===type));
  $('#legend').innerHTML = types.length > 1 ? types.map(t => `<span style="--c:${typeColors[t]}"><i></i>${esc(t)}</span>`).join('') : '';
  let html = `<div class="grp"><div class="grp-label">${lifeSnapshot?.chapter?'阶段地点 / 常驻地':'常驻地'}</div>`;
  html += visibleHomes().length ? visibleHomes().map(itemHTML).join('')
    : homes.length&&state.year!=null?'<p class="hint">这一年没有填写居住记录。</p>'
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
  const dated=visibleTrips().filter(t=>t.date),track=$('#tl-track'),viewport=track.parentElement;timelineGroups=new Map();
  const context=[...visibleHomes().filter(h=>h.date),...(lifeSnapshot?.chapterPeriod?[{date:lifeSnapshot.chapterPeriod}]:[])];
  const periods=[...dated,...context];
  $('#timeline').classList.toggle('empty',!periods.length&&$('#chapter-filter').hidden);
  const layout=timelineLayout(dated,{year:state.year,context,viewportWidth:viewport.clientWidth}),P=layout.position;
  const key=JSON.stringify([lifeSnapshot?.chapter?.id,layout.key]);
  const previousScroll=viewport.scrollLeft,latest=key!==timelineLayoutKey||timelineAtLatest;
  timelineLayoutKey=key;timelineViewportWidth=viewport.clientWidth;
  track.style.width=`${layout.width}px`;
  cancelAnimationFrame(timelineFrame);
  timelineFrame=requestAnimationFrame(()=>{
    viewport.scrollLeft=latest?viewport.scrollWidth:previousScroll;
    if(latest)$('#year-filter').scrollLeft=$('#year-filter').scrollWidth;
  });
  if(!periods.length){track.innerHTML='<span class="tl-month" style="left:50%">日期未知</span>';return;}
  const dense=state.year!=null||dated.length>16;track.classList.toggle('dense',dense);
  let html='<div class="tl-rail"></div>';
  if(layout.overlaps(lifeSnapshot?.chapterPeriod)){const d=lifeSnapshot.chapterPeriod,l=P(d.start),r=P(d.end);html+=`<span class="tl-band life-band" style="left:${l}%;width:${Math.max(r-l,.6)}%" title="${esc(lifeSnapshot.chapter.title)} · ${esc(d.label)}"></span>`;}
  for(const h of visibleHomes()) {
    if(!layout.overlaps(h.date))continue;
    const l=P(h.date.start),r=P(h.date.end);
    html+=`<button class="tl-band ${h.kind}${state.sel===h.id?' on':''}" data-id="${esc(h.id)}" style="left:${l}%;width:${Math.max(r-l,.6)}%" title="${h.anchor?'阶段地点':h.kind==='home'?'现居':'曾居'} · ${esc(coreName(h.place))} · ${esc(h.date.label)}"></button>`;
  }
  if(!dense) {
    for(const y of layout.years)html+=`<button class="tl-year has" data-year="${y}" style="left:${layout.yearPosition(y)}%">${y}</button>`;
    for(const t of dated){const x=P(t.date.start);html+=`<button class="tl-dot${x<15?' at-start':x>85?' at-end':''}${state.sel===t.id?' on':''}" data-id="${esc(t.id)}" style="left:${x}%;--c:${typeColors[t.type]}" aria-label="${esc(t.title)}"><span class="tl-tip">${esc(t.title)} · ${esc(t.date.short)}</span></button>`;}
  } else if(state.year==null) {
    for(const {key,items}of timelineBuckets(dated)) {
      const x=layout.yearPosition(key);
      html+=`<button class="tl-bucket" data-year="${key}" style="left:${x}%" aria-label="${key} 年，${items.length} 次旅行，按年查看"><span>${items.length}</span></button><button class="tl-year has" data-year="${key}" style="left:${x}%">${key}</button>`;
    }
  } else {
    for(const month of layout.months)html+=`<span class="tl-month" style="left:${layout.monthPosition(month)}%">${month}月</span>`;
    for(const {key,items}of timelineBuckets(dated,state.year)) {
      const id=String(key),on=items.some(t=>t.id===state.sel);timelineGroups.set(id,items);
      const action=items.length===1?`data-id="${esc(items[0].id)}"`:`data-act="timeline-group" data-group="${id}"`;
      html+=`<button class="tl-bucket${on?' on':''}" ${action} style="left:${layout.monthPosition(key)}%" aria-label="${state.year} 年 ${key} 月，${items.length} 次旅行"><span>${items.length}</span></button>`;
    }
  }
  track.innerHTML=html;
}
function showTimelineGroup(button) {
  pauseOverviewMotion();
  const list=timelineGroups.get(button.dataset.group);if(!list?.length)return;
  const r=button.getBoundingClientRect();
  mapChooser.open({title:`${state.year} 年 ${button.dataset.group} 月`,subtitle:`${list.length} 次旅行`,anchor:{x:r.left+r.width/2,y:r.top},element:button,type:'trips',
    items:list.map(t=>({title:t.title,meta:`${t.date.short} · ${t.stops.length} 个地点`,select:()=>select(t.id)}))});
}

function stopHTML(place, note, color) {
  const st = statusOf(state.places[place]);
  return `<li><button class="stop" data-place="${esc(place)}" style="--c:${color}"><span class="stop-dot"></span>
    <span class="stop-main"><span class="stop-name">${esc(place)}</span>${note ? `<span class="stop-note">${esc(note)}</span>` : ''}</span>
    ${st.pending ? `<span class="badge ${st.cls}">${st.text}</span>` : ''}${located(place) ? '<span class="stop-go">近看</span>' : ''}</button></li>`;
}

function focusCardPlace(name) {
  storyExperience?.pauseForInteraction();life?.adapter.focusPlace(lifeSnapshot.placeIds[name]);
  const pos=posOf(name);
  if(pos)flyToPoints([pos],{close:true,placeName:name});
  else if(publicViewer||storyBaseLife)toast('此地点的坐标未知或未公开');else openModal('places');
}

let expandedCardId=null;
function syncRecordSelection(target){
  state.sel=null;state.city=null;mapChooser?.close();
  if(target?.kind==='place')state.city=Object.keys(lifeSnapshot.placeIds).find(name=>lifeSnapshot.placeIds[name]===target.id)||null;
  else if(target?.kind==='trip'||target?.kind==='residence')state.sel=target.id;
  else if(target?.kind==='chapter'){state.year=null;life.adapter.setScope({type:'chapter',id:target.id});lifeUI?.renderStrip();}
  refresh();updateSelectionUI();
}
function openRecord(target,{fly=true,interaction=true}={}){
  if(!recordCard||publicViewer||storyBaseLife)return;
  if(interaction){storyExperience?.pauseForInteraction();pauseOverviewMotion();}mapChooser?.close();
  earthHome?.selected(target);
  recordCard.open(target);syncRecordSelection(target);
  if(isMobile())body.classList.remove('list-open');
  if(!fly)return;
  const item=byId(target.id);
  if(item)flyToItem(item);
  else if(target.kind==='chapter')homeView(1.8);
  else{
    const name=Object.keys(lifeSnapshot.placeIds).find(name=>lifeSnapshot.placeIds[name]===target.id);
    if(name&&posOf(name))flyToPoints([posOf(name)],{placeName:name});
  }
}
function renderCard() {
  if(recordCard&&!publicViewer&&!storyBaseLife){recordCard.render();return;}
  const el = $('#card');
  const x = byId(state.sel);
  const show=!!x&&(!storyScene||storyExploreCard);
  body.classList.toggle('card-open',show);
  if (!show) { el.classList.remove('show','expanded'); return; }
  const expanded=expandedCardId===x.id;el.classList.toggle('expanded',expanded);
  const primary=x.kind==='trip'?x.stops.find(s=>located(s.place))?.place:x.place;
  const replayButton=x.kind==='trip'&&!storyScene&&!publicViewer&&!storyBaseLife&&life?.repository?.getDataset().meta.origin!=='demo'?`<button class="card-replay" data-story-quick="trip:${esc(x.id)}">▶ 回放</button>`:'';
  const mobileActions=`<div class="card-mobile-actions">${replayButton}${primary&&located(primary)?`<button class="card-primary" data-act="card-near" data-place-name="${esc(primary)}">近看 ${esc(coreName(primary))}</button>`:''}<button data-act="card-details" aria-expanded="${expanded}" aria-controls="card-detail-body">${expanded?'收起详情 ▴':'地点与详情 ▾'}</button></div>`;
  let html = `<button class="x card-x" data-act="close" aria-label="关闭">${ICON.close}</button>${storyScene?'<button class="card-story-back" data-act="story-back">‹ 回到回放</button>':''}`;
  if (x.kind === 'trip') {
    const color = typeColors[x.type];
    const list = visibleTrips(), idx = list.indexOf(x);
    el.style.setProperty('--c', color);
    html += `<div class="card-kicker"><span class="dot"></span>${esc(x.type)} · 第 ${x.n} 次</div>
      <h2>${esc(x.title)}</h2>
      <div class="card-date">${esc(x.date ? x.date.label : '日期未知')}${x.date && x.date.days ? ` <span>· ${x.date.days} 天</span>` : ''}</div>
      ${mobileActions}<div class="card-detail" id="card-detail-body">
      ${x.inferredConnections?`<p class="hint">${x.memoryCount>0?`${x.memoryCount} 张照片记忆 · 照片只提供拍摄位置，`:''}记录地点间的虚线为推测连接，交通方式未知。</p>`:''}
      ${x.origin&&!x.inferredConnections ? `<div class="card-from">从 <button data-id="${esc(x.origin.id)}">${esc(coreName(x.origin.place))}</button> 出发</div>` : ''}
      <ol class="stops">${x.stops.map(s => stopHTML(s.place, s.note, color)).join('')}</ol>
      <div class="card-nav"><button data-act="prev"${idx <= 0 ? ' disabled' : ''}>‹ 上一次</button>
      <span>${idx + 1} / ${list.length}</span><button data-act="next"${idx < 0 || idx >= list.length - 1 ? ' disabled' : ''}>下一次 ›</button></div></div>`;
  } else {
    el.style.setProperty('--c', HOME_COLOR);
    const dur = x.date ? durationText(x.date) : '';
    const fromHere = trips.filter(t => t.origin === x);
    html += `<div class="card-kicker"><span class="dot ${x.kind}"></span>${x.anchor?'阶段地点':x.kind === 'home' ? '现居地' : '曾居地'}</div>
      <h2>${esc(x.title)}</h2>
      <div class="card-date">${x.date ? esc(x.date.label) : '时间未填写'}${dur ? ` <span>· ${dur}</span>` : ''}</div>
      ${mobileActions}<div class="card-detail" id="card-detail-body">
      <ol class="stops">${stopHTML(x.place, x.note, HOME_COLOR)}</ol>
      ${fromHere.length ? `<div class="sub-title">住在这里时的旅行 · ${fromHere.length}</div>
        ${fromHere.map(t => `<button class="mini" data-id="${esc(t.id)}"><span>${esc(t.title)}</span><span>${esc(t.date ? t.date.label : '')}</span></button>`).join('')}` : ''}</div>`;
  }
  el.innerHTML = html;
  el.scrollTop = 0;
  requestAnimationFrame(() => {if(body.classList.contains('card-open')&&state.sel===x.id)el.classList.add('show');});
}

function updateSelectionUI() {
  for (const b of document.querySelectorAll('[data-id]')) {
    if (b.closest('#card')) continue;
    b.classList.toggle('on', b.dataset.id === state.sel);
  }
  updateMarkerClasses();
  updateArcs();
}

function select(id, { fly = true, interaction = true } = {}) {
  if(interaction)storyExperience?.pauseForInteraction();
  if(storyScene)storyExploreCard=true;
  const x = byId(id);
  if (!x) return;
  if(recordCard&&!publicViewer&&!storyBaseLife){openRecord({kind:x.anchor?'place':x.kind==='trip'?'trip':'residence',id:x.anchor?x.placeId:id},{fly,interaction});return;}
  if(state.sel!==id)expandedCardId=null;
  state.city=null;mapChooser?.close();
  state.sel = id;
  if(x.kind==='trip')life?.adapter.focusTrip(id);
  renderCard();
  updateSelectionUI();
  if (isMobile()) body.classList.remove('list-open');
  if (fly) flyToItem(x);
}

function deselect({ home = true } = {}) {
  if(recordCard&&!publicViewer&&!storyBaseLife)recordCard.close();
  expandedCardId=null;
  state.city=null;
  state.sel = null;
  renderCard();
  updateSelectionUI();
  earthHome?.reset();
  if (home) homeView();
}

function step(dir) {
  const list = visibleTrips(), x = byId(state.sel);
  const i = list.indexOf(x);
  const next = list[i + dir];
  if (next) select(next.id);
}

function setYear(y) {
  const next=y==null?null:Number(y);if(next===state.year&&life?.adapter.scope.type!=='chapter'&&!state.sel&&!state.city&&!flying&&!orbit&&!scenery.name)return;
  if(next!=null&&!yearOptions(earthHome?[...trips,...homes]:trips).includes(next))return;
  recordCard?.close();
  stopPlay();mapChooser?.close();state.city=null;state.year=next;
  life?.adapter.setScope({type:'all'});lifeUI?.renderStrip();
  state.sel=null;refresh();
  lightsAnimating=true;scene?.requestRender();
  // A year is an overview filter. Do not dive into a dense group each time it changes.
  if(viewer&&(flying||orbit||scenery.name||viewer.camera.positionCartographic.height<4000000))homeView(1.8);
}

function setChapter(id) {
  if(id&&recordCard&&!publicViewer&&!storyBaseLife){openRecord({kind:'chapter',id});return;}
  recordCard?.close();
  stopPlay();mapChooser?.close();state.city=null;state.sel=null;state.year=null;
  life.adapter.setScope(id?{type:'chapter',id}:{type:'all'});refresh();
  if(id)body.classList.add('list-open');
  if(viewer)homeView(1.8);
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
    select(first.origin.id, { fly: false, interaction:false });
    $('#tl-status').textContent = '从这里出发';
    await flyToItem(first.origin, { duration: 3 });
    if (token !== playToken) return;
    replayLit.add(first.origin.place);
    await sleep(2200);
  }
  for (let i = 0; i < list.length; i++) {
    if (token !== playToken) return;
    $('#tl-status').textContent = `回放 ${i + 1} / ${list.length}`;
    select(list[i].id, { fly: false, interaction:false });
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
  draft = life?.editDraft() || [];
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
        ${photoUI?'<button class="btn" data-act="photo-storage">照片备份与存储</button>':''}
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
          <div class="search-box" hidden><div class="search-row"><input placeholder="换个说法，比如：景区全名、附近的村镇" value="${esc(coreName(n))}"><button class="btn sm" data-act="do-search">离线查找</button><button class="btn sm" data-act="do-online-search">在线查找</button></div><div class="results"></div></div>
        </div>`;
      }).join('') : '<p class="muted">还没有地点。</p>'}`;
  }
}

async function importFile(file) {
  try { $('#paste').value = await readFileText(file); await doImport(); }
  catch (e) { toast('读取文件失败：' + e.message); }
}

async function doImport() {
  const text = $('#paste').value.trim();
  if (!text) { toast('先选择文件或粘贴内容'); return; }
  const mode = (document.querySelector('input[name=mode]:checked') || {}).value || 'append';
  try {
    const result = await importCsvText(text, mode);
    await backupGuide?.importCommitted(life.repository.getDataset());
    life.adapter.setScope({type:'all'});
    state.sel = null; state.year = null;
    closeModal();
    refresh();
    toast(`已导入 ${result.count} 条记录${result.swapped?'；'+result.swapped+' 行按旧规则识别经度在前的坐标，已记录转换':''}`,5000);
    sampleHeights();
    geocodeMissing();
    homeView();
  } catch (e) {
    storageError(e);
  }
}

async function onPlaceAction(act, card, btn) {
  const name = card.dataset.name;
  if (act === 'view') { closeModal(); flyToPoints([posOf(name)]); }
  else if (act === 'ok') { if(await setPlace(name, { ...state.places[name], status: 'confirmed' }))toast('已确认'); }
  else if (act === 'pick') startPick(name);
  else if (act === 'search') { const box = card.querySelector('.search-box'); box.hidden = !box.hidden; if (!box.hidden) box.querySelector('input').focus(); }
  else if (act === 'do-search'||act === 'do-online-search') {
    const q = card.querySelector('.search-box input').value.trim();
    const out = card.querySelector('.results');
    if (!q) return;
    const online=act==='do-online-search';
    if(online&&!window.confirm(`将把『${q}』这个名称发送到 OpenStreetMap 的境外服务。是否继续？`))return;
    out.innerHTML = '<div class="faint" style="padding:6px 10px">搜索中…</div>';
    try {
      const res = await searchPlaces(q,6,online?{online:true,consent:true}:{});
      out.innerHTML = res.length ? res.map((r, i) =>
        `<button data-act="choose" data-i="${i}">${esc(r.name || r.display_name.split(',')[0])}<br><small>${esc(r.display_name)}</small></button>`).join('')
        : '<div class="faint" style="padding:6px 10px">没有找到，换个说法试试，或者直接在地图上点选</div>';
      out._results = res;
    } catch (e) { out.innerHTML = '<div class="faint" style="padding:6px 10px">搜索服务连接失败，稍后再试</div>'; }
  } else if (act === 'choose') {
    const r = card.querySelector('.results')._results[+btn.dataset.i];
    if(await setPlace(name, { lat: +r.lat, lon: +r.lon, status: 'confirmed', label: r.display_name }))toast(`已更新「${coreName(name)}」的位置`);
  }
}

/* ================= events ================= */

function bindEvents() {
  document.addEventListener('earth-confirm',()=>{if(!firstUseUI?.present({resume:true}))lifeUI?.open();});
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-act],[data-id],[data-year],[data-place],[data-tab]');
    if (!t) return;
    if (t.dataset.tab && t.closest('.tabs')) { switchTab(t.dataset.tab); return; }
    const act = t.dataset.act;
    const plCard = t.closest('.pl');
    if (plCard && act) { onPlaceAction(act, plCard, t); return; }
    switch (act) {
      case 'card-near': focusCardPlace(t.dataset.placeName);return;
      case 'card-details': {
        const el=$('#card'),expanded=el.classList.toggle('expanded');expandedCardId=expanded?state.sel:null;
        t.setAttribute('aria-expanded',String(expanded));t.textContent=expanded?'收起详情 ▴':'地点与详情 ▾';footprintOverlay?.invalidate();return;
      }
      case 'close': case 'story-back': deselect({home:!storyScene}); return;
      case 'prev': step(-1); return;
      case 'next': step(1); return;
      case 'exit-demo': exitDemo(); return;
      case 'demo-photos': exitDemo(); $('#btn-photos').click(); return;
      case 'fix': openModal('places'); return;
      case 'retry': geo.failed = false; geocodeMissing(); return;
      case 'clear-year': case 'all-years': setYear(null); return;
      case 'timeline-group': showTimelineGroup(t); return;
      case 'cancel-pick': endPick(); return;
      case 'import': doImport(); return;
      case 'template': download('足迹模板.csv', TEMPLATE_CSV); return;
      case 'export': exportCsv(); return;
      case 'photo-storage': closeModal(); photoUI?.open({storage:true}); return;
      case 'clear':
        if (confirm('确定清空全部足迹与人生阶段吗？建议先下载完整备份。')) { if(await mutateLife(()=>life.clear())){state.sel=null;state.year=null;life.adapter.setScope({type:'all'});closeModal();refresh();homeView();} }
        return;
      case 'add-row': draft.push({ date: '', trip: '', place: '', type: '旅行', note: '' }); renderTab(); return;
      case 'del-row': draft.splice(+t.dataset.i, 1); renderTab(); return;
      case 'save-rows':
        if(await mutateLife(()=>life.editRows(draft.filter(r=>r.place.trim()).map(r=>({...r,place:r.place.trim()}))))){state.sel=null;closeModal();refresh();sampleHeights();geocodeMissing();toast('已保存');}
        return;
    }
    if (t.dataset.year) { setYear(+t.dataset.year); return; }
    if (t.dataset.place && t.closest('#card')) {
      focusCardPlace(t.dataset.place);
      return;
    }
    if (t.dataset.id) select(t.dataset.id);
  });

  document.addEventListener('input', e => {
    const i = e.target.dataset.i, k = e.target.dataset.k;
    if (draft && i != null && k) draft[+i][k] = e.target.value;
  });
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Enter' && e.target.closest('.search-box')) e.target.closest('.search-row').querySelector('[data-act=do-search]').click();
      return;
    }
    if(e.target.closest('#year-filter')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      const buttons=[...$('#year-filter').children],i=buttons.indexOf(e.target);
      const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowRight'?1:-1)));
      buttons[next]?.focus();e.preventDefault();return;
    }
    if(e.target.closest('.tl-main')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      const viewport=$('.tl-main');
      viewport.scrollLeft=e.key==='Home'?0:e.key==='End'?viewport.scrollWidth:viewport.scrollLeft+(e.key==='ArrowRight'?160:-160);
      timelineAtLatest=viewport.scrollWidth-viewport.clientWidth-viewport.scrollLeft<2;
      e.preventDefault();return;
    }
    if (e.key === 'Escape') {
      if(document.querySelector('dialog[open]'))return;
      if (mapChooser?.close(true)) return;
      if(!storyBaseLife&&earthHome?.escape()){e.preventDefault();return;}
      if(!storyBaseLife&&recordCard?.escape()){e.preventDefault();return;}
      if (pickName) endPick();
      else if (body.classList.contains('modal-open')) closeModal();
      else if (state.playing) stopPlay();
      else if (state.sel||recordCard?.selection) deselect();
      else homeView();
    } else if (e.key.toLowerCase() === 'n') toggleTone();
    else if (state.sel && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
  });

  $('#btn-home').addEventListener('click', () => { storyExperience?.pauseForInteraction();stopPlay(); deselect(); });
  $('#btn-tone').addEventListener('click', toggleTone);
  $('#btn-share')?.addEventListener('click',()=>{
    if((storyBaseLife||life)?.repository?.getDataset().meta.origin==='demo'){toast('示例数据不能分享，导入自己的照片后就可以分享');return;}
    storyExperience?.pauseForInteraction();
    storyExperience?.composer?.open({resume:!!storyBaseLife});
  });
  $('#btn-list').addEventListener('click', () => {if(earthHome)return;body.classList.toggle('list-open');footprintOverlay?.invalidate();});
  $('#list-close').addEventListener('click', () => {body.classList.remove('list-open');footprintOverlay?.invalidate();});
  $('#btn-data').addEventListener('click', () => openModal(pendingPlaces().length ? 'places' : 'import'));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#empty-import').addEventListener('click', () => openModal('import'));
  $('#empty-photos')?.addEventListener('click', () => $('#btn-photos').click());
  $('#empty-demo')?.addEventListener('click', () => { if(life?.previewDemo?.()){ stopPlay(); state.sel=null; state.year=null; refresh(); sampleHeights(); homeView(); } });
  $('#btn-play').addEventListener('click', play);
  $('.tl-main').addEventListener('scroll',()=>{const e=$('.tl-main');if(Math.abs(e.clientWidth-timelineViewportWidth)<=1)timelineAtLatest=e.scrollWidth-e.clientWidth-e.scrollLeft<2;},{passive:true});
  new ResizeObserver(()=>{if(Math.abs($('.tl-main').clientWidth-timelineViewportWidth)>1)renderTimeline();}).observe($('.tl-main'));
}

/* ================= boot ================= */

async function boot() {
  await load();
  bindEvents();
  updatePlayUI();
  buildModel();
  if (!window.Cesium) {
    $('#ld-sub').textContent = '地图引擎加载失败，请检查网络后刷新';
    return;
  }
  await initGlobe();
  refresh();
  geocodeMissing();
  storyExperience=await mountStoryExperience({privateData:publicViewer?null:()=>(storyBaseLife||life).repository.getDataset(),getScope:()=>{const owner=storyBaseLife||life,selected=storyBaseSelection&&storyBaseLife?storyBaseSelection.card:recordCard?.selection;if(selected){const model=recordCardModel(owner.repository.getDataset(),selected,{year:storyBaseLife?storyBaseSelection.year:state.year});if(model)return model.scope;}const sel=byId(state.sel);return sel?.kind==='trip'?{type:'trip',id:sel.id}:state.year?{type:'year',year:state.year}:owner.adapter.scope.type==='chapter'?owner.adapter.scope:{type:'all'};},
    reducedMotion,cancel:()=>pauseOverviewMotion(),
    applyBridge:bridge=>{if(!publicViewer&&!storyBaseLife){storyBaseLife=life;storyBaseSelection={year:state.year,sel:state.sel,day:cinematicDay,renderPlaces:state.places,camera:captureCamera(),card:recordCard?.selection};recordCard?.close();}life=bridge;mapChooser?.close();state.city=null;state.year=null;state.sel=null;body.classList.add('story-readonly');
      if(!storyFallbackLayer)storyFallbackLayer=viewer.imageryLayers.addImageryProvider(new Cesium.SingleTileImageryProvider({url:'assets/earth/day-mobile.jpg',tileWidth:2048,tileHeight:1024}),0);
      refresh();},
    restore:()=>{storyScene=null;pauseOverviewMotion();if(storyBaseLife){life=storyBaseLife;storyBaseLife=null;state.year=storyBaseSelection.year;state.sel=storyBaseSelection.sel;state.places=storyBaseSelection.renderPlaces;if(cinematicDay!==storyBaseSelection.day)toggleTone();if(storyFallbackLayer){viewer.imageryLayers.remove(storyFallbackLayer);storyFallbackLayer=null;}body.classList.remove('story-readonly');if(storyBaseSelection.card)recordCard?.open(storyBaseSelection.card);lifeUI?.renderStrip();refresh();}if(earthHome){restoreCamera(storyBaseSelection?.camera);earthHome.restoreReplay();}else homeView(reducedMotion?0:1.2);},
    onError:error=>toast('回放失败：'+error.message,5000),
    onTheme:theme=>{if((theme==='night')!==!cinematicDay)toggleTone();},
    enter:async(item,{signal,instant,speed})=>{
      if(signal.aborted)return;storyScene=item;storyExploreCard=false;$('#toast').classList.remove('show');signal.addEventListener('abort',()=>pauseOverviewMotion(),{once:true});
      mapChooser?.close();state.city=null;state.sel=null;state.year=null;life.adapter.setScope(item.tripId?{type:'trip',id:item.tripId}:item.chapterId?{type:'chapter',id:item.chapterId}:{type:'all'});
      if(item.tripId)state.sel=item.tripId;refresh();
      const duration=instant?0:Math.min(2.4,1.8/speed);
      const name=item.placeId?Object.keys(lifeSnapshot.placeIds).find(name=>lifeSnapshot.placeIds[name]===item.placeId):null;
      if(name){const point=posOf(name),tour=body.classList.contains('first-intro');if(point)return flyToPoints([point],{duration,close:!tour,overview:tour,placeName:name});toast('此地点未公开坐标，继续展示故事内容');return;}
      const points=[...visibleHomes().map(h=>h.place),...visibleTrips().flatMap(t=>t.stops.map(s=>s.place))].map(name=>posOf(name)).filter(Boolean);
      if(['globe','closing'].includes(item.kind)||!points.length){homeView(duration);await new Promise(resolve=>{const timer=setTimeout(resolve,duration*1000);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});}
      else await flyToPoints(points,{duration});
    }});
  renderChips();
  earthHome?.render();
  // An unfinished first use resumes where it stopped; one never started still gets its replay.
  const pendingFirstUse=firstUse?.view();
  if(pendingFirstUse&&!pendingFirstUse.finished&&!document.querySelector('dialog[open]'))firstUseUI.present({resume:true,auto:!pendingFirstUse.answered});
}

await boot();
})().catch(error=>{console.error(error);const el=document.querySelector('#ld-sub');if(el)el.textContent='应用加载失败：'+error.message;});
