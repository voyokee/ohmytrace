import {applyAutoImport,nameCells,normalizeObservation} from '../life/media/auto-import.js';
import {geoNameProvider} from '../life/geocoding/provider.js';
import {NativeScanStore} from './native-scan-store.js';

export const androidPointer=uri=>{const m=/^android-media:([^/]+)\/([1-9][0-9]{0,18})$/.exec(uri||'');return m?{volume:m[1],id:m[2]}:null;};

/** Reads the whole album natively, then saves straight to the map: no review, no copies. */
export class AndroidAutoImport {
  constructor(repository,capability,{geonames=geoNameProvider,store=new NativeScanStore(),pageSize=400}={}){this.repository=repository;this.capability=capability;this.geonames=geonames;this.store=store;this.pageSize=pageSize;this.running=false;this.controller=null;}
  cancel(){this.controller?.abort();}
  hasImported(){return this.repository.getDataset().memories.some(m=>m.uri?.startsWith('android-media:'));}
  async run({onProgress=()=>{}}={}){
    if(this.running)throw new Error('正在导入');
    this.running=true;this.controller=new AbortController();const {signal}=this.controller;
    try{
      await this.capability.ensureLocationAccess();
      // The checkpoint only skips rows already saved; after clearing data everything is read again.
      const since=this.hasImported()?await this.store.get('auto-checkpoint'):null,rows=[];
      let cursor=null,total=null,scanned=0,checkpoint=null;
      do{
        const page=await this.capability.locate({cursor,since,pageSize:this.pageSize},{signal});
        if(Number.isInteger(page.total))total=page.total;scanned+=page.scanned;checkpoint=page.checkpoint;cursor=page.cursor;
        for(const [volume,id,latitude,longitude,local,offsetMinutes,takenMs] of page.located)rows.push({uri:`android-media:${volume}/${id}`,latitude,longitude,local,offsetMinutes,takenMs});
        onProgress({phase:'reading',scanned,total});
      }while(cursor);
      const known=new Set(this.repository.getDataset().memories.map(m=>m.uri)),fresh=rows.filter(r=>!known.has(r.uri));
      onProgress({phase:'placing',scanned,total});
      const names=await nameCells(fresh.map(normalizeObservation).filter(Boolean),this.geonames,{signal});
      let summary={photos:0,newTrips:0,newPlaces:0,tripIds:[],latestTripId:null};
      if(fresh.length)await this.repository.update(d=>{summary=applyAutoImport(d,fresh,names);});
      if(checkpoint)await this.store.put('auto-checkpoint',checkpoint);
      return {...summary,scanned};
    }finally{this.running=false;this.controller=null;}
  }
}
