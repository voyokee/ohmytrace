// Canonical JSON only. No renderer, DOM, local time or storage dependencies.
export const SCHEMA_VERSION = 1;
export const COLLECTIONS = ['places', 'visits', 'trips', 'residences', 'chapters', 'memories', 'evidence'];
export const clone = value => structuredClone(value);
export const newId = kind => `${kind}_${globalThis.crypto.randomUUID()}`;
export const unknownDate = () => ({ precision: 'unknown', value: null });
export const ongoingDate = () => ({ precision: 'ongoing', value: null });

export function partialDate(raw = '', { end = false } = {}) {
  if (raw && typeof raw === 'object') { validateDate(raw,end); return clone(raw); }
  const text = String(raw).trim();
  if (!text || /^(unknown|未知)$/i.test(text)) return unknownDate();
  if (end && /^(至今|今|现在|ongoing|now|present)$/i.test(text)) return ongoingDate();
  const value = text.replace(/[年月./]/g, '-').replace(/日/g, '').replace(/-$/, '');
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(value);
  if (!m || +m[1] < 1) throw new Error(`无效日期：${text}`);
  const year = +m[1], month = m[2] && +m[2], day = m[3] && +m[3];
  if (month != null && (month < 1 || month > 12)) throw new Error(`无效月份：${text}`);
  const date = new Date(0); date.setUTCFullYear(year, (month || 1) - 1, day || 1); date.setUTCHours(0,0,0,0);
  if (day != null && (day < 1 || date.getUTCMonth() !== month - 1)) throw new Error(`无效日期：${text}`);
  return { precision: day ? 'day' : month ? 'month' : 'year', value: m[1] + (month ? `-${String(month).padStart(2,'0')}` : '') + (day ? `-${String(day).padStart(2,'0')}` : '') };
}

export function dateBound(date, upper = false, now = Date.now()) {
  if (date.precision === 'unknown') return null;
  if (date.precision === 'ongoing') return now;
  const [y,m,d] = date.value.split('-').map(Number), result = new Date(0);
  result.setUTCHours(0,0,0,0);
  result.setUTCFullYear(y, (m || (upper ? 12 : 1)) - 1, d || 1);
  if (upper && !d) { result.setUTCMonth(result.getUTCMonth() + 1, 0); }
  return result.getTime();
}
export function validatePeriod(start, end) {
  validateDate(start, false); validateDate(end, true);
  const a = dateBound(start), b = dateBound(end, true);
  if (a != null && b != null && a > b) throw new Error('开始时间不能晚于结束时间');
}
function validateDate(date, end) {
  if (!date || typeof date !== 'object') throw new Error('缺少日期精度');
  if (date.precision === 'unknown' || end && date.precision === 'ongoing') {
    if (date.value !== null) throw new Error('未知或持续日期不能携带精确值');
  } else {
    const normalized = partialDate(date.value);
    if (normalized.precision === 'unknown' || normalized.precision !== date.precision || normalized.value !== date.value) throw new Error('日期精度和值不匹配');
  }
}
export function emptyDataset(origin = 'new') {
  return { schemaVersion: SCHEMA_VERSION, id: newId('dataset'), revision: 0,
    meta: { origin, migration: null }, ...Object.fromEntries(COLLECTIONS.map(k => [k, []])) };
}
const requireText = (s, label) => { if (typeof s !== 'string' || !s.trim()) throw new Error(`缺少${label}`); };
function validateVisitType(entity) {
  if(entity.visitType!==undefined&&!['travel','pass-through','transit','home','past'].includes(entity.visitType))throw new Error('无效的到访类型');
}
export function validateDataset(data) {
  if (!data || data.schemaVersion !== SCHEMA_VERSION) throw new Error(`不支持的 Life schema 版本：${data?.schemaVersion}`);
  requireText(data.id, 'dataset ID');
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !data.meta || !['new','user','legacy','demo'].includes(data.meta.origin)) throw new Error('无效的数据集元信息');
  const allIds = new Set(), sets = {};
  for (const key of COLLECTIONS) {
    if (!Array.isArray(data[key])) throw new Error(`缺少集合：${key}`);
    sets[key] = new Set();
    for (const entity of data[key]) {
      requireText(entity?.id, `${key} ID`);
      if (allIds.has(entity.id)) throw new Error(`重复 ID：${entity.id}`);
      allIds.add(entity.id); sets[key].add(entity.id);
    }
  }
  const ref = (id, key) => { if (!sets[key].has(id)) throw new Error(`无效关系 ${key}：${id}`); };
  const refs = (ids, key) => {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new Error(`无效关系列表：${key}`);
    ids.forEach(id => ref(id,key));
  };
  for (const e of data.evidence) {
    if (!['observed','inferred','manual','unknown'].includes(e.state)) throw new Error('无效 Evidence 状态');
    if (e.source !== null && (typeof e.source !== 'object' || typeof e.source.kind !== 'string')) throw new Error('无效 Evidence source');
    if (!Array.isArray(e.revisions)) throw new Error('缺少用户修订记录');
    for (const r of e.revisions) if (typeof r.at !== 'string' || !('before' in r) || !('after' in r)) throw new Error('无效修订记录');
    if ('confidence' in e) throw new Error('M0 不制造置信度');
  }
  for (const key of COLLECTIONS.filter(k => k !== 'evidence')) for (const e of data[key]) refs(e.evidenceIds, 'evidence');
  for (const p of data.places) {
    validateVisitType(p);
    if(p.mergedCityKeys!==undefined&&(!Array.isArray(p.mergedCityKeys)||new Set(p.mergedCityKeys).size!==p.mergedCityKeys.length||p.mergedCityKeys.some(key=>typeof key!=='string'||!key.trim()||key.length>512)))throw new Error('无效的城市合并记录');
    requireText(p.name, '地点名称');
    if (p.coordinates !== null && (!p.coordinates || !Number.isFinite(p.coordinates.latitude) || !Number.isFinite(p.coordinates.longitude) || Math.abs(p.coordinates.latitude)>90 || Math.abs(p.coordinates.longitude)>180)) throw new Error('无效经纬度');
  }
  for (const v of data.visits) {
    ref(v.placeId,'places'); validatePeriod(v.start,v.end);
    if (v.tripId !== null) ref(v.tripId,'trips');
    if (!v.legacy || ['date','trip','place','type','note'].some(k => typeof v.legacy[k] !== 'string')) throw new Error('缺少 CSV 原始行');
  }
  for (const t of data.trips) {
    validateVisitType(t);
    requireText(t.title,'旅行标题'); validatePeriod(t.start,t.end); refs(t.visitIds,'visits');
    if (!t.visitIds.length) throw new Error('旅行缺少 Stops');
    for (const id of t.visitIds) if (data.visits.find(v=>v.id===id).tripId!==t.id) throw new Error('Trip/Visit 关系不一致');
  }
  for (const v of data.visits) if (v.tripId && !data.trips.find(t=>t.id===v.tripId).visitIds.includes(v.id)) throw new Error('Visit 不在 Trip Stops 内');
  for (const r of data.residences) {
    ref(r.placeId,'places'); ref(r.visitId,'visits'); validatePeriod(r.start,r.end);
    const v=data.visits.find(v=>v.id===r.visitId);
    if(v.tripId!==null||v.placeId!==r.placeId||!['home','past'].includes(r.kind))throw new Error('Residence/Visit 关系不一致');
  }
  for (const c of data.chapters) {
    requireText(c.title,'阶段标题'); requireText(c.type,'阶段类型'); validatePeriod(c.start,c.end);
    refs(c.homeAnchors,'places'); refs(c.relatedTripIds,'trips'); refs(c.memoryIds,'memories');
  }
  for (const m of data.memories) {
    requireText(m.kind,'Memory 类型'); refs(m.placeIds,'places'); refs(m.tripIds,'trips'); validatePeriod(m.start,m.end);
  }
  return data;
}

// v0 was the unversioned footprints format, handled explicitly by legacy.js.
// Future canonical migrations must be registered here, never guessed.
export function migrateDataset(input) { return validateDataset(clone(input)); }
export function exportJSON(data) { return JSON.stringify(validateDataset(data), null, 2); }
export function importJSON(text) { return migrateDataset(JSON.parse(text)); }

export function addEvidence(data, state = 'unknown', source = null, revisions = []) {
  const evidence = { id: newId('evidence'), state, source: clone(source), revisions: clone(revisions) };
  data.evidence.push(evidence); return [evidence.id];
}
export function manualEvidence(data, source, before, after) {
  return addEvidence(data,'manual',source,[{at:new Date().toISOString(),before:clone(before),after:clone(after)}]);
}
export function upsertChapter(data, input) {
  const old = input.id ? data.chapters.find(c=>c.id===input.id) : null;
  if(input.id && !old) throw new Error('人生阶段不存在');
  const chapter = { id:old?.id || newId('chapter'), title:input.title?.trim(), type:input.type || 'other',
    start:partialDate(input.start ?? ''),
    end:partialDate(input.end ?? '',{end:true}),
    homeAnchors:[...(input.homeAnchors || [])], relatedTripIds:[...(input.relatedTripIds || [])], memoryIds:[...(input.memoryIds || old?.memoryIds || [])],
    evidenceIds:[...(old?.evidenceIds || [])] };
  chapter.evidenceIds.push(...manualEvidence(data,{kind:'chapter-editor'},old || null,{...chapter,evidenceIds:[]}));
  if(old) data.chapters[data.chapters.indexOf(old)] = chapter; else data.chapters.push(chapter);
  validateDataset(data); return chapter.id;
}
export function deleteChapter(data,id) { data.chapters = data.chapters.filter(c=>c.id!==id); }
export function addMemory(data, input) {
  const memory={id:newId('memory'),kind:input.kind || 'note',title:input.title || '',uri:input.uri || null,
    start:partialDate(input.start || ''),end:partialDate(input.end || '',{end:true}),
    placeIds:[...(input.placeIds||[])],tripIds:[...(input.tripIds||[])],evidenceIds:addEvidence(data,input.state||'unknown',input.source||null)};
  data.memories.push(memory);validateDataset(data);return memory.id;
}
