import { COLLECTIONS, emptyDataset, newId, clone, partialDate, unknownDate, addEvidence, manualEvidence, validateDataset } from './schema.js';

const ALIASES={date:['日期','date','时间','time'],trip:['行程','trip','旅行','标题','title','名称','name'],
  place:['地点','place','location','地名','目的地'],type:['类型','type','分类','category'],note:['备注','note','notes','描述','说明','description'],
  coord:['坐标','coord','coords','coordinate','coordinates','经纬度'],lat:['纬度','lat','latitude'],lon:['经度','lon','lng','longitude'],
  _lifeVisitId:['visit_id'],_lifePlaceId:['place_id'],_lifeTripId:['trip_id']};
export const kindOf = type => /曾|以前|过去|旧居|老家|故乡/.test(type||'')?'past':/现居|现住|常驻|居住|^家$|现在/.test(type||'')?'home':'trip';
export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/,1)[0], count=c=>first.split(c).length-1;
  const delim=count('\t')>count(',')?'\t':!count(',')&&count('，')?'，':',';
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}
    else if(c==='"')quoted=true;
    else if(c===delim){row.push(field);field='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV 引号未闭合');
  if(field!==''||row.length){row.push(field);rows.push(row);}
  return rows.filter(r=>r.some(v=>v.trim()!==''));
}
export function parseCoord(raw) {
  const m=String(raw||'').match(/^\s*(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(!m)return null;
  let a=+m[1],b=+m[2];if(Math.abs(a)>90&&Math.abs(b)<=90)[a,b]=[b,a];
  return Math.abs(a)<=90&&Math.abs(b)<=180?[a,b]:null;
}
export function parseLegacyPeriod(raw='') {
  const norm=raw.trim().replace(/[年月./]/g,'-').replace(/日/g,'')
    .replace(/\s*(?:~|～|到|—|–|-)?\s*(至今|现在|now|present)$/i,'~至今');
  if(!norm)return {start:unknownDate(),end:unknownDate()};
  const parts=norm.split(/\s*(?:~|～|至(?!今)|到|—|–)\s*|\s+-\s+/);
  const start=partialDate(parts[0]);
  if(parts.length===1)return {start,end:clone(start)};
  let right=parts[1]?.trim()||'';
  if(right&&!/^(至今|今|现在|now|present)$/i.test(right)&&!/^\d{4}/.test(right)) {
    const nums=right.split('-'),left=start.value.split('-');
    right=nums.length===1&&left.length===3?`${left[0]}-${left[1]}-${right}`:`${left[0]}-${right}`;
  }
  return {start,end:partialDate(right,{end:true})};
}
function periodWithEvidence(data, raw, source) {
  try {return {...parseLegacyPeriod(raw),evidenceIds:addEvidence(data,'observed',source)};}
  catch {return {start:unknownDate(),end:unknownDate(),evidenceIds:addEvidence(data,'unknown',{...source,unparsedDate:raw})};}
}
export function parseLegacyCSV(text) {
  const table=parseCSV(text);if(table.length<2)throw new Error('没有读到数据行');
  const cols=table[0].map(h=>Object.keys(ALIASES).find(k=>ALIASES[k].includes(h.trim().toLowerCase())));
  if(!cols.includes('place'))throw new Error('缺少「地点」列，请检查表头');
  const rows=[];let swapped=0;
  for(const [index,cells] of table.slice(1).entries()) {
    const r={date:'',trip:'',place:'',type:'',note:''};let coord='',lat='',lon='';
    cols.forEach((key,i)=>{const value=(cells[i]??'').trim();if(key==='coord')coord=value;else if(key==='lat')lat=value;else if(key==='lon')lon=value;else if(key)r[key]=value;});
    if(!r.place)continue;
    if(coord){const c=parseCoord(coord);if(!c)throw new Error(`第 ${index+2} 行坐标无效`);r._coordinates={latitude:c[0],longitude:c[1]};
      r._swapped=Math.abs(+coord.split(/[,，\s]+/)[0])>90;if(r._swapped)swapped++;
    } else if(lat||lon) {
      if(!lat||!lon||!Number.isFinite(+lat)||!Number.isFinite(+lon)||Math.abs(+lat)>90||Math.abs(+lon)>180)throw new Error(`第 ${index+2} 行纬度/经度无效（独立字段不交换顺序）`);
      r._coordinates={latitude:+lat,longitude:+lon};
    }
    rows.push(r);
  }
  if(!rows.length)throw new Error('没有读到包含地点的行');
  return {rows,swapped};
}
const rowFields=r=>Object.fromEntries(['date','trip','place','type','note'].map(k=>[k,String(r[k]??'')]));
const fingerprint=r=>JSON.stringify([rowFields(r),r._coordinates??null]);

// Reconcile a legacy editing draft. Persisted visit IDs carry identity through edits;
// title/date grouping is used only to interpret new CSV rows as legacy trips.
export function reconcileRows(data, rows, {source={kind:'legacy-editor'}, manual=false}={}) {
  const previous=clone(data),oldVisits=new Map(previous.visits.map(v=>[v.id,v])),usedVisits=new Set();
  const nextVisits=[],nextTrips=[],nextHomes=[],groups=new Map();
  for(const raw of rows) {
    const row=rowFields(raw);if(!row.place.trim())continue;
    const old=oldVisits.get(raw._lifeVisitId);
    let place=raw._lifePlaceId&&data.places.find(p=>p.id===raw._lifePlaceId);
    const renamed=manual&&old&&old.legacy.place!==row.place;
    if(renamed)place=null;
    const coordinates=renamed?null:raw._coordinates ?? (place?.coordinates || null);
    if(!place&&coordinates)place=data.places.find(p=>p.name===row.place&&p.coordinates?.latitude===coordinates.latitude&&p.coordinates?.longitude===coordinates.longitude);
    if(!place&&raw._legacyPlaceKey)place=data.places.find(p=>p.legacyKey===raw._legacyPlaceKey);
    if(!place) {
      const requested=raw._lifePlaceId;
      place={id:requested&&!data.places.some(p=>p.id===requested)?requested:newId('place'),name:row.place,coordinates:clone(coordinates),
        location:clone(raw._location||{status:coordinates?'confirmed':'unknown'}),
        evidenceIds:addEvidence(data,coordinates?(['auto','rough'].includes(raw._location?.status)?'inferred':'observed'):'unknown',
          {...source,coordinateOrder:'latitude,longitude',...(raw._location?.status?{legacyCoordinateStatus:raw._location.status}:{}),...(raw._swapped?{normalization:'legacy-unambiguous-longitude-first'}:{})}),
        ...(raw._legacyPlaceKey?{legacyKey:raw._legacyPlaceKey}:{})};
      data.places.push(place);
    }
    let id=old?.id || raw._lifeVisitId || newId('visit');
    if(usedVisits.has(id))id=newId('visit');usedVisits.add(id);
    const period=old&&old.legacy.date===row.date?{start:old.start,end:old.end,evidenceIds:old.evidenceIds}:periodWithEvidence(data,row.date,source);
    const visit={id,placeId:place.id,tripId:null,...period,legacy:row};
    if(manual&&old&&JSON.stringify(old.legacy)!==JSON.stringify(row))visit.evidenceIds=[...visit.evidenceIds,...manualEvidence(data,source,old.legacy,row)];
    const kind=kindOf(row.type);
    if(kind==='trip') {
      const hint=JSON.stringify([row.trip||row.place,row.date]);
      const priorTrip=old?.tripId || raw._lifeTripId;
      let trip=groups.get(priorTrip||hint);
      if(!trip){const prior=previous.trips.find(t=>t.id===priorTrip);trip={id:prior?.id||priorTrip||newId('trip'),title:row.trip||row.place,type:row.type||'旅行',start:clone(visit.start),end:clone(visit.end),visitIds:[],evidenceIds:prior?.evidenceIds||addEvidence(data,'observed',source)};groups.set(priorTrip||hint,trip);nextTrips.push(trip);}
      trip.visitIds.push(id);visit.tripId=trip.id;
    } else {
      const prior=previous.residences.find(r=>r.visitId===id);
      nextHomes.push({id:prior?.id||newId('residence'),visitId:id,placeId:place.id,kind,start:clone(visit.start),end:clone(visit.end),title:row.trip||row.place,note:row.note,type:row.type,evidenceIds:prior?.evidenceIds||visit.evidenceIds});
    }
    nextVisits.push(visit);
  }
  data.visits=nextVisits;data.trips=nextTrips;data.residences=nextHomes;
  const tripIds=new Set(nextTrips.map(t=>t.id));
  for(const chapter of data.chapters)chapter.relatedTripIds=chapter.relatedTripIds.filter(id=>tripIds.has(id));
  for(const memory of data.memories)memory.tripIds=memory.tripIds.filter(id=>tripIds.has(id));
  validateDataset(data);return data;
}
export function datasetRows(data) {
  return data.visits.map(v=>{const p=data.places.find(p=>p.id===v.placeId);return {...clone(v.legacy),_lifeVisitId:v.id,_lifePlaceId:p.id,_lifeTripId:v.tripId,_coordinates:clone(p.coordinates)};});
}
export function importCSVInto(data,text,mode='append') {
  const parsed=parseLegacyCSV(text);
  if(data.meta.origin==='demo')for(const key of COLLECTIONS)data[key]=[];
  const current=datasetRows(data);
  let rows=parsed.rows;
  if(mode==='append') {
    const seen=new Set(current.map(fingerprint));rows=[...current];
    for(const row of parsed.rows)if(!seen.has(fingerprint(row))){rows.push(row);seen.add(fingerprint(row));}
  }
  reconcileRows(data,rows,{source:{kind:'csv'}});data.meta.origin='user';return {count:parsed.rows.length,swapped:parsed.swapped};
}
export function migrateLegacy(legacy) {
  if(!legacy||!Array.isArray(legacy.rows)||legacy.places!=null&&(typeof legacy.places!=='object'||Array.isArray(legacy.places)))throw new Error('旧 footprints.v1 格式损坏；请备份后修复');
  const data=emptyDataset('legacy');
  const rows=legacy.rows.map(row=>{
    if(!row||['date','trip','place','type','note'].some(k=>typeof row[k]!=='string'))throw new Error('旧足迹行格式损坏');
    const p=legacy.places?.[row.place],coords=p?.lat!=null?{latitude:p.lat,longitude:p.lon}:null;
    return {...row,_coordinates:coords,_location:p||{status:'unknown'},_legacyPlaceKey:`footprints.v1:${row.place}`};
  });
  return reconcileRows(data,rows,{source:{kind:'localStorage',key:'footprints.v1'}});
}
export function updatePlace(data,id,location,{manual=true}={}) {
  const place=data.places.find(p=>p.id===id);if(!place)throw new Error('地点不存在');
  const before={coordinates:clone(place.coordinates),location:clone(place.location)};
  place.coordinates=location.lat==null?null:{latitude:location.lat,longitude:location.lon};place.location=clone(location);
  place.evidenceIds.push(...(manual?manualEvidence(data,{kind:'coordinate-correction'},before,{coordinates:place.coordinates,location:place.location}):addEvidence(data,'inferred',{kind:'geocoder',provider:'Nominatim',result:clone(location)})));
  validateDataset(data);
}
const csvCell=value=>{const s=String(value??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
export function exportLegacyCSV(data) {
  const lines=[['日期','行程','地点','类型','备注','坐标','visit_id','place_id','trip_id']];
  for(const row of datasetRows(data))lines.push([row.date,row.trip,row.place,row.type,row.note,row._coordinates?`${row._coordinates.latitude},${row._coordinates.longitude}`:'',row._lifeVisitId,row._lifePlaceId,row._lifeTripId]);
  return lines.map(r=>r.map(csvCell).join(',')).join('\n')+'\n';
}
