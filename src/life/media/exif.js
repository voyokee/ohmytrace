import {MEDIA_LIMITS} from './config.js';

function wallClock(raw) {
  const m=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(raw||'').trim());
  if(!m)return null;
  const [y,mo,d,h,mi,s]=m.slice(1).map(Number),date=new Date(0);
  date.setUTCFullYear(y,mo-1,d);date.setUTCHours(h,mi,s,0);
  if(y<1||mo<1||mo>12||d<1||h>23||mi>59||s>59||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)return null;
  return {localDateTime:`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`,wallClockOrdinal:date.getTime()};
}
export function extractCaptureTime(raw,offsetRaw=null,subsecondRaw=null) {
  const parsed=wallClock(raw);if(!parsed)return null;
  let offsetMinutes=null,utcEpochMs=null;
  const offset=/^([+-])(\d{2}):(\d{2})$/.exec(String(offsetRaw||'').trim());
  if(offset&&+offset[2]<=14&&+offset[3]<60&&!(+offset[2]===14&&+offset[3]!==0))offsetMinutes=(offset[1]==='-'?-1:1)*(+offset[2]*60+(+offset[3]));
  const subsecond=/^\d{1,9}$/.test(String(subsecondRaw||''))?String(subsecondRaw):null;
  if(offsetMinutes!==null)utcEpochMs=parsed.wallClockOrdinal-offsetMinutes*60000+(subsecond?Number(`0.${subsecond}`)*1000:0);
  return {raw:String(raw),offsetRaw:offsetRaw??null,subsecondRaw:subsecondRaw??null,...parsed,offsetMinutes,utcEpochMs,
    subsecond,timeBasis:offsetMinutes===null?'local-unzoned':'offset-instant'};
}

export function parseJpegExif(input,limits=MEDIA_LIMITS) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const result={format:'jpeg',extractedTime:null,coordinates:null,altitude:null,orientation:null,
    dimensions:null,rawTags:{},diagnostics:[],metadataStatus:'missing'};
  const ensure=(offset,length,end=bytes.length)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>end)throw new Error('EXIF_OFFSET_OUT_OF_BOUNDS');};
  const ascii=(offset,length)=>{ensure(offset,length);return new TextDecoder('ascii').decode(bytes.subarray(offset,offset+length)).replace(/\0.*$/s,'').trim();};
  if(bytes.length<2||view.getUint16(0)!==0xffd8)throw new Error('NOT_JPEG');
  function parseTiff(start,end) {
    ensure(start,8,end);const endian=ascii(start,2);if(!['II','MM'].includes(endian))throw new Error('EXIF_ENDIAN');
    const le=endian==='II',u16=o=>{ensure(o,2,end);return view.getUint16(o,le);},u32=o=>{ensure(o,4,end);return view.getUint32(o,le);};
    if(u16(start+2)!==42)throw new Error('EXIF_TIFF_MAGIC');
    const seen=new Set();
    function ifd(relative) {
      if(!relative)return new Map();if(seen.has(relative))throw new Error('EXIF_IFD_CYCLE');seen.add(relative);
      const pos=start+relative,n=u16(pos);if(n>limits.maxIfdEntries)throw new Error('EXIF_IFD_LIMIT');ensure(pos+2,n*12+4,end);
      const tags=new Map(),sizes={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};
      for(let i=0;i<n;i++) {
        const at=pos+2+i*12,tag=u16(at),type=u16(at+2),count=u32(at+4),size=sizes[type];
        // Unknown tags may be huge MakerNotes; they are intentionally not decoded.
        const wanted=[0x112,0x100,0x101,0x8769,0x8825,0x9003,0x9011,0x9291,0xa002,0xa003,1,2,3,4,5,6,7,29];
        if(!wanted.includes(tag)||!size)continue;
        if(count>limits.maxTagValues)throw new Error('EXIF_TAG_LIMIT');
        const length=size*count,valueAt=length<=4?at+8:start+u32(at+8);ensure(valueAt,length,end);
        if(type===2){tags.set(tag,ascii(valueAt,length));continue;}
        const values=[];
        for(let j=0;j<count;j++) {
          const p=valueAt+j*size;let v;
          if(type===1||type===7)v=bytes[p];else if(type===3)v=u16(p);else if(type===4)v=u32(p);
          else if(type===9)v=view.getInt32(p,le);
          else{const signed=type===10,a=signed?view.getInt32(p,le):u32(p),b=signed?view.getInt32(p+4,le):u32(p+4);v=b===0?null:a/b;}
          values.push(v);
        }
        tags.set(tag,values.length===1?values[0]:values);
      }
      return tags;
    }
    const root=ifd(u32(start+4)),exif=ifd(root.get(0x8769)),gps=ifd(root.get(0x8825));
    const raw={DateTimeOriginal:exif.get(0x9003)??null,OffsetTimeOriginal:exif.get(0x9011)??null,
      SubSecTimeOriginal:exif.get(0x9291)??null,Orientation:root.get(0x112)??null,
      GPSLatitudeRef:gps.get(1)??null,GPSLatitude:gps.get(2)??null,GPSLongitudeRef:gps.get(3)??null,
      GPSLongitude:gps.get(4)??null,GPSAltitudeRef:gps.get(5)??null,GPSAltitude:gps.get(6)??null,
      GPSTimeStamp:gps.get(7)??null,GPSDateStamp:gps.get(29)??null};
    result.rawTags=raw;
    result.extractedTime=extractCaptureTime(raw.DateTimeOriginal,raw.OffsetTimeOriginal,raw.SubSecTimeOriginal);
    if(raw.DateTimeOriginal&&!result.extractedTime)result.diagnostics.push('INVALID_CAPTURE_TIME');
    if(raw.OffsetTimeOriginal&&result.extractedTime?.offsetMinutes===null)result.diagnostics.push('INVALID_TIME_OFFSET');
    result.orientation=Number.isInteger(raw.Orientation)&&raw.Orientation>=1&&raw.Orientation<=8?raw.Orientation:null;
    const latitude=coordinate(raw.GPSLatitude,raw.GPSLatitudeRef,'N','S',90),longitude=coordinate(raw.GPSLongitude,raw.GPSLongitudeRef,'E','W',180);
    if(latitude!==null&&longitude!==null)result.coordinates={latitude,longitude};
    else if(raw.GPSLatitude!==null||raw.GPSLongitude!==null)result.diagnostics.push('INVALID_GPS');
    if(Number.isFinite(raw.GPSAltitude)&&[0,1].includes(raw.GPSAltitudeRef))result.altitude={metres:raw.GPSAltitude*(raw.GPSAltitudeRef===1?-1:1),reference:'sea-level'};
    const width=exif.get(0xa002)||root.get(0x100),height=exif.get(0xa003)||root.get(0x101);
    if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0)result.dimensions={width,height};
    result.metadataStatus='parsed';
  }
  try {
    let offset=2;
    while(offset<Math.min(bytes.length,limits.maxHeaderBytes)) {
      ensure(offset,2);if(bytes[offset]!==0xff)throw new Error('JPEG_INVALID_MARKER');
      while(bytes[offset]===0xff)offset++;ensure(offset,1);const marker=bytes[offset++];
      if(marker===0xda||marker===0xd9)break;
      if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;
      ensure(offset,2);const length=view.getUint16(offset);if(length<2)throw new Error('JPEG_INVALID_SEGMENT');ensure(offset,length);
      if(marker===0xe1&&result.metadataStatus==='missing'&&length>=8&&ascii(offset+2,6)==='Exif')parseTiff(offset+8,offset+length);
      if([0xc0,0xc1,0xc2].includes(marker)&&length>=7)result.dimensions={width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
      offset+=length;
    }
    if(offset>=limits.maxHeaderBytes&&result.metadataStatus==='missing')result.diagnostics.push('HEADER_SCAN_LIMIT');
  } catch(error){result.metadataStatus='error';result.diagnostics.push(error.message);result.extractedTime=null;result.coordinates=null;result.altitude=null;}
  if(!result.extractedTime)result.diagnostics.push('NO_CAPTURE_TIME');
  if(!result.coordinates)result.diagnostics.push('NO_GPS');
  return result;
}
function coordinate(values,reference,positive,negative,max) {
  if(!Array.isArray(values)||values.length!==3||values.some(v=>!Number.isFinite(v)||v<0)||values[1]>=60||values[2]>=60||![positive,negative].includes(reference))return null;
  const value=values[0]+values[1]/60+values[2]/3600;
  return value<=max?value*(reference===negative?-1:1):null;
}

export async function analyzePhotoFile(file,{limits=MEDIA_LIMITS}={}) {
  const originalFile={name:file.name||'未命名',type:file.type||'',size:file.size,lastModified:file.lastModified??null};
  if(file.size>limits.maxFileBytes)return {assetId:`diagnostic_${crypto.randomUUID()}`,deduplicationKey:null,originalFile,
    processingStatus:'oversize',metadataStatus:'unsupported',extractedTime:null,coordinates:null,orientation:null,altitude:null,rawTags:{},metadataEvidence:{state:'unknown',source:{kind:'file-diagnostic',reason:'FILE_SIZE_LIMIT'}},diagnostics:['FILE_SIZE_LIMIT'],linkedMemoryId:null,thumbnailReference:null};
  const buffer=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buffer);
  const deduplicationKey=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
  let metadata;
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0xff&&bytes[1]===0xd8)metadata=parseJpegExif(bytes,limits);
  else metadata={format:'unsupported',metadataStatus:'unsupported',extractedTime:null,coordinates:null,orientation:null,altitude:null,rawTags:{},diagnostics:['UNSUPPORTED_FORMAT','NO_CAPTURE_TIME','NO_GPS']};
  return {assetId:`asset_${deduplicationKey}`,deduplicationKey,originalFile,...metadata,
    processingStatus:metadata.metadataStatus==='error'?'error':metadata.metadataStatus==='unsupported'?'unsupported':'analyzed',
    metadataEvidence:{state:metadata.metadataStatus==='parsed'?'observed':'unknown',source:{kind:'local-exif',rawTags:metadata.rawTags}},linkedMemoryId:null,thumbnailReference:null};
}
