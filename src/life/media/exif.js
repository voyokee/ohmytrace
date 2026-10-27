import {MEDIA_LIMITS} from './config.js';
import {locateMetadata,parseLocated} from './formats/index.js';
import {walkJpeg} from './formats/containers.js';
export {extractCaptureTime} from './time.js';

const hex=buffer=>[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');
const errorResult=(format,mediaType,message)=>({format,mediaType,metadataSources:[],metadataStatus:'error',extractedTime:null,mediaCreatedTime:null,gpsTime:null,
  coordinates:null,altitude:null,orientation:null,dimensions:null,rawTags:{},diagnostics:[message,'NO_CAPTURE_TIME','NO_GPS']});

/** Whole-buffer JPEG parse kept for callers that already hold the bytes. */
export function parseJpegExif(input,limits=MEDIA_LIMITS) {
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length<2||bytes[0]!==0xff||bytes[1]!==0xd8)throw new Error('NOT_JPEG');
  let container;try{container=walkJpeg(bytes,limits);}catch(error){return errorResult('jpeg','image',error.message);}
  return parseLocated(bytes,{format:'jpeg',mediaType:'image',container},{limits});
}

async function readRange(file,offset,length){return new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());}
const needsMore=(result,located)=>located?.container?.truncated&&!result.metadataSources.length||result.diagnostics.some(d=>/OUT_OF_BOUNDS|TRUNCATED/.test(d));

/**
 * Reads only a bounded header (plus HEIF metadata items and a small tail for
 * identity). Pixels are never decoded and large originals are never loaded whole.
 */
export async function readPhotoMetadata(file,limits=MEDIA_LIMITS) {
  let head=await readRange(file,0,Math.min(file.size,limits.sampleBytes)),located,result;
  for(let attempt=0;attempt<2;attempt++){
    try{
      located=locateMetadata(head,{name:file.name||'',size:file.size,limits});
      const items={};
      for(const key of ['exif','xmp']){
        const ranges=located.container?.[key+'Item'];if(!ranges)continue;
        const total=ranges.reduce((n,r)=>n+r.length,0);if(!ranges.every(r=>r.length>0)||total>limits.maxHeaderBytes)throw new Error('HEIF_ITEM_SIZE');
        const parts=await Promise.all(ranges.map(r=>r.offset+r.length<=head.length?head.subarray(r.offset,r.offset+r.length):readRange(file,r.offset,r.length)));
        if(parts.some((p,i)=>p.length!==ranges[i].length))throw new Error('EXIF_OFFSET_OUT_OF_BOUNDS');
        const joined=new Uint8Array(total);let p=0;for(const part of parts){joined.set(part,p);p+=part.length;}items[key]=joined;
      }
      result=parseLocated(head,located,{items,limits});
    }catch(error){result=errorResult(located?.format||'unknown',located?.mediaType||'unknown',error.message);}
    if(attempt===0&&head.length<file.size&&head.length<limits.maxHeaderBytes&&needsMore(result,located)){head=await readRange(file,0,Math.min(file.size,limits.maxHeaderBytes));continue;}
    break;
  }
  return {head,result};
}

/**
 * Identity: small files use the full-content SHA-256 (identical to manifest v1).
 * Larger files hash size + header + tail samples so 10k-photo imports never read
 * every original in full; legacy full-hash assets are re-matched by the scanner.
 */
async function identity(file,head,limits) {
  if(file.size<=limits.sampleBytes+limits.tailSampleBytes){
    const bytes=head.length===file.size?head:await readRange(file,0,file.size);
    return {key:hex(await crypto.subtle.digest('SHA-256',bytes)),identity:'content-sha256'};
  }
  const tail=await readRange(file,file.size-limits.tailSampleBytes,limits.tailSampleBytes),sample=head.subarray(0,limits.sampleBytes);
  const label=new TextEncoder().encode(`ohmytrace-sample-v2:${file.size}:`),joined=new Uint8Array(label.length+sample.length+tail.length);
  joined.set(label);joined.set(sample,label.length);joined.set(tail,label.length+sample.length);
  return {key:hex(await crypto.subtle.digest('SHA-256',joined)),identity:'sampled-sha256-v2'};
}

export async function analyzePhotoFile(file,{limits=MEDIA_LIMITS,companion=null}={}) {
  const originalFile={name:file.name||'未命名',type:file.type||'',size:file.size,lastModified:file.lastModified??null};
  if(file.size>limits.maxFileBytes)return {assetId:`diagnostic_${crypto.randomUUID()}`,deduplicationKey:null,originalFile,
    processingStatus:'oversize',metadataStatus:'unsupported',extractedTime:null,coordinates:null,orientation:null,altitude:null,rawTags:{},metadataEvidence:{state:'unknown',source:{kind:'file-diagnostic',reason:'FILE_SIZE_LIMIT'}},diagnostics:['FILE_SIZE_LIMIT'],linkedMemoryId:null,thumbnailReference:null};
  const {head,result:metadata}=await readPhotoMetadata(file,limits),id=await identity(file,head,limits);
  if(metadata.mediaType==='video')metadata.diagnostics=[companion==='live-photo'?'LIVE_PHOTO_COMPANION':'VIDEO_DEFERRED','NO_CAPTURE_TIME','NO_GPS'];
  const processingStatus=metadata.mediaType==='video'?'deferred':metadata.metadataStatus==='error'?'error':metadata.metadataStatus==='unsupported'?'unsupported':'analyzed';
  return {assetId:`asset_${id.key}`,deduplicationKey:id.key,identity:id.identity,originalFile,...metadata,processingStatus,
    metadataEvidence:{state:metadata.metadataStatus==='parsed'?'observed':'unknown',source:{kind:metadata.metadataSources.includes('exif')?'local-exif':metadata.metadataSources.includes('xmp')?'local-xmp':'local-file',rawTags:metadata.rawTags}},linkedMemoryId:null,thumbnailReference:null};
}
