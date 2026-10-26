import {MEDIA_LIMITS} from '../config.js';
import {extractCaptureTime} from '../time.js';

// Shared bounded TIFF/EXIF IFD reader. JPEG APP1, HEIF Exif items, PNG eXIf,
// WebP EXIF chunks and TIFF-based RAW files all carry the same structure.
const WANTED=new Set([0x10f,0x110,0x112,0x100,0x101,0x132,0x8769,0x8825,0x9003,0x9004,0x9010,0x9011,0x9012,0x9291,0x9292,0xa002,0xa003,0xc612,
  1,2,3,4,5,6,7,18,29]);
const SIZES={1:1,2:1,3:2,4:4,5:8,7:1,9:4,10:8};

export function readerFor(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const ensure=(offset,length,end=bytes.length)=>{if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>end)throw new Error('EXIF_OFFSET_OUT_OF_BOUNDS');};
  const ascii=(offset,length,end)=>{ensure(offset,length,end);return new TextDecoder('ascii').decode(bytes.subarray(offset,offset+length)).replace(/\0.*$/s,'').trim();};
  return {bytes,view,ensure,ascii};
}

export function coordinate(values,reference,positive,negative,max) {
  if(!Array.isArray(values)||values.length!==3||values.some(v=>!Number.isFinite(v)||v<0)||values[1]>=60||values[2]>=60||![positive,negative].includes(reference))return null;
  const value=values[0]+values[1]/60+values[2]/3600;
  return value<=max?value*(reference===negative?-1:1):null;
}

/** Reads the IFDs needed for time/GPS/orientation from a TIFF header at [start,end). */
export function parseTiffExif(bytes,start,end=bytes.length,limits=MEDIA_LIMITS) {
  const {view,ensure,ascii}=readerFor(bytes);
  ensure(start,8,end);const endian=ascii(start,2,end);if(!['II','MM'].includes(endian))throw new Error('EXIF_ENDIAN');
  const le=endian==='II',u16=o=>{ensure(o,2,end);return view.getUint16(o,le);},u32=o=>{ensure(o,4,end);return view.getUint32(o,le);};
  if(u16(start+2)!==42)throw new Error('EXIF_TIFF_MAGIC');
  const seen=new Set();
  function ifd(relative) {
    if(!relative)return new Map();if(seen.has(relative))throw new Error('EXIF_IFD_CYCLE');seen.add(relative);
    const pos=start+relative,n=u16(pos);if(n>limits.maxIfdEntries)throw new Error('EXIF_IFD_LIMIT');ensure(pos+2,n*12+4,end);
    const tags=new Map();
    for(let i=0;i<n;i++) {
      const at=pos+2+i*12,tag=u16(at),type=u16(at+2),count=u32(at+4),size=SIZES[type];
      // Unknown tags may be huge MakerNotes; they are intentionally not decoded.
      if(!WANTED.has(tag)||!size)continue;
      if(count>limits.maxTagValues)throw new Error('EXIF_TAG_LIMIT');
      const length=size*count,valueAt=length<=4?at+8:start+u32(at+8);ensure(valueAt,length,end);
      if(type===2){tags.set(tag,ascii(valueAt,length,end));continue;}
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
  // Secondary times are kept apart from capture time; they never become observed capture moments.
  const secondary={DateTimeDigitized:exif.get(0x9004)??null,OffsetTimeDigitized:exif.get(0x9012)??null,SubSecTimeDigitized:exif.get(0x9292)??null,
    DateTime:root.get(0x132)??null,OffsetTime:exif.get(0x9010)??null,GPSMapDatum:gps.get(18)??null,DNGVersion:root.get(0xc612)??null};
  const result={rawTags:raw,secondaryTags:secondary,extractedTime:null,mediaCreatedTime:null,coordinates:null,altitude:null,orientation:null,dimensions:null,gpsTime:null,diagnostics:[]};
  result.extractedTime=extractCaptureTime(raw.DateTimeOriginal,raw.OffsetTimeOriginal,raw.SubSecTimeOriginal);
  if(raw.DateTimeOriginal&&!result.extractedTime)result.diagnostics.push('INVALID_CAPTURE_TIME');
  if(raw.OffsetTimeOriginal&&result.extractedTime?.offsetMinutes===null)result.diagnostics.push('INVALID_TIME_OFFSET');
  const digitized=extractCaptureTime(secondary.DateTimeDigitized,secondary.OffsetTimeDigitized,secondary.SubSecTimeDigitized);
  if(digitized)result.mediaCreatedTime={...digitized,source:'exif-digitized'};
  result.orientation=Number.isInteger(raw.Orientation)&&raw.Orientation>=1&&raw.Orientation<=8?raw.Orientation:null;
  const latitude=coordinate(raw.GPSLatitude,raw.GPSLatitudeRef,'N','S',90),longitude=coordinate(raw.GPSLongitude,raw.GPSLongitudeRef,'E','W',180);
  const datum=typeof secondary.GPSMapDatum==='string'?secondary.GPSMapDatum.trim():'';
  const wgs84=!datum||/^wgs[-\s]?84$/i.test(datum);
  if(latitude!==null&&longitude!==null){
    // Exact 0,0 is the common "no fix" value written by broken firmware, not a photo in the Gulf of Guinea.
    if(latitude===0&&longitude===0)result.diagnostics.push('GPS_NULL_ISLAND');
    else if(!wgs84)result.diagnostics.push('GPS_DATUM_NOT_WGS84');
    else result.coordinates={latitude,longitude};
  } else if(raw.GPSLatitude!==null||raw.GPSLongitude!==null)result.diagnostics.push('INVALID_GPS');
  if(result.coordinates&&Number.isFinite(raw.GPSAltitude)&&[0,1].includes(raw.GPSAltitudeRef))result.altitude={metres:raw.GPSAltitude*(raw.GPSAltitudeRef===1?-1:1),reference:'sea-level'};
  const d=Array.isArray(raw.GPSTimeStamp)&&raw.GPSTimeStamp.length===3&&raw.GPSTimeStamp.every(Number.isFinite)&&/^\d{4}:\d{2}:\d{2}$/.exec(String(raw.GPSDateStamp||''));
  if(d){const [h,m,s]=raw.GPSTimeStamp,ms=Date.parse(`${String(raw.GPSDateStamp).replace(/:/g,'-')}T00:00:00Z`)+((h*60+m)*60+s)*1000;if(Number.isFinite(ms))result.gpsTime={utcEpochMs:Math.round(ms),source:'gps-utc'};}
  const width=exif.get(0xa002)||root.get(0x100),height=exif.get(0xa003)||root.get(0x101);
  if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0)result.dimensions={width,height};
  return result;
}
