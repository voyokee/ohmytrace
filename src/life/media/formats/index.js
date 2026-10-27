import {MEDIA_LIMITS} from '../config.js';
import {parseTiffExif} from './tiff.js';
import {parseXmp} from './xmp.js';
import {walkJpeg,walkHeif,walkPng,walkWebp} from './containers.js';

const ascii=(b,at,n)=>String.fromCharCode(...b.subarray(at,at+n));
const HEIF_BRANDS=new Set(['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1','avif','avis','MiHE','MiHB','MiPr']);
const VIDEO_BRANDS=/^(qt  |isom|iso[2-9]|mp4[12]|M4V |M4A |3gp\d|3g2\w|avc1|dash|mmp4|f4v )$/;
const RAW_EXTENSIONS=/\.(dng|cr2|nef|nrw|arw|srf|sr2|pef|orf|rw2|raf|cr3|3fr|erf|kdc|mrw|srw|x3f|iiq)$/i;

/** Identifies the actual container from its signature; extensions only label RAW variants. */
export function sniffFormat(bytes,name='') {
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {format:'jpeg',mediaType:'image'};
  if(bytes.length>=8&&ascii(bytes,0,8)==='\x89PNG\r\n\x1a\n')return {format:'png',mediaType:'image'};
  if(bytes.length>=12&&ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return {format:'webp',mediaType:'image'};
  if(bytes.length>=12&&ascii(bytes,4,4)==='ftyp'){
    const major=ascii(bytes,8,4),size=new DataView(bytes.buffer,bytes.byteOffset).getUint32(0),brands=[major];
    for(let at=16;at+4<=Math.min(size,bytes.length,64);at+=4)brands.push(ascii(bytes,at,4));
    if(major==='crx ')return {format:'cr3',mediaType:'raw'};
    if(brands.some(b=>HEIF_BRANDS.has(b))&&!VIDEO_BRANDS.test(major))return {format:brands.includes('avif')?'avif':'heif',mediaType:'image'};
    if(VIDEO_BRANDS.test(major)||brands.some(b=>VIDEO_BRANDS.test(b)))return {format:major==='qt  '?'mov':'mp4',mediaType:'video'};
  }
  if(bytes.length>=4&&(ascii(bytes,0,4)==='II*\0'||ascii(bytes,0,4)==='MM\0*'))return {format:RAW_EXTENSIONS.test(name)?'raw-tiff':'tiff',mediaType:RAW_EXTENSIONS.test(name)?'raw':'image'};
  if(bytes.length>=4&&['IIRO','IIU\0'].includes(ascii(bytes,0,4))||bytes.length>=15&&ascii(bytes,0,15)==='FUJIFILMCCD-RAW')return {format:'raw',mediaType:'raw'};
  if(bytes.length>=6&&/^GIF8[79]a$/.test(ascii(bytes,0,6)))return {format:'gif',mediaType:'image'};
  if(bytes.length>=2&&ascii(bytes,0,2)==='BM')return {format:'bmp',mediaType:'image'};
  return {format:RAW_EXTENSIONS.test(name)?'raw':'unknown',mediaType:RAW_EXTENSIONS.test(name)?'raw':'unknown'};
}

/**
 * Locates metadata inside a sampled header. Returns either a parsed result or
 * {needs:[ranges]} when HEIF items lie beyond the header, or {retryFull:true}
 * when the header was too short for the container's metadata.
 */
export function locateMetadata(bytes,{name='',size=bytes.length,limits=MEDIA_LIMITS}={}) {
  const kind=sniffFormat(bytes,name);
  const container=kind.format==='jpeg'?walkJpeg(bytes,limits):kind.format==='png'?walkPng(bytes,limits):kind.format==='webp'?walkWebp(bytes,limits):
    ['heif','avif'].includes(kind.format)?walkHeif(bytes,limits):kind.format==='tiff'||kind.format==='raw-tiff'?{exif:{start:0,end:bytes.length},diagnostics:[],truncated:bytes.length<size}:null;
  return {...kind,container};
}

function merge(kind,container,exif,xmp,errors) {
  const diagnostics=[...(container?.diagnostics||[]),...errors,...(exif?.diagnostics||[]),...(xmp?.diagnostics||[])];
  const result={format:kind.format,mediaType:kind.mediaType,metadataSources:[],extractedTime:null,mediaCreatedTime:null,gpsTime:null,coordinates:null,altitude:null,
    orientation:null,dimensions:container?.dimensions||null,rawTags:exif?.rawTags||{},diagnostics,metadataStatus:'missing'};
  if(exif){result.metadataSources.push('exif');Object.assign(result,{extractedTime:exif.extractedTime,mediaCreatedTime:exif.mediaCreatedTime,gpsTime:exif.gpsTime,
    coordinates:exif.coordinates,altitude:exif.altitude,orientation:exif.orientation});if(exif.dimensions&&!result.dimensions)result.dimensions=exif.dimensions;}
  if(xmp){
    result.metadataSources.push('xmp');result.xmpTags=xmp.rawTags;
    result.extractedTime??=xmp.extractedTime;result.mediaCreatedTime??=xmp.mediaCreatedTime;result.orientation??=xmp.orientation;result.dimensions??=xmp.dimensions;
    if(!result.coordinates&&xmp.coordinates){result.coordinates=xmp.coordinates;result.altitude=xmp.altitude;}
    else if(result.coordinates&&xmp.coordinates&&(Math.abs(result.coordinates.latitude-xmp.coordinates.latitude)>0.01||Math.abs(result.coordinates.longitude-xmp.coordinates.longitude)>0.01))diagnostics.push('GPS_SOURCE_CONFLICT');
  }
  if(container?.rotation)result.rotation=container.rotation;
  if(container?.modified)result.containerModified=container.modified;
  result.metadataStatus=result.metadataSources.length?'parsed':errors.length?'error':'missing';
  if(result.metadataStatus==='error'){result.extractedTime=null;result.coordinates=null;result.altitude=null;}
  if(!result.extractedTime)diagnostics.push('NO_CAPTURE_TIME');
  if(!result.coordinates)diagnostics.push('NO_GPS');
  result.diagnostics=[...new Set(diagnostics)];
  return result;
}

/** Parses already-located metadata. `items` supplies bytes for HEIF ranges read separately. */
export function parseLocated(bytes,located,{items={},limits=MEDIA_LIMITS}={}) {
  const {container}=located,errors=[];let exif=null,xmp=null;
  if(!container)return {format:located.format,mediaType:located.mediaType,metadataSources:[],metadataStatus:'unsupported',extractedTime:null,mediaCreatedTime:null,gpsTime:null,coordinates:null,altitude:null,orientation:null,dimensions:null,rawTags:{},
    diagnostics:[located.mediaType==='video'?'VIDEO_DEFERRED':located.mediaType==='raw'?'RAW_METADATA_UNSUPPORTED':'UNSUPPORTED_FORMAT','NO_CAPTURE_TIME','NO_GPS']};
  try{
    if(container.exif)exif=parseTiffExif(container.exif.bytes||bytes,container.exif.start,container.exif.end,limits);
    else if(items.exif){
      // HEIF Exif item: 4-byte big-endian offset to the TIFF header, then the header.
      const data=items.exif;if(data.length<4)throw new Error('HEIF_EXIF_OFFSET');
      let start=4+new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(0);if(start>=data.length)throw new Error('HEIF_EXIF_OFFSET');
      if(data.length-start>=6&&ascii(data,start,4)==='Exif'&&data[start+4]===0)start+=6;
      exif=parseTiffExif(data,start,data.length,limits);
    }
  }catch(error){errors.push(error.message);}
  try{const x=container.xmp||items.xmp;if(x)xmp=parseXmp(x);}catch(error){errors.push('XMP_'+error.message);}
  if(exif?.secondaryTags?.DNGVersion!=null)located={...located,format:'dng',mediaType:'raw'};
  return merge(located,container,exif,xmp,errors);
}

/** Synchronous whole-buffer parse, used by tests and small in-memory inputs. */
export function parseMediaBytes(bytes,{name='',limits=MEDIA_LIMITS}={}) {
  const located=locateMetadata(bytes,{name,limits}),items={};
  for(const key of ['exif','xmp']){
    const ranges=located.container?.[key+'Item'];if(!ranges)continue;
    const total=ranges.reduce((n,r)=>n+r.length,0),joined=new Uint8Array(total);let p=0;
    for(const r of ranges){if(r.offset+r.length>bytes.length)throw new Error('EXIF_OFFSET_OUT_OF_BOUNDS');joined.set(bytes.subarray(r.offset,r.offset+r.length),p);p+=r.length;}
    items[key]=joined;
  }
  return parseLocated(bytes,located,{items,limits});
}
