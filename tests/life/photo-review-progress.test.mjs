import test from 'node:test';
import assert from 'node:assert/strict';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';
import {PhotoHistoryService} from '../../src/life/media/integration.js';
import {analyzePhotoFile} from '../../src/life/media/exif.js';
import {photoFile} from './photo-fixtures.mjs';

async function setup(count,geonames){
  const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
  const manifest=new MemoryManifest(),template=await analyzePhotoFile(photoFile()),assets=Array.from({length:count},(_,i)=>{const key=(i+1).toString(16).padStart(64,'0');return {...template,assetId:'asset_'+key,deduplicationKey:key,coordinates:{latitude:i%2?35:30,longitude:120},originalFile:{...template.originalFile,name:`phone-${i}.jpg`}};});
  const batch=await manifest.createBatch(assets.map(a=>a.originalFile));batch.assetIds=assets.map(a=>a.assetId);batch.processed=count;batch.status='review';await manifest.saveChunk(batch,assets);
  return {manifest,batch,service:new PhotoHistoryService(repository,{manifest,geonames})};
}

test('6666 scanned photos still reach a durable review when a name-pack lookup never settles',async()=>{
  const env=await setup(6666,{reverse:()=>new Promise(()=>{})}),progress=[];
  let timer;const result=await Promise.race([env.service.createReview(env.batch.id,{namingTimeoutMs:10,namingBudgetMs:40,onProgress:p=>progress.push(p)}).then(review=>({review})),new Promise(resolve=>{timer=setTimeout(()=>resolve({hung:true}),1000);})]);clearTimeout(timer);
  assert.equal(result.hung,undefined,'completed photo scan must not hang forever on optional place naming');
  const visits=result.review.candidates.flatMap(c=>c.visits);assert.equal(visits.length,6666);assert.ok(visits.every(v=>v.coordinates&&v.namingDiagnostic));
  assert.ok(progress.some(p=>p.phase==='naming'));assert.equal(progress.at(-1).phase,'ready');
  assert.equal((await env.manifest.getBatch(env.batch.id)).review.candidates[0].visits.length,6666);
});

test('review draft is saved before optional names, exact repeated coordinates share lookups and progress yields',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve),calls=[];const env=await setup(20,{reverse:async point=>{calls.push(point);await gate;return {displayName:`city-${point.latitude}`,state:'inferred'};}});
  const progress=[],work=env.service.createReview(env.batch.id,{namingTimeoutMs:500,onProgress:p=>progress.push(p)});await new Promise(r=>setTimeout(r,25));
  assert.ok((await env.manifest.getBatch(env.batch.id)).review,'coordinates and grouping must be recoverable while naming is in flight');release();const review=await work;
  assert.equal(calls.length,2,'same exact point is looked up once within a review');assert.ok(review.candidates.flatMap(c=>c.visits).every(v=>v.geoName));assert.equal(progress.at(-1).phase,'ready');
});
