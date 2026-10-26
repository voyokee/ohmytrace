import {extractIsoTime} from '../time.js';

// Minimal XMP reader for the handful of properties we use. Workers have no
// DOMParser, so properties are matched as attributes or simple elements.
const MAX_XMP_CHARS=256*1024;
function property(text,name) {
  const q=name.replace(':','\\:');
  const attr=new RegExp(`\\b${q}\\s*=\\s*"([^"]{0,256})"`).exec(text)||new RegExp(`\\b${q}\\s*=\\s*'([^']{0,256})'`).exec(text);
  if(attr)return attr[1].trim();
  const element=new RegExp(`<${q}(?:\\s[^>]*)?>([^<]{0,256})</${q}>`).exec(text);
  if(element)return element[1].trim();
  // rdf:Seq/rdf:Alt wrappers, e.g. tiff:Orientation is plain but some writers wrap.
  const wrapped=new RegExp(`<${q}(?:\\s[^>]*)?>\\s*<rdf:(?:Seq|Alt|Bag)>\\s*<rdf:li(?:\\s[^>]*)?>([^<]{0,256})</rdf:li>`).exec(text);
  return wrapped?wrapped[1].trim():null;
}
/** XMP GPSCoordinate: "DDD,MM,SSk" or "DDD,MM.mmk" (k = N/S/E/W). */
export function xmpCoordinate(value,positive,negative,max) {
  const m=/^(\d{1,3}),(\d{1,2}(?:\.\d+)?)(?:,(\d{1,2}(?:\.\d+)?))?([NSEW])$/i.exec(String(value||'').trim());
  if(!m)return null;
  const ref=m[4].toUpperCase();if(![positive,negative].includes(ref))return null;
  const minutes=+m[2],seconds=m[3]===undefined?0:+m[3];if(minutes>=60||seconds>=60)return null;
  const v=+m[1]+minutes/60+seconds/3600;return v<=max?v*(ref===negative?-1:1):null;
}
const rational=value=>{const m=/^(-?\d+)(?:\/(\d+))?$/.exec(String(value||'').trim());if(!m)return Number.isFinite(+value)?+value:null;return m[2]?(+m[2]?+m[1]/+m[2]:null):+m[1];};

export function parseXmp(input) {
  const text=(typeof input==='string'?input:new TextDecoder('utf-8').decode(input)).slice(0,MAX_XMP_CHARS);
  const raw={DateTimeOriginal:property(text,'exif:DateTimeOriginal'),DateCreated:property(text,'photoshop:DateCreated'),CreateDate:property(text,'xmp:CreateDate'),
    GPSLatitude:property(text,'exif:GPSLatitude'),GPSLongitude:property(text,'exif:GPSLongitude'),GPSAltitude:property(text,'exif:GPSAltitude'),
    GPSAltitudeRef:property(text,'exif:GPSAltitudeRef'),GPSMapDatum:property(text,'exif:GPSMapDatum'),Orientation:property(text,'tiff:Orientation'),
    PixelXDimension:property(text,'exif:PixelXDimension'),PixelYDimension:property(text,'exif:PixelYDimension')};
  const result={rawTags:Object.fromEntries(Object.entries(raw).filter(([,v])=>v!==null)),extractedTime:null,mediaCreatedTime:null,coordinates:null,altitude:null,orientation:null,dimensions:null,diagnostics:[]};
  // exif:DateTimeOriginal is the capture moment; photoshop:DateCreated is the
  // IPTC "date created" used by phones/editors for the same purpose.
  if(raw.DateTimeOriginal)result.extractedTime=extractIsoTime(raw.DateTimeOriginal,'xmp');
  if(!result.extractedTime&&raw.DateCreated)result.extractedTime=extractIsoTime(raw.DateCreated,'xmp-photoshop');
  if((raw.DateTimeOriginal||raw.DateCreated)&&!result.extractedTime)result.diagnostics.push('INVALID_XMP_TIME');
  if(raw.CreateDate)result.mediaCreatedTime=extractIsoTime(raw.CreateDate,'xmp-create');
  const latitude=xmpCoordinate(raw.GPSLatitude,'N','S',90),longitude=xmpCoordinate(raw.GPSLongitude,'E','W',180);
  const datum=String(raw.GPSMapDatum||'').trim();
  if(latitude!==null&&longitude!==null){
    if(latitude===0&&longitude===0)result.diagnostics.push('GPS_NULL_ISLAND');
    else if(datum&&!/^wgs[-\s]?84$/i.test(datum))result.diagnostics.push('GPS_DATUM_NOT_WGS84');
    else result.coordinates={latitude,longitude};
  } else if(raw.GPSLatitude||raw.GPSLongitude)result.diagnostics.push('INVALID_GPS');
  const altitude=rational(raw.GPSAltitude);
  if(result.coordinates&&Number.isFinite(altitude)&&['0','1'].includes(String(raw.GPSAltitudeRef??'0')))result.altitude={metres:altitude*(String(raw.GPSAltitudeRef)==='1'?-1:1),reference:'sea-level'};
  const orientation=Number(raw.Orientation);if(Number.isInteger(orientation)&&orientation>=1&&orientation<=8)result.orientation=orientation;
  const width=Number(raw.PixelXDimension),height=Number(raw.PixelYDimension);
  if(Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0)result.dimensions={width,height};
  return result;
}
