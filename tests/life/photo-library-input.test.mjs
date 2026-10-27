import test from 'node:test';import assert from 'node:assert/strict';import {deflateRawSync} from 'node:zlib';
import {writeZip,readZip,safeArchivePath,crc32} from '../../src/life/media/archive.js';
import {preparePhotoInput,WebPhotoCapability} from '../../src/platform/web-photo-capability.js';
import {photoObservation} from '../../src/life/media/observation.js';import {photoFile,photoJPEG} from './photo-fixtures.mjs';
import {analyzePhotoFile} from '../../src/life/media/exif.js';
test('ZIP imports selected nested photos, ignores sidecars and keeps stable bytes',async()=>{
 const zip=writeZip([['photos/手机.jpg',photoJPEG()],['__MACOSX/._a.jpg',new Uint8Array([1])],['photos/note.txt','sidecar']]);
 const files=await preparePhotoInput([new File([zip],'library.zip')]);assert.equal(files.length,1);assert.equal(files[0].name,'photos/手机.jpg');
 const asset=await analyzePhotoFile(files[0]);assert.equal(asset.coordinates.latitude,39.9);assert.equal(photoObservation(asset).gps.crs,'WGS84');
});
test('ZIP rejects traversal, drive paths, symlinks, duplicate names, forged size and CRC',async()=>{
 for(const p of ['../x','a/../../b','/x','C:/x','a\\b','a//b','a/./b','a\0b'])assert.equal(safeArchivePath(p),false);
 assert.throws(()=>writeZip([['../a','x']]));assert.throws(()=>writeZip([['a','x'],['a','y']]));
 const zip=writeZip([['a.jpg','image']]),raw=new Uint8Array(await zip.arrayBuffer());raw[35]^=1;
 const [e]=await readZip(new Blob([raw]));await assert.rejects(e.read(),/完整性/);
 const original=new Uint8Array(await zip.arrayBuffer()),v=new DataView(original.buffer),central=30+5+5;v.setUint32(central+38,0xa1ff0000,true);
 await assert.rejects(readZip(new Blob([original])),/不安全/);
 await assert.rejects(readZip(zip,{limits:{archiveBytes:1}}),/超限/);
});
test('deflate entries are bounded by actual output, support cancellation and detect truncation',async()=>{
 const content=new TextEncoder().encode('hello photo'),compressed=deflateRawSync(content),base=new Uint8Array(await writeZip([['a',content]]).arrayBuffer());
 const central=31+content.length,dir=base.slice(central,central+47),end=base.slice(-22),head=base.slice(0,31),h=new DataView(head.buffer),d=new DataView(dir.buffer),v=new DataView(end.buffer);
 h.setUint16(8,8,true);h.setUint32(18,compressed.length,true);d.setUint16(10,8,true);d.setUint32(20,compressed.length,true);v.setUint32(16,31+compressed.length,true);
 const zip=new Blob([head,compressed,dir,end]),[e]=await readZip(zip);assert.deepEqual(await e.read(),content);
 const c=new AbortController();c.abort();await assert.rejects(readZip(zip,{signal:c.signal}),{name:'AbortError'});assert.equal(crc32(content),h.getUint32(14,true));
});
test('Web capability only reads scoped user-selected files and releases access',async()=>{
 const cap=new WebPhotoCapability({select:async()=>[photoFile()]});assert.equal(await cap.permissionStatus(),'unknown');
 const groups=[];for await(const handles of cap.selectPhotos({operationId:'pick'}))groups.push(...handles);
 assert.equal(await cap.permissionStatus(),'limited');const m=await cap.readAssetMetadata(groups[0]);assert.equal(m.location.state,'authorized');assert.equal(m.observation.extractedTime.timeBasis,'offset-instant');
 await assert.rejects(cap.readAssetContent({...groups[0],scopeId:'wrong'}));await cap.releaseResources();await assert.rejects(cap.readAssetContent(groups[0]));
});
