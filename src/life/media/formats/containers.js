import {MEDIA_LIMITS} from '../config.js';
import {readerFor} from './tiff.js';

// Container walkers. Each returns the raw EXIF/XMP payload locations it found
// plus container-level facts (dimensions, rotation). None decodes pixels.
const fourcc=(bytes,at)=>String.fromCharCode(bytes[at],bytes[at+1],bytes[at+2],bytes[at+3]);
const XMP_JPEG='http://ns.adobe.com/xap/1.0/\0';

function tiffAfterExifPrefix(bytes,start,end) {
  // Several writers prefix the TIFF header with "Exif\0\0" even where the spec omits it.
  if(end-start>=6&&fourcc(bytes,start)==='Exif'&&bytes[start+4]===0&&bytes[start+5]===0)return start+6;
  return start;
}

export function walkJpeg(bytes,limits=MEDIA_LIMITS) {
  const {view,ascii}=readerFor(bytes),out={exif:null,xmp:null,dimensions:null,diagnostics:[],truncated:false};
  if(bytes.length<2||view.getUint16(0)!==0xffd8)throw new Error('NOT_JPEG');
  let offset=2;
  while(offset<Math.min(bytes.length,limits.maxHeaderBytes)) {
    if(bytes[offset]!==0xff)throw new Error('JPEG_INVALID_MARKER');
    while(bytes[offset]===0xff)offset++;if(offset>=bytes.length){out.truncated=true;break;}const marker=bytes[offset++];
    if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;
    if(offset+2>bytes.length){out.truncated=true;break;}
    const length=view.getUint16(offset);if(length<2)throw new Error('JPEG_INVALID_SEGMENT');
    if(offset+length>bytes.length){out.truncated=true;break;}
    if(marker===0xe1&&!out.exif&&length>=8&&ascii(offset+2,6)==='Exif')out.exif={start:offset+8,end:offset+length};
    else if(marker===0xe1&&!out.xmp&&length>2+XMP_JPEG.length&&new TextDecoder('latin1').decode(bytes.subarray(offset+2,offset+2+XMP_JPEG.length))===XMP_JPEG)out.xmp=bytes.subarray(offset+2+XMP_JPEG.length,offset+length);
    if([0xc0,0xc1,0xc2].includes(marker)&&length>=7)out.dimensions={width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
    offset+=length;
  }
  if(offset>=limits.maxHeaderBytes&&!out.exif)out.diagnostics.push('HEADER_SCAN_LIMIT');
  return out;
}

/** ISO-BMFF (HEIF/HEIC/AVIF). Reads meta → iinf/iloc/iprp to locate the Exif and XMP items. */
export function walkHeif(bytes,limits=MEDIA_LIMITS) {
  const {view,ensure}=readerFor(bytes),out={exifItem:null,xmpItem:null,dimensions:null,rotation:null,diagnostics:[],brand:null};
  const boxes=(start,end,partial=false)=>{
    const list=[];let at=start,guard=0;
    while(at+8<=end){
      if(++guard>limits.maxIfdEntries)throw new Error('HEIF_BOX_LIMIT');
      let size=view.getUint32(at),header=8;const type=fourcc(bytes,at+4);
      if(size===1){ensure(at+8,8,end);const hi=view.getUint32(at+8),lo=view.getUint32(at+12);size=hi*2**32+lo;header=16;}
      else if(size===0)size=end-at;
      if(size<header)throw new Error('HEIF_BOX_BOUNDS');
      if(at+size>end){if(!partial)throw new Error('HEIF_BOX_BOUNDS');list.push({type,start:at,body:at+header,end:at+size,truncated:true});break;}
      list.push({type,start:at,body:at+header,end:at+size});at+=size;
    }
    return list;
  };
  const top=boxes(0,bytes.length,true),ftyp=top.find(b=>b.type==='ftyp');
  if(!ftyp)throw new Error('HEIF_NO_FTYP');out.brand=fourcc(bytes,ftyp.body);
  const meta=top.find(b=>b.type==='meta');
  if(!meta||meta.truncated){if(top.at(-1)?.truncated||meta?.truncated)throw new Error('HEADER_TRUNCATED');out.diagnostics.push('HEIF_NO_META');return out;}
  const children=boxes(meta.body+4,meta.end),child=t=>children.find(b=>b.type===t);
  const uint=(at,size)=>{if(size===0)return 0;ensure(at,size);if(size===2)return view.getUint16(at);if(size===4)return view.getUint32(at);if(size===8)return view.getUint32(at)*2**32+view.getUint32(at+4);throw new Error('HEIF_FIELD_SIZE');};
  const items=new Map(),iinf=child('iinf');
  if(iinf){
    const version=bytes[iinf.body];let at=iinf.body+4;const count=version===0?uint(at,2):uint(at,4);at+=version===0?2:4;
    if(count>limits.maxIfdEntries*8)throw new Error('HEIF_ITEM_LIMIT');
    for(const infe of boxes(at,iinf.end).filter(b=>b.type==='infe')){
      const v=bytes[infe.body];if(v<2)continue;let p=infe.body+4;
      const id=v===2?uint(p,2):uint(p,4);p+=v===2?2:4;p+=2;ensure(p,4,infe.end);const type=fourcc(bytes,p);p+=4;
      const zero=bytes.indexOf(0,p);const name=zero<0||zero>=infe.end?infe.end:zero;let contentType=null;
      if(type==='mime'&&name<infe.end){const z=bytes.indexOf(0,name+1);contentType=new TextDecoder().decode(bytes.subarray(name+1,z<0||z>infe.end?infe.end:z));}
      items.set(id,{type,contentType});
    }
  }
  const iloc=child('iloc'),idat=child('idat');
  if(iloc){
    const version=bytes[iloc.body];let at=iloc.body+4;ensure(at,2,iloc.end);
    const sizes=view.getUint16(at);at+=2;const offsetSize=sizes>>12,lengthSize=sizes>>8&15,baseSize=sizes>>4&15,indexSize=version>0?sizes&15:0;
    const count=version<2?uint(at,2):uint(at,4);at+=version<2?2:4;
    for(let i=0;i<count;i++){
      const id=version<2?uint(at,2):uint(at,4);at+=version<2?2:4;let method=0;
      if(version>0){method=uint(at,2)&15;at+=2;}
      at+=2;const base=uint(at,baseSize);at+=baseSize;const extents=uint(at,2);at+=2;const ranges=[];
      if(extents>64)throw new Error('HEIF_EXTENT_LIMIT');
      for(let e=0;e<extents;e++){at+=indexSize;const offset=uint(at,offsetSize);at+=offsetSize;const length=uint(at,lengthSize);at+=lengthSize;ranges.push({offset:base+offset,length});}
      const item=items.get(id);if(item){item.method=method;item.ranges=ranges;}
    }
  }
  // Item bytes may lie beyond the sampled header; report absolute ranges and let
  // the caller read exactly those bytes instead of loading the whole file.
  const located=item=>{
    if(!item?.ranges?.length)return null;
    const origin=item.method===1?idat?.body:item.method===0?0:null;if(origin===null||origin===undefined)throw new Error('HEIF_CONSTRUCTION_METHOD');
    if(item.ranges.length>16)throw new Error('HEIF_EXTENT_LIMIT');
    return item.ranges.map(r=>({offset:origin+r.offset,length:r.length}));
  };
  for(const item of items.values()){
    if(item.type==='Exif'&&!out.exifItem)out.exifItem=located(item);
    if(item.type==='mime'&&/rdf\+xml|xmp/i.test(item.contentType||'')&&!out.xmpItem)out.xmpItem=located(item);
  }
  // Primary item dimensions (ispe) and rotation (irot) from the property associations.
  const pitm=child('pitm'),iprp=child('iprp');
  if(pitm&&iprp){
    const primary=bytes[pitm.body]===0?uint(pitm.body+4,2):uint(pitm.body+4,4);
    const parts=boxes(iprp.body,iprp.end),ipco=parts.find(b=>b.type==='ipco'),props=ipco?boxes(ipco.body,ipco.end):[];
    for(const ipma of parts.filter(b=>b.type==='ipma')){
      const version=bytes[ipma.body],flags=bytes[ipma.body+3];let at=ipma.body+4;const count=uint(at,4);at+=4;
      for(let i=0;i<count&&at<ipma.end;i++){
        const id=version<1?uint(at,2):uint(at,4);at+=version<1?2:4;const n=bytes[at++];
        for(let j=0;j<n;j++){
          const index=(flags&1?uint(at,2)&0x7fff:bytes[at]&0x7f);at+=flags&1?2:1;
          if(id!==primary||!index)continue;const prop=props[index-1];if(!prop)continue;
          if(prop.type==='ispe'){const w=uint(prop.body+4,4),h=uint(prop.body+8,4);if(w&&h)out.dimensions={width:w,height:h};}
          if(prop.type==='irot')out.rotation=(bytes[prop.body]&3)*90;
        }
      }
    }
  }
  return out;
}

export function walkPng(bytes,limits=MEDIA_LIMITS) {
  const {view}=readerFor(bytes),out={exif:null,xmp:null,dimensions:null,modified:null,diagnostics:[],truncated:false};
  let at=8,guard=0;
  while(at+12<=bytes.length){
    if(++guard>limits.maxIfdEntries*4)throw new Error('PNG_CHUNK_LIMIT');
    const length=view.getUint32(at),type=fourcc(bytes,at+4),body=at+8;
    if(body+length+4>bytes.length){if(['eXIf','iTXt','tEXt','zTXt'].includes(type))out.truncated=true;if(type!=='IDAT')break;at=body+length+4;continue;}
    if(type==='IHDR'&&length>=8)out.dimensions={width:view.getUint32(body),height:view.getUint32(body+4)};
    if(type==='eXIf'&&!out.exif)out.exif={start:tiffAfterExifPrefix(bytes,body,body+length),end:body+length};
    if(type==='iTXt'&&!out.xmp){
      const key=bytes.indexOf(0,body);
      if(key>0&&key<body+length&&new TextDecoder('latin1').decode(bytes.subarray(body,key))==='XML:com.adobe.xmp'){
        if(bytes[key+1]!==0)out.diagnostics.push('PNG_XMP_COMPRESSED');
        else{let p=key+3;for(let z=0;z<2;z++){const n=bytes.indexOf(0,p);p=n<0?body+length:n+1;}out.xmp=bytes.subarray(Math.min(p,body+length),body+length);}
      }
    }
    if((type==='tEXt'||type==='zTXt')&&!out.exif){
      const key=bytes.indexOf(0,body);
      if(key>0&&key<body+length&&/^Raw profile type (exif|APP1)$/.test(new TextDecoder('latin1').decode(bytes.subarray(body,key)))){
        if(type==='zTXt')out.diagnostics.push('PNG_EXIF_TEXT_COMPRESSED');
        else{const hex=new TextDecoder('latin1').decode(bytes.subarray(key+1,body+length)).split('\n').slice(3).join('').replace(/\s+/g,'');
          if(/^[0-9a-f]*$/i.test(hex)&&hex.length%2===0&&hex.length/2<=limits.maxHeaderBytes){const data=new Uint8Array(hex.length/2);for(let i=0;i<data.length;i++)data[i]=parseInt(hex.slice(i*2,i*2+2),16);out.exif={bytes:data,start:tiffAfterExifPrefix(data,0,data.length),end:data.length};}}
      }
    }
    if(type==='tIME'&&length===7){const y=view.getUint16(body),[mo,d,h,mi,s]=bytes.subarray(body+2,body+7);out.modified={raw:[y,mo,d,h,mi,s].join(','),utcEpochMs:Date.UTC(y,mo-1,d,h,mi,s),source:'png-tIME'};}
    if(type==='IEND')break;
    at=body+length+4;
  }
  return out;
}

export function walkWebp(bytes,limits=MEDIA_LIMITS) {
  const {view,ensure}=readerFor(bytes),out={exif:null,xmp:null,dimensions:null,diagnostics:[],truncated:false};
  ensure(0,12);const end=Math.min(bytes.length,8+view.getUint32(4,true));let at=12,guard=0;
  while(at+8<=end){
    if(++guard>limits.maxIfdEntries)throw new Error('WEBP_CHUNK_LIMIT');
    const type=fourcc(bytes,at),length=view.getUint32(at+4,true),body=at+8;
    if(body+length>end){if(['EXIF','XMP '].includes(type))out.truncated=true;break;}
    if(type==='VP8X'&&length>=10)out.dimensions={width:(bytes[body+4]|bytes[body+5]<<8|bytes[body+6]<<16)+1,height:(bytes[body+7]|bytes[body+8]<<8|bytes[body+9]<<16)+1};
    if(type==='VP8 '&&length>=10&&!out.dimensions)out.dimensions={width:view.getUint16(body+6,true)&0x3fff,height:view.getUint16(body+8,true)&0x3fff};
    if(type==='VP8L'&&length>=5&&!out.dimensions){const b=view.getUint32(body+1,true);out.dimensions={width:(b&0x3fff)+1,height:(b>>14&0x3fff)+1};}
    if(type==='EXIF'&&!out.exif)out.exif={start:tiffAfterExifPrefix(bytes,body,body+length),end:body+length};
    if(type==='XMP '&&!out.xmp)out.xmp=bytes.subarray(body,body+length);
    at=body+length+(length&1);
  }
  return out;
}
