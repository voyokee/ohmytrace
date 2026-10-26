import test from 'node:test';import assert from 'node:assert/strict';
import {parseJpegExif,extractCaptureTime,analyzePhotoFile} from '../../src/life/media/exif.js';
import {MemoryManifest,validateManifest} from '../../src/life/media/manifest.js';
import {PhotoScanner} from '../../src/life/media/scanner.js';
import {MEDIA_LIMITS} from '../../src/life/media/config.js';
import {photoJPEG,photoFile} from './photo-fixtures.mjs';

test('EXIF retains unzoned wall clock, explicit offset instant, original precision and invalid dates',()=>{
  const local=extractCaptureTime('2025:05:01 10:30:00');assert.equal(local.utcEpochMs,null);assert.equal(local.offsetMinutes,null);assert.equal(local.localDateTime,'2025-05-01T10:30:00');
  const zoned=extractCaptureTime('2025:05:01 10:30:00','+08:00','123');assert.equal(new Date(zoned.utcEpochMs).toISOString(),'2025-05-01T02:30:00.123Z');assert.equal(zoned.subsecondRaw,'123');
  assert.equal(extractCaptureTime('2025:02:29 10:00:00'),null);assert.equal(extractCaptureTime('2025:05:01 25:00:00'),null);
  assert.equal(extractCaptureTime('2025:05:01 10:00:00','+14:01').offsetMinutes,null);
});
test('both TIFF byte orders parse signed GPS, altitude, orientation and missing metadata',()=>{
  for(const little of [true,false]){
    const r=parseJpegExif(photoJPEG({little,lat:-33.85,lon:-179.9,altitude:-3,orientation:8}));
    assert.equal(r.metadataStatus,'parsed');assert.ok(Math.abs(r.coordinates.latitude+33.85)<1e-7);assert.ok(Math.abs(r.coordinates.longitude+179.9)<1e-7);
    assert.equal(r.altitude.metres,-3);assert.equal(r.orientation,8);assert.equal(r.rawTags.DateTimeOriginal,'2025:05:01 10:30:00');
  }
  const missing=parseJpegExif(photoJPEG({time:null,offset:null,lat:null,lon:null,altitude:null}));assert.equal(missing.coordinates,null);assert.equal(missing.extractedTime,null);assert.ok(missing.diagnostics.includes('NO_GPS'));
  const noExif=parseJpegExif(new Uint8Array([255,216,255,217]));assert.equal(noExif.metadataStatus,'missing');
});
test('malformed EXIF offsets, segments, excessive entries and zero denominators cannot fabricate locations',()=>{
  const broken=photoJPEG();new DataView(broken.buffer).setUint32(16,0xfffffff0,true);const result=parseJpegExif(broken);
  assert.equal(result.metadataStatus,'error');assert.equal(result.coordinates,null);assert.ok(result.diagnostics.includes('EXIF_OFFSET_OUT_OF_BOUNDS'));
  assert.equal(parseJpegExif(photoJPEG(),{...MEDIA_LIMITS,maxIfdEntries:1}).metadataStatus,'error');
  const zero=photoJPEG(),v=new DataView(zero.buffer),gps=v.getUint32(54,true),rational=v.getUint32(12+gps+22,true);v.setUint32(12+rational+4,0,true);
  assert.equal(parseJpegExif(zero).coordinates,null,'zero rational denominator is not a valid latitude');
  assert.throws(()=>parseJpegExif(new Uint8Array([1,2,3])),/NOT_JPEG/);
});
test('content hash deduplicates renamed files; unsupported and oversized formats remain diagnostic records',async()=>{
  const a=await analyzePhotoFile(photoFile({},'a.jpg')),b=await analyzePhotoFile(photoFile({},'b.jpeg'));
  assert.deepEqual(a.coordinates,{latitude:39.9,longitude:116.4});
  assert.deepEqual(a.dimensions,{width:64,height:48});
  assert.equal(a.assetId,b.assetId);assert.equal(a.originalFile.name,'a.jpg');assert.equal(a.metadataEvidence.state,'observed');
  const heic=await analyzePhotoFile(new File(['not a jpeg'],'a.heic',{type:'image/heic'}));assert.equal(heic.processingStatus,'unsupported');assert.equal(heic.coordinates,null);
  const huge=await analyzePhotoFile(photoFile(),{limits:{...MEDIA_LIMITS,maxFileBytes:1}});assert.equal(huge.processingStatus,'oversize');assert.equal(huge.deduplicationKey,null);
});
test('incremental scan, cancel and matching-file resume retain durable metadata without canonical writes',async()=>{
  const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null,limits:{...MEDIA_LIMITS,flushEvery:2}});
  const files=Array.from({length:5},(_,i)=>photoFile({nonce:i},`${i}.jpg`));
  const batch=await scanner.scan(files,{onProgress:p=>{if(p.processed===3)scanner.cancel();}});
  assert.equal(batch.status,'cancelled');assert.equal(batch.processed,3);assert.equal((await manifest.listAssets()).length,3);
  const resumed=await scanner.scan(files,{resumeBatchId:batch.id});assert.equal(resumed.status,'review');assert.equal(resumed.processed,5);
  assert.equal((await manifest.listAssets()).length,5);assert.equal(resumed.metrics.originalBytesPersisted,0);
  const duplicate=await scanner.scan(files);assert.equal(duplicate.duplicateCount,5);assert.equal((await manifest.listAssets()).length,5);
  const backup=await manifest.backup(),restored=new MemoryManifest();await restored.restore(backup);assert.deepEqual(await restored.backup(),backup);
  assert.throws(()=>validateManifest({...backup,version:99}));
});
test('failed chunk persistence never advances the durable resume cursor beyond saved assets',async()=>{
  const manifest=new MemoryManifest(),real=manifest.saveChunk.bind(manifest);let calls=0;
  manifest.saveChunk=async(...args)=>{if(++calls===2)throw new Error('quota');return real(...args);};
  const scanner=new PhotoScanner(manifest,{workerFactory:null,limits:{...MEDIA_LIMITS,flushEvery:2}}),files=Array.from({length:5},(_,i)=>photoFile({nonce:i},`${i}.jpg`));
  await assert.rejects(scanner.scan(files),/quota/);const batch=(await manifest.listBatches())[0];
  assert.equal(batch.processed,2,'failed chunk cannot skip unsaved files on resume');assert.equal(batch.assetIds.length,2);
  manifest.saveChunk=real;await scanner.scan(files,{resumeBatchId:batch.id});assert.equal((await manifest.listAssets()).length,5);
});
test('invalid media backup cannot replace valid metadata with fabricated UTC semantics or malformed review',async()=>{
  const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null});await scanner.scan([photoFile({offset:null})]);const before=await manifest.backup(),bad=structuredClone(before);
  bad.assets[0].extractedTime.utcEpochMs=Date.now();await assert.rejects(manifest.restore(bad),/时间/);assert.deepEqual(await manifest.backup(),before);
  const malformed=structuredClone(before);malformed.batches[0].review={version:1,candidates:[{}]};await assert.rejects(manifest.restore(malformed),/审核/);assert.deepEqual(await manifest.backup(),before);
});
