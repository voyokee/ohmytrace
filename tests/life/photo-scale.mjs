// Scale run for the full local pipeline: scan → review → dry run → one commit.
// Usage: node tests/life/photo-scale.mjs [count=10000]. Prints JSON metrics.
// Files are generated JPEG/HEIC fixtures (not a real photo library); 20% carry
// no GPS, so they are filtered and reported rather than placed on the map.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {LifeRepository,MemoryStore} from '../../src/life/repository.js';
import {MemoryManifest} from '../../src/life/media/manifest.js';import {PhotoScanner} from '../../src/life/media/scanner.js';
import {GeoNameProvider} from '../../src/life/geocoding/provider.js';
import {OfflineAdminResolver} from '../../src/life/geocoding/offline-admin-resolver.js';
import {PlaceNameCache} from '../../src/life/geocoding/place-name-cache.js';
import {PhotoHistoryService} from '../../src/life/media/integration.js';import {photoJPEG} from './photo-fixtures.mjs';

const count=Number(process.argv[2]||10000),heic=readFileSync(new URL('./fixtures/photo-gps.heic',import.meta.url));
const pad=n=>String(n).padStart(2,'0'),files=[];
for(let i=0;i<count;i++){
  const day=new Date(Date.UTC(2015,0,1)+Math.floor(i/12)*86400000),stamp=`${day.getUTCFullYear()}:${pad(day.getUTCMonth()+1)}:${pad(day.getUTCDate())} ${pad(8+i%12)}:00:00`;
  // Mostly one home city, with a trip to another city every ~40 days.
  const away=Math.floor(i/12)%40>=37,lat=away?30.27+(i%5)*0.01:22.54+(i%7)*0.002,lon=away?120.15:114.05+(i%7)*0.002;
  const noGps=i%5===4;
  files.push(new File([photoJPEG({time:stamp,lat:noGps?null:lat,lon:noGps?null:lon,nonce:i})],`IMG_${i}.jpg`,{type:'image/jpeg',lastModified:i}));
}
files.push(new File([heic],'IMG_HEIC.heic',{type:'image/heic',lastModified:1}),new File([new Uint8Array([0,0,0,20,...new TextEncoder().encode('ftypqt  '),0,0,0,0,...new TextEncoder().encode('qt  ')])],'IMG_HEIC.MOV',{lastModified:1}));

const repository=new LifeRepository(new MemoryStore());await repository.initialize({legacyStorage:null});
const manifest=new MemoryManifest(),scanner=new PhotoScanner(manifest,{workerFactory:null}),service=new PhotoHistoryService(repository,{manifest,scanner,geonames:new GeoNameProvider({offline:new OfflineAdminResolver({load:async path=>JSON.parse(readFileSync(new URL('../../src/life/geocoding/data/'+path,import.meta.url),'utf8'))}),cache:new PlaceNameCache({storage:null})})});
const t=()=>performance.now(),m={count:files.length};let s=t();
const batch=await scanner.scan(files);m.scanMs=Math.round(t()-s);
s=t();const review=await service.createReview(batch.id);m.reviewMs=Math.round(t()-s);m.candidates=review.candidates.length;m.namedVisits=review.candidates.flatMap(c=>c.visits).filter(v=>v.geoName).length;m.namingSource='Natural Earth v5.1.2 offline packs';
m.filteredNoGps=review.unlocatedAssetIds.length;m.deferredVideo=(await service.assetsFor(batch)).filter(a=>a.processingStatus==='deferred').length;
s=t();const preview=await service.preview(batch.id);m.dryRunMs=Math.round(t()-s);
s=t();const result=await service.commit(batch.id,preview);m.commitMs=Math.round(t()-s);
const d=repository.getDataset();m.memories=d.memories.length;m.trips=d.trips.length;m.places=d.places.length;m.heapMiB=Math.round(process.memoryUsage().heapUsed/1048576);
assert.equal(result.warning,null);assert.equal(m.deferredVideo,1,'Live Photo motion file is a companion, not a visit');
assert.equal(d.memories.length,files.length-1-m.filteredNoGps,'only GPS photos become memories by default');
console.log(JSON.stringify(m));
