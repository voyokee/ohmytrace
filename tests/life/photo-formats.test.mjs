import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {analyzePhotoFile} from '../../src/life/media/exif.js';
import {parseMediaBytes,sniffFormat} from '../../src/life/media/formats/index.js';
import {parseXmp,xmpCoordinate} from '../../src/life/media/formats/xmp.js';
import {extractIsoTime} from '../../src/life/media/time.js';
import {MemoryManifest,validateManifest} from '../../src/life/media/manifest.js';
import {PhotoScanner,livePhotoCompanions} from '../../src/life/media/scanner.js';
import {MEDIA_LIMITS} from '../../src/life/media/config.js';
import {photoJPEG,photoFile} from './photo-fixtures.mjs';

// HEIC and PNG fixtures were encoded by macOS ImageIO (`sips`) from the generated
// EXIF JPEG fixture (30.2741 N, 120.1551 E, 2025:05:01 10:30:00 +08:00, orientation 6).
const fixture=name=>new Uint8Array(readFileSync(new URL(`./fixtures/${name}`,import.meta.url)));
const near=(a,b)=>Math.abs(a-b)<1e-6;
const tiffOf=jpeg=>jpeg.subarray(12,4+(jpeg[4]<<8|jpeg[5]));
const chunk=(type,body)=>{const pad=body.length&1,out=new Uint8Array(8+body.length+pad);out.set(new TextEncoder().encode(type));new DataView(out.buffer).setUint32(4,body.length,true);out.set(body,8);return out;};
function webp(parts){
  const vp8x=new Uint8Array(10);vp8x[4]=63;vp8x[7]=47;const body=[new TextEncoder().encode('WEBP'),chunk('VP8X',vp8x),...parts];
  const size=body.reduce((n,b)=>n+b.length,0),out=new Uint8Array(8+size);out.set(new TextEncoder().encode('RIFF'));new DataView(out.buffer).setUint32(4,size,true);
  let p=8;for(const b of body){out.set(b,p);p+=b.length;}return out;
}
const XMP=`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description
  xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
  exif:GPSLatitude="31,14.1234N" exif:GPSLongitude="121,28.5W" exif:GPSAltitude="1234/10" exif:GPSAltitudeRef="0"
  photoshop:DateCreated="2024-12-31T23:59:30+09:00"/></rdf:RDF></x:xmpmeta>`;
function jpegWithXmp(xmp){
  const header=new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0'),body=new TextEncoder().encode(xmp),length=2+header.length+body.length;
  return new Uint8Array([0xff,0xd8,0xff,0xe1,length>>8,length&255,...header,...body,0xff,0xd9]);
}
function countingFile(bytes,name){
  const file=new File([bytes],name),slice=file.slice.bind(file);let read=0;
  file.slice=(a,b)=>{const part=slice(a,b),buffer=part.arrayBuffer.bind(part);part.arrayBuffer=async()=>{const r=await buffer();read+=r.byteLength;return r;};return part;};
  return {file,read:()=>read};
}

test('real HEIC and PNG containers yield the same observed GPS, zoned time and orientation as the source JPEG',()=>{
  for(const [name,format] of [['photo-gps.heic','heif'],['photo-gps.png','png']]){
    const r=parseMediaBytes(fixture(name),{name});
    assert.equal(r.format,format);assert.equal(r.metadataStatus,'parsed');assert.ok(r.metadataSources.includes('exif'),'ImageIO also writes XMP; EXIF stays authoritative');
    assert.ok(near(r.coordinates.latitude,30.2741)&&near(r.coordinates.longitude,120.1551),name);
    assert.equal(r.extractedTime.localDateTime,'2025-05-01T10:30:00');assert.equal(r.extractedTime.offsetMinutes,480);
    assert.equal(new Date(r.extractedTime.utcEpochMs).toISOString(),'2025-05-01T02:30:00.000Z');assert.equal(r.orientation,6);assert.deepEqual(r.dimensions,{width:64,height:48});
  }
});
test('format is decided by signature, not extension: a renamed JPEG and a fake .heic are handled by content',async()=>{
  const renamed=await analyzePhotoFile(new File([photoJPEG()],'IMG_1.HEIC'));assert.equal(renamed.format,'jpeg');assert.ok(renamed.coordinates);
  const fake=await analyzePhotoFile(new File(['not an image'],'IMG_2.heic'));assert.equal(fake.processingStatus,'unsupported');assert.equal(fake.coordinates,null);
  assert.equal(sniffFormat(fixture('photo-gps.heic')).format,'heif');
});
test('WebP EXIF and XMP chunks, plus JPEG XMP-only GPS, are read with explicit sources',()=>{
  const exif=parseMediaBytes(webp([chunk('EXIF',tiffOf(photoJPEG({lat:-33.86,lon:151.21})))]));
  assert.equal(exif.format,'webp');assert.ok(near(exif.coordinates.latitude,-33.86));assert.deepEqual(exif.dimensions,{width:64,height:48});
  const xmpOnly=parseMediaBytes(webp([chunk('XMP ',new TextEncoder().encode(XMP))]));
  assert.deepEqual(xmpOnly.metadataSources,['xmp']);assert.ok(near(xmpOnly.coordinates.latitude,31+14.1234/60));assert.ok(near(xmpOnly.coordinates.longitude,-(121+28.5/60)));
  assert.equal(xmpOnly.altitude.metres,123.4);assert.equal(xmpOnly.extractedTime.source,'xmp-photoshop');assert.equal(new Date(xmpOnly.extractedTime.utcEpochMs).toISOString(),'2024-12-31T14:59:30.000Z');
  const jpeg=parseMediaBytes(jpegWithXmp(XMP));assert.equal(jpeg.format,'jpeg');assert.deepEqual(jpeg.metadataSources,['xmp']);assert.ok(jpeg.coordinates);
});
test('XMP times keep zone semantics; date-only and malformed values never become capture times',()=>{
  assert.equal(extractIsoTime('2024-06-01T08:00:00').timeBasis,'local-unzoned');assert.equal(extractIsoTime('2024-06-01T08:00:00').utcEpochMs,null);
  assert.equal(extractIsoTime('2024-06-01T08:00:00Z').offsetMinutes,0);assert.equal(extractIsoTime('2024-06-01T08:00:00.5-05:30').offsetMinutes,-330);
  assert.equal(extractIsoTime('2024-06-01'),null);assert.equal(extractIsoTime('2024-02-30T08:00:00'),null);assert.equal(extractIsoTime('2024-06-01T08:00:00+15:00'),null);
  assert.equal(xmpCoordinate('91,0N','N','S',90),null);assert.equal(xmpCoordinate('31,61N','N','S',90),null);assert.equal(xmpCoordinate('31,0E','N','S',90),null);
});
test('GPS that is 0,0 or explicitly not WGS84 is reported, never placed on the map',()=>{
  assert.equal(parseMediaBytes(photoJPEG({lat:0,lon:0})).coordinates,null);assert.ok(parseMediaBytes(photoJPEG({lat:0,lon:0})).diagnostics.includes('GPS_NULL_ISLAND'));
  const tokyo=parseXmp(XMP.replace('exif:GPSAltitude=','exif:GPSMapDatum="TOKYO" exif:GPSAltitude='));assert.equal(tokyo.coordinates,null);assert.ok(tokyo.diagnostics.includes('GPS_DATUM_NOT_WGS84'));
});
test('videos are deferred and a Live Photo motion file is paired with its still, not counted as a visit',async()=>{
  const mov=new Uint8Array([0,0,0,20,...new TextEncoder().encode('ftypqt  '),0,0,0,0,...new TextEncoder().encode('qt  ')]);
  assert.deepEqual(livePhotoCompanions([{name:'IMG_7.HEIC'},{name:'IMG_7.MOV'},{name:'clip.mp4'}]),[null,'live-photo',null]);
  const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null});
  const batch=await scanner.scan([new File([fixture('photo-gps.heic')],'IMG_7.HEIC'),new File([mov],'IMG_7.MOV'),new File([new Uint8Array([...mov,0,0,0,8,102,114,101,101])],'clip.mov')]);
  const assets=await manifest.listAssets();assert.equal(batch.failureCount,0);
  assert.deepEqual(assets.map(a=>[a.originalFile.name,a.processingStatus]),[['IMG_7.HEIC','analyzed'],['IMG_7.MOV','deferred'],['clip.mov','deferred']]);
  assert.ok(assets[0].coordinates);assert.equal(assets[1].diagnostics[0],'LIVE_PHOTO_COMPANION');assert.equal(assets[2].diagnostics[0],'VIDEO_DEFERRED');
});
test('TIFF-based RAW reads EXIF GPS; other RAW containers are diagnosed instead of guessed',async()=>{
  const dng=await analyzePhotoFile(new File([tiffOf(photoJPEG({lat:46.5,lon:7.9}))],'DSC_1.DNG'));assert.equal(dng.format,'raw-tiff');assert.ok(near(dng.coordinates.latitude,46.5));
  const orf=await analyzePhotoFile(new File([new Uint8Array([0x49,0x49,0x52,0x4f,0,0,0,0])],'P1.ORF'));assert.equal(orf.processingStatus,'unsupported');assert.ok(orf.diagnostics.includes('RAW_METADATA_UNSUPPORTED'));
});
test('large originals are identified from bounded samples; metadata deeper than the sample is still found',async()=>{
  const padded=new Uint8Array(3*1024*1024),base=photoJPEG({lat:1.3,lon:103.8});padded.set(base);padded.fill(7,base.length);
  const big=countingFile(padded,'big.jpg'),a=await analyzePhotoFile(big.file);
  assert.equal(a.identity,'sampled-sha256-v2');assert.ok(big.read()<=MEDIA_LIMITS.sampleBytes+MEDIA_LIMITS.tailSampleBytes,`read ${big.read()} bytes`);assert.ok(near(a.coordinates.latitude,1.3));
  const renamed=await analyzePhotoFile(new File([padded],'copy.jpg'));assert.equal(renamed.assetId,a.assetId);
  const changed=padded.slice();changed[changed.length-1]=8;assert.notEqual((await analyzePhotoFile(new File([changed],'edit.jpg'))).assetId,a.assetId);
  // Two 64 KiB APP2 segments push EXIF past the first sample; the reader widens once, within maxHeaderBytes.
  const app2=new Uint8Array(65535+2);app2.set([0xff,0xe2,0xff,0xff]);const deep=new Uint8Array(2+app2.length*2+base.length-2+1024*1024);
  deep.set([0xff,0xd8]);deep.set(app2,2);deep.set(app2,2+app2.length);deep.set(base.subarray(2),2+app2.length*2);
  const d=countingFile(deep,'deep.jpg'),deepAsset=await analyzePhotoFile(d.file);assert.ok(near(deepAsset.coordinates.latitude,1.3));assert.ok(d.read()<=MEDIA_LIMITS.maxHeaderBytes+MEDIA_LIMITS.tailSampleBytes+MEDIA_LIMITS.sampleBytes);
});
test('re-importing a file first saved with a full-content hash reuses its asset instead of duplicating it',async()=>{
  const padded=new Uint8Array(512*1024),base=photoJPEG({lat:22.3,lon:114.2});padded.set(base);padded.fill(3,base.length);
  const manifest=new MemoryManifest(),legacyLimits={...MEDIA_LIMITS,sampleBytes:1024*1024};
  const old=await new PhotoScanner(manifest,{workerFactory:null,limits:legacyLimits}).scan([new File([padded],'IMG_9.jpg')]);
  const legacyId=old.assetIds[0];assert.equal((await manifest.getAsset(legacyId)).identity,'content-sha256');
  const again=await new PhotoScanner(manifest,{workerFactory:null}).scan([new File([padded],'IMG_9.jpg')]);
  assert.equal(again.duplicateCount,1);assert.deepEqual(again.assetIds,[legacyId]);assert.equal((await manifest.listAssets()).length,1);
});
test('manifest v2 validates XMP-sourced times and still restores v1 backups',async()=>{
  const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null});
  await scanner.scan([new File([jpegWithXmp(XMP)],'xmp.jpg'),photoFile()]);const backup=await manifest.backup();assert.equal(backup.version,2);
  assert.equal(backup.assets.find(a=>a.originalFile.name==='xmp.jpg').extractedTime.source,'xmp-photoshop');validateManifest(backup);
  const v1=structuredClone(backup);v1.version=1;v1.assets=v1.assets.filter(a=>a.originalFile.name!=='xmp.jpg');v1.batches.forEach(b=>{b.assetIds=b.assetIds.filter(id=>v1.assets.some(a=>a.assetId===id));});
  await new MemoryManifest().restore(v1);
  const forged=structuredClone(backup);forged.assets.find(a=>a.originalFile.name==='xmp.jpg').extractedTime.utcEpochMs+=3600000;await assert.rejects(new MemoryManifest().restore(forged),/时间/);
});
test('parallel extraction commits results in input order and keeps the resume cursor exact',async()=>{
  let active=0,peak=0;const delays=[30,1,20,1,10,1,5,1];
  const analyze=async(file,options)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,delays[+file.name[0]]));active--;return analyzePhotoFile(file,options);};
  const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null,analyze,concurrency:4,limits:{...MEDIA_LIMITS,flushEvery:3,filesPerJob:2}});
  const files=delays.map((_,i)=>photoFile({nonce:i},`${i}.jpg`)),order=[];
  const batch=await scanner.scan(files,{onProgress:p=>order.push(p.asset.originalFile.name)});
  assert.ok(peak>1,'files are analyzed concurrently');assert.deepEqual(order,files.map(f=>f.name));assert.equal(batch.processed,8);assert.equal(batch.assetIds.length,8);
});
