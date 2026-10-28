import {AUTO_VERSION,applyAutoImport,nameCells,normalizeObservation,removeLegacyPhotoData,placeRenames,applyPlaceRenames,autoImportOutdated,savedPhotoObservations} from '../life/media/auto-import.js';
import {geoNameProvider} from '../life/geocoding/provider.js';
import {NativeScanStore} from './native-scan-store.js';

export const androidPointer=uri=>{const m=/^android-media:([^/]+)\/([1-9][0-9]{0,18})$/.exec(uri||'');return m?{volume:m[1],id:m[2]}:null;};

/** Reads the whole album natively, then saves straight to the map: no review, no copies. */
export class AndroidAutoImport {
  constructor(repository,capability,{geonames=geoNameProvider,store=new NativeScanStore(),pageSize=400}={}){this.repository=repository;this.capability=capability;this.geonames=geonames;this.store=store;this.pageSize=pageSize;this.running=false;this.controller=null;}
  cancel(){this.controller?.abort();}
  /** Results of the earlier review-based import are regrouped on the next run. */
  hasLegacy(){const d=this.repository.getDataset(),legacy=new Set(d.evidence.filter(e=>e.source?.kind==='photo-review').map(e=>e.id));return d.memories.some(m=>m.kind==='photo'&&m.uri?.startsWith('media:')&&m.evidenceIds.some(id=>legacy.has(id))); }
  hasImported(){return this.repository.getDataset().memories.some(m=>m.uri?.startsWith('android-media:'));}
  /** Saved results were grouped by older rules and are rebuilt from a full read on the next run. */
  outdated(){return autoImportOutdated(this.repository.getDataset());}
  /** Renames imported places after the offline names change (English to Chinese); returns the count. */
  async localize(){
    if(this.running||!this.hasImported())return 0;
    const renames=await placeRenames(this.repository.getDataset(),this.geonames);
    if(renames.size&&!this.running)await this.repository.update(d=>{applyPlaceRenames(d,renames);});
    return renames.size;
  }
  /** Recompute saved automatic results without album access or loss of photo pointers. */
  async regroup({onProgress=()=>{}}={}){
    if(this.running)throw new Error('正在导入');
    this.running=true;this.controller=new AbortController();const {signal}=this.controller;
    try{
      const data=this.repository.getDataset(),rows=savedPhotoObservations(data);
      onProgress({phase:'placing',scanned:rows.length,total:rows.length});
      const names=await nameCells(rows.map(normalizeObservation).filter(Boolean),this.geonames,{signal});signal.throwIfAborted();
      let summary;
      await this.repository.update(d=>{if(d.revision!==data.revision)throw new Error('记录已变化，请重新整理');summary=applyAutoImport(d,rows,names,{force:true});});
      return {...summary,regrouped:true,scanned:rows.length};
    }finally{this.running=false;this.controller=null;}
  }
  async run({onProgress=()=>{}}={}){
    if(this.running)throw new Error('正在导入');
    this.running=true;this.controller=new AbortController();const {signal}=this.controller;
    try{
      await this.capability.ensureLocationAccess();
      // The checkpoint only skips rows already saved; after clearing data everything is read again.
      const outdated=this.outdated(),savedCheckpoint=this.hasImported()?await this.store.get('auto-checkpoint'):null;
      // Old versions discarded unnamed coastal photos. Re-read their pointers on
      // the first scan after an upgrade, even if saved observations were regrouped.
      const since=savedCheckpoint?.version===AUTO_VERSION?savedCheckpoint.checkpoint:null,rows=[];
      let cursor=null,total=null,scanned=0,checkpoint=null;
      do{
        const page=await this.capability.locate({cursor,since,pageSize:this.pageSize},{signal});
        if(Number.isInteger(page.total))total=page.total;scanned+=page.scanned;checkpoint=page.checkpoint;cursor=page.cursor;
        for(const [volume,id,latitude,longitude,local,offsetMinutes,takenMs] of page.located)rows.push({uri:`android-media:${volume}/${id}`,latitude,longitude,local,offsetMinutes,takenMs});
        onProgress({phase:'reading',scanned,total});
      }while(cursor);
      const known=new Set(this.repository.getDataset().memories.map(m=>m.uri)),fresh=rows.filter(r=>!known.has(r.uri));
      onProgress({phase:'placing',scanned,total});
      const naming=outdated?[...savedPhotoObservations(this.repository.getDataset()),...fresh]:fresh;
      const names=await nameCells(naming.map(normalizeObservation).filter(Boolean),this.geonames,{signal});
      let summary={photos:0,newTrips:0,newPlaces:0,tripIds:[],latestTripId:null};
      const legacy=this.hasLegacy(),renames=outdated?new Map():await placeRenames(this.repository.getDataset(),this.geonames);
      signal.throwIfAborted();
      if(fresh.length||legacy||outdated||renames.size)await this.repository.update(d=>{applyPlaceRenames(d,renames);if(legacy)removeLegacyPhotoData(d);summary=applyAutoImport(d,fresh,names,{force:outdated});});
      if(checkpoint)await this.store.put('auto-checkpoint',{version:AUTO_VERSION,checkpoint});
      return {...summary,scanned};
    }finally{this.running=false;this.controller=null;}
  }
}
