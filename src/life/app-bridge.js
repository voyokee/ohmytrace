import {COLLECTIONS,emptyDataset} from './schema.js';
import {LifeRepository,MemoryStore} from './repository.js';
import {migrateLegacy,importCSVInto,reconcileRows,updatePlace,datasetRows,exportLegacyCSV} from './legacy.js';
import {RendererAdapter} from './renderer-adapter.js';

export async function createLifeBridge({defaultCSV,sceneCSV}={}) {
  const repository=new LifeRepository(sceneCSV?new MemoryStore():undefined);
  await repository.initialize({...(sceneCSV?{legacyStorage:null}:{}),migrateLegacy});
  if(sceneCSV||repository.data.meta.origin==='new'&&repository.data.revision===0) {
    const demo=emptyDataset('demo');importCSVInto(demo,sceneCSV||defaultCSV,'replace');demo.meta.origin='demo';repository.data=demo;
  }
  const adapter=new RendererAdapter(repository);
  const requireWritable=()=>{if(sceneCSV)throw new Error('景观演示为临时预览，请返回首页保存个人数据');};
  return {repository,adapter,
    status(){const d=repository.getDataset();return sceneCSV?'景观演示 · 临时预览，请返回首页保存个人数据':d.meta.origin==='demo'?'虚构示例 · 尚未写入个人数据':d.meta.migration?.status==='complete'?'旧足迹已迁移 · 原始数据保留 · 保存在此浏览器':d.visits.length?'个人数据 · 保存在此浏览器':'个人数据为空 · 保存在此浏览器';},
    async importCSV(text,mode){requireWritable();return repository.update(d=>importCSVInto(d,text,mode));},
    async editRows(rows){requireWritable();return repository.update(d=>{reconcileRows(d,rows,{manual:true});d.meta.origin='user';});},
    async clear(){requireWritable();return repository.update(d=>{for(const key of COLLECTIONS)d[key]=[];d.meta.origin='user';});},
    async restore(text){requireWritable();return repository.restore(text);},
    editDraft(){return datasetRows(repository.getDataset());},
    async setPlace(id,location,manual=true){
      // Geocoding a fictional preview must not create a persisted user dataset.
      if(repository.data.meta.origin==='demo'){const d=repository.getDataset();updatePlace(d,id,location,{manual});repository.data=d;repository.notify();return;}
      return repository.update(d=>updatePlace(d,id,location,{manual}));
    },
    exportCSV(){return exportLegacyCSV(repository.getDataset());}
  };
}
