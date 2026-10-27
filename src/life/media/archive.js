// ZIP32 only. No filesystem extraction; all paths, sizes, CRCs and methods are
// checked before selected entries can become Files. ZIP64/encryption/symlinks fail closed.
export const ZIP_LIMITS=Object.freeze({archiveBytes:256*1024*1024,totalBytes:256*1024*1024,entryBytes:64*1024*1024,entries:20000,ratio:200});
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function safeArchivePath(path){return typeof path==='string'&&path.length<=512&&!/[\\\x00-\x1f:]/.test(path)&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'||!p);}
const bytes=async(blob,a,b)=>new Uint8Array(await blob.slice(a,b).arrayBuffer());
const abort=signal=>signal?.throwIfAborted();
export async function readZip(blob,{limits=ZIP_LIMITS,signal}={}){
  abort(signal);if(blob.size>limits.archiveBytes||blob.size<22)throw new Error('ZIP 容量超限或文件不完整');
  const tail=await bytes(blob,Math.max(0,blob.size-65557),blob.size),v=new DataView(tail.buffer);let end=-1;
  for(let p=tail.length-22;p>=0;p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===tail.length){end=p;break;}
  if(end<0)throw new Error('ZIP 目录缺失');
  const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),offset=v.getUint32(end+16,true),endAt=blob.size-tail.length+end;
  if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count||count===65535||count>limits.entries||offset+size!==endAt||size>8*1024*1024)throw new Error('ZIP 分卷、ZIP64 或目录超限');
  const dir=await bytes(blob,offset,offset+size),d=new DataView(dir.buffer),entries=[],names=new Set();let p=0,total=0;
  for(let i=0;i<count;i++){
    if(p+46>dir.length||d.getUint32(p,true)!==0x02014b50)throw new Error('ZIP 目录损坏');
    const flags=d.getUint16(p+8,true),method=d.getUint16(p+10,true),crc=d.getUint32(p+16,true),compressed=d.getUint32(p+20,true),uncompressed=d.getUint32(p+24,true),nl=d.getUint16(p+28,true),el=d.getUint16(p+30,true),cl=d.getUint16(p+32,true),local=d.getUint32(p+42,true),mode=d.getUint32(p+38,true)>>>16;
    if(p+46+nl+el+cl>dir.length)throw new Error('ZIP 文件名越界');
    const rawName=dir.slice(p+46,p+46+nl),name=new TextDecoder('utf-8',{fatal:true}).decode(rawName),folder=name.endsWith('/'),path=(folder?name.slice(0,-1):name).normalize('NFC');
    if(!safeArchivePath(path)||names.has(path)||flags&0x41||![0,8].includes(method)||(mode&0xf000)===0xa000||d.getUint16(p+34,true)||uncompressed>limits.entryBytes||uncompressed>Math.max(1,compressed)*limits.ratio||local+30+compressed>offset)throw new Error('ZIP 含不安全路径、重复文件、加密、链接或超限内容');
    names.add(path);total+=uncompressed;if(total>limits.totalBytes)throw new Error('ZIP 解包容量超过预算');
    if(!folder)entries.push({path,size:uncompressed,async read(){
      abort(signal);const h=await bytes(blob,local,local+30),lv=new DataView(h.buffer);if(lv.getUint32(0,true)!==0x04034b50||lv.getUint16(6,true)!==flags||lv.getUint16(8,true)!==method)throw new Error('ZIP 本地头不一致');
      const n=lv.getUint16(26,true),extra=lv.getUint16(28,true),start=local+30+n+extra;
      if(start+compressed>offset)throw new Error('ZIP 内容越界');const actual=await bytes(blob,local+30,local+30+n);
      if(actual.length!==rawName.length||actual.some((b,j)=>b!==rawName[j]))throw new Error('ZIP 路径不一致');
      let result;if(method===0){if(compressed!==uncompressed)throw new Error('ZIP 大小不一致');result=await bytes(blob,start,start+compressed);}
      else{
        let stream;try{stream=blob.slice(start,start+compressed).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('浏览器不支持此 ZIP 压缩方式，请先解压后选择文件夹');}
        const reader=stream.getReader(),parts=[];let length=0;
        try{while(true){abort(signal);const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>uncompressed)throw new Error('ZIP 实际解包容量超限');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
        result=new Uint8Array(length);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}
      }
      abort(signal);if(result.length!==uncompressed||crc32(result)!==crc)throw new Error('ZIP 文件完整性校验失败');return result;
    }});
    p+=46+nl+el+cl;
  }
  if(p!==dir.length)throw new Error('ZIP 目录长度不一致');return entries;
}
// Uncompressed output interoperates with native ZIP tools and needs no decoder.
export function writeZip(entries,{maxBytes=ZIP_LIMITS.totalBytes}={}){
  const encoder=new TextEncoder(),parts=[],directory=[],names=new Set();let offset=0,total=0;
  if(entries.length>ZIP_LIMITS.entries)throw new Error('ZIP 文件过多');
  const header=n=>{const b=new Uint8Array(n);return [b,new DataView(b.buffer)];};
  for(const [path,input]of entries){
    if(!safeArchivePath(path)||names.has(path))throw new Error('ZIP 路径无效');names.add(path);
    const content=typeof input==='string'?encoder.encode(input):input,name=encoder.encode(path);total+=content.length;if(total>maxBytes)throw new Error('ZIP 超过容量预算');
    const crc=crc32(content),[h,v]=header(30);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);v.setUint32(14,crc,true);v.setUint32(18,content.length,true);v.setUint32(22,content.length,true);v.setUint16(26,name.length,true);
    const [c,w]=header(46);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,2048,true);w.setUint32(16,crc,true);w.setUint32(20,content.length,true);w.setUint32(24,content.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);
    parts.push(h,name,content);directory.push(c,name);offset+=30+name.length+content.length;
  }
  const [e,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,directory.reduce((n,b)=>n+b.length,0),true);v.setUint32(16,offset,true);
  return new Blob([...parts,...directory,e],{type:'application/zip'});
}
