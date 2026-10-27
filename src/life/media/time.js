// Capture-time semantics shared by every container format. A time is only an
// instant when the source states its offset; otherwise it is a local wall clock.
function wallClock(y,mo,d,h,mi,s) {
  const date=new Date(0);date.setUTCFullYear(y,mo-1,d);date.setUTCHours(h,mi,s,0);
  if(y<1||mo<1||mo>12||d<1||h>23||mi>59||s>59||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  const p=(n,w=2)=>String(n).padStart(w,'0');
  return {localDateTime:`${p(y,4)}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}`,wallClockOrdinal:date.getTime()};
}
function offsetMinutesOf(text) {
  const offset=/^([+-])(\d{2}):?(\d{2})$/.exec(text);
  if(!offset||+offset[2]>14||+offset[3]>=60||+offset[2]===14&&+offset[3]!==0)return null;
  return (offset[1]==='-'?-1:1)*(+offset[2]*60+(+offset[3]));
}
function finish(parsed,{raw,offsetRaw,subsecondRaw,offsetMinutes,subsecond,source}) {
  const utcEpochMs=offsetMinutes===null?null:parsed.wallClockOrdinal-offsetMinutes*60000+(subsecond?Number(`0.${subsecond}`)*1000:0);
  const time={raw:String(raw),offsetRaw:offsetRaw??null,subsecondRaw:subsecondRaw??null,...parsed,offsetMinutes,utcEpochMs,
    subsecond,timeBasis:offsetMinutes===null?'local-unzoned':'offset-instant'};
  // v1 manifests carry no source and mean EXIF DateTimeOriginal; keep that shape byte-identical.
  if(source&&source!=='exif-original')time.source=source;
  return time;
}

/** EXIF "YYYY:MM:DD hh:mm:ss" plus optional OffsetTime* and SubSecTime*. */
export function extractCaptureTime(raw,offsetRaw=null,subsecondRaw=null,source='exif-original') {
  const m=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(raw||'').trim());
  if(!m)return null;
  const parsed=wallClock(...m.slice(1).map(Number));if(!parsed)return null;
  const offsetMinutes=/^[+-]\d{2}:\d{2}$/.test(String(offsetRaw||'').trim())?offsetMinutesOf(String(offsetRaw).trim()):null;
  const subsecond=/^\d{1,9}$/.test(String(subsecondRaw||''))?String(subsecondRaw):null;
  return finish(parsed,{raw,offsetRaw,subsecondRaw,offsetMinutes,subsecond,source});
}

/** XMP/ISO 8601 date-time. Date-only values are too coarse to be a capture time. */
export function extractIsoTime(raw,source='xmp') {
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(String(raw||'').trim());
  if(!m)return null;
  const parsed=wallClock(+m[1],+m[2],+m[3],+m[4],+m[5],+(m[6]||0));if(!parsed)return null;
  const zone=m[8]||null,offsetMinutes=zone==='Z'?0:zone?offsetMinutesOf(zone):null;
  if(zone&&offsetMinutes===null)return null;
  return finish(parsed,{raw,offsetRaw:zone,subsecondRaw:m[7]||null,offsetMinutes,subsecond:m[7]||null,source});
}

/** Recomputes a stored time from its raw evidence; used to reject tampered backups. */
export function reparseTime(time) {
  if(!time)return null;
  const source=time.source||'exif-original';
  if(['exif-original','exif-digitized'].includes(source))return extractCaptureTime(time.raw,time.offsetRaw,time.subsecondRaw,source);
  if(['xmp','xmp-photoshop','xmp-create'].includes(source))return extractIsoTime(time.raw,source);
  return null;
}
export const TIME_FIELDS=['localDateTime','wallClockOrdinal','offsetMinutes','utcEpochMs','timeBasis'];
