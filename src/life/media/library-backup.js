import {clone,COLLECTIONS,validateDataset} from '../schema.js';
import {validateManifest} from './manifest.js';
import {writeZip,readZip} from './archive.js';
import {digest} from './thumbnail-store.js';
import {validateThumbnail} from './thumbnail.js';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
const indexKey=index=>JSON.stringify({assets:[...index.assets].sort((a,b)=>a.assetId.localeCompare(b.assetId)),batches:[...index.batches].sort((a,b)=>a.id.localeCompare(b.id))});
const graphKey=data=>JSON.stringify({...data,revision:0});
const empty=data=>data.revision===0&&['new','demo'].includes(data.meta.origin);
const photoIds=data=>data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('media:')).map(m=>m.uri.slice(6));
function relationships(data,index){const ids=new Set(index.assets.map(a=>a.assetId));if(photoIds(data).some(id=>!ids.has(id)))throw new Error('人生照片记忆缺少媒体索引，请先恢复对应媒体索引');}
function mergedGraph(current,incoming){
 if(empty(current))return clone(incoming);
 const next=clone(current),conflicts=[];
 for(const key of COLLECTIONS){const ids=new Map(next[key].map(row=>[row.id,row]));for(const row of incoming[key]){const old=ids.get(row.id);if(old&&JSON.stringify(old)!==JSON.stringify(row))conflicts.push({collection:key,id:row.id});else if(!old){next[key].push(clone(row));ids.set(row.id,row);}}}
 if(conflicts.length)return {conflicts};validateDataset(next);return next;
}
function mergedIndex(current,incoming){const next=clone(incoming);for(const key of ['assets','batches']){const field=key==='assets'?'assetId':'id',rows=new Map(next[key].map(r=>[r[field],r]));for(const row of current[key])rows.set(row[field],clone(row));next[key]=[...rows.values()];}validateManifest(next);return next;}
export class LibraryBackup {
 constructor({repository,manifest,thumbnails}){this.repository=repository;this.manifest=manifest;this.thumbnails=thumbnails;this.busy=false;}
 async locked(action){if(this.busy)throw new Error('备份或恢复正在进行');this.busy=true;try{return globalThis.navigator?.locks?await navigator.locks.request('ohmytrace.library-restore',action):await action();}finally{this.busy=false;}}
 async create(){return this.locked(async()=>{
  if(await this.thumbnails.getJournal())throw new Error('请先完成中断恢复再备份');
  const data=this.repository.getDataset(),index=await this.manifest.backup(),originalIndex=indexKey(index);validateDataset(data);validateManifest(index);relationships(data,index);
  const entries=[['life-dataset.json',encode(data)]],checksums={},rows=await this.thumbnails.list(),available=new Set(rows.map(r=>r.assetId));let thumbnailCount=0;
  for(const asset of index.assets){if(!available.has(asset.assetId)){if(asset.thumbnailReference)throw new Error('已引用的缩略图缺失，无法生成完整备份');asset.thumbnailReference=null;continue;}const blob=await this.thumbnails.read(asset.assetId);if(!blob)throw new Error('缩略图缺失');const path=`thumbnails/${asset.assetId}.jpg`;entries.push([path,new Uint8Array(await blob.arrayBuffer())]);asset.thumbnailReference={store:'ohmytrace.thumbnails',assetId:asset.assetId};thumbnailCount++;}
  entries.push(['media-index.json',encode(index)],['manifest.json',encode({kind:'ohmytrace.library-backup',version:1,createdAt:new Date().toISOString(),scope:'canonical life graph + media metadata/review + retained thumbnails; no originals',counts:{places:data.places.length,visits:data.visits.length,trips:data.trips.length,memories:data.memories.length,assets:index.assets.length,thumbnails:thumbnailCount}})]);
  if(graphKey(this.repository.getDataset())!==graphKey(data)||indexKey(await this.manifest.backup())!==originalIndex)throw new Error('备份期间数据变化，请重试');
  for(const [path,bytes]of entries)checksums[path]=await digest(bytes);entries.push(['checksums.json',encode(checksums)]);return writeZip(entries);
 });}
 async inspect(file){
  const entries=await readZip(file),files=new Map();for(const entry of entries){if(!['manifest.json','life-dataset.json','media-index.json','checksums.json'].includes(entry.path)&&!/^thumbnails\/asset_[a-f0-9]{64}\.jpg$/.test(entry.path))throw new Error('备份含未知文件');files.set(entry.path,await entry.read());}
  const json=path=>{if(!files.has(path))throw new Error('备份缺少必要文件');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files.get(path)));};
  const header=json('manifest.json'),checks=json('checksums.json');if(header.kind!=='ohmytrace.library-backup'||header.version!==1||!Number.isFinite(Date.parse(header.createdAt)))throw new Error('备份版本或时间无效');
  if(!checks||typeof checks!=='object'||Array.isArray(checks)||Object.keys(checks).length!==files.size-1)throw new Error('备份完整性清单无效');
  for(const [path,bytes]of files)if(path!=='checksums.json'&&checks[path]!==await digest(bytes))throw new Error('备份 SHA-256 完整性校验失败');
  const data=validateDataset(json('life-dataset.json')),index=validateManifest(json('media-index.json'));relationships(data,index);
  const thumbnails=new Map(),ids=new Set(index.assets.map(a=>a.assetId));
  for(const [path,bytes]of files)if(path.startsWith('thumbnails/')){const id=path.slice(11,-4);if(!ids.has(id))throw new Error('备份缩略图引用无效');const blob=new Blob([bytes],{type:'image/jpeg'});await validateThumbnail(blob);thumbnails.set(id,blob);}
  for(const asset of index.assets)if(asset.thumbnailReference&&!thumbnails.has(asset.assetId))throw new Error('备份缺少已引用的缩略图');
  const current=this.repository.getDataset(),currentIndex=await this.manifest.backup(),target=mergedGraph(current,data),conflicts=target.conflicts||[];
  return {header,data,index,thumbnails,baseKey:graphKey(current),baseIndex:indexKey(currentIndex),conflicts,
   summary:{createdAt:header.createdAt,places:data.places.length,visits:data.visits.length,trips:data.trips.length,memories:data.memories.length,assets:index.assets.length,thumbnails:thumbnails.size,conflicts:conflicts.length},target:conflicts.length?null:target};
 }
 async restore(preview){return this.locked(async()=>{
  if(await this.thumbnails.getJournal())throw new Error('请先恢复上次未完成的操作');
  const beforeData=this.repository.getDataset(),beforeIndex=await this.manifest.backup();
  if(graphKey(beforeData)!==preview.baseKey||indexKey(beforeIndex)!==preview.baseIndex)throw new Error('预览后本地数据已变化，请重新检查备份');
  const targetData=mergedGraph(beforeData,preview.data);if(targetData.conflicts?.length)throw new Error('备份与本地内容冲突；为保留较新的本地内容，本次未恢复');
  const targetIndex=mergedIndex(beforeIndex,preview.index);relationships(targetData,targetIndex);
  const existing=new Map((await this.thumbnails.list()).map(r=>[r.assetId,r])),operationId=crypto.randomUUID(),addedIds=[...preview.thumbnails.keys()].filter(id=>!existing.has(id));
  const beforeForeignNative=await this.thumbnails.getForeignNative(),known=new Map(beforeData.memories.map(m=>[m.id,m.uri]));
  const targetForeignNative=[...new Set([...beforeForeignNative,...preview.data.memories.filter(m=>/^android-media:[^/@]+\/[0-9]+$/.test(m.uri)&&known.get(m.id)!==m.uri).map(m=>m.uri)])];
  const newBytes=addedIds.reduce((n,id)=>n+preview.thumbnails.get(id).size,0),stats=await this.thumbnails.stats();if(stats.bytes+newBytes>stats.budgetBytes)throw new Error('恢复后的缩略图超过容量预算');
  const journal={operationId,state:'prepared',beforeData,beforeIndex,targetData,targetIndex,addedIds,beforeForeignNative,targetForeignNative};await this.thumbnails.setJournal(journal);
  try{
   for(const id of addedIds)await this.thumbnails.put(id,preview.thumbnails.get(id),{operationId});
   // No destructive thumbnail replacement. Missing optional thumbnails stay metadata-only.
   await this.thumbnails.setForeignNative(targetForeignNative);await this.manifest.restore(targetIndex);
   await this.repository.update(d=>{if(graphKey(d)!==preview.baseKey)throw new Error('本地数据已变化');Object.assign(d,targetData);});
   await this.thumbnails.setJournal({...journal,state:'committed'});await this.thumbnails.setJournal(null);return preview.summary;
  }catch(error){if(!this.repository.uncertain)await this.recover().catch(()=>{});throw error;}
 });}
 async recover(){
  const j=await this.thumbnails.getJournal();if(!j)return null;
  const current=this.repository.getDataset(),currentKey=graphKey(current),targetKey=graphKey(j.targetData),beforeKey=graphKey(j.beforeData),index=await this.manifest.backup();
  const graphCommitted=currentKey===targetKey&&(targetKey!==beforeKey||current.revision>j.beforeData.revision||j.state==='committed');
  if(graphCommitted){relationships(current,j.targetIndex);for(const id of j.addedIds)if(!await this.thumbnails.read(id))throw new Error('恢复待修复：缩略图未完整写入');if(Array.isArray(j.targetForeignNative))await this.thumbnails.setForeignNative(j.targetForeignNative);if(indexKey(index)!==indexKey(j.targetIndex)){if(indexKey(index)!==indexKey(j.beforeIndex))throw new Error('恢复后媒体索引又有变化，未自动覆盖');await this.manifest.restore(j.targetIndex);}await this.thumbnails.setJournal(null);return 'committed';}
  if(currentKey!==beforeKey&&!(empty(current)&&empty(j.beforeData)))throw new Error('恢复中断后本地数据又有变化，未覆盖现有内容');
  if(indexKey(index)===indexKey(j.targetIndex))await this.manifest.restore(j.beforeIndex);else if(indexKey(index)!==indexKey(j.beforeIndex))throw new Error('媒体索引已变化，未自动回滚');
  if(Array.isArray(j.beforeForeignNative))await this.thumbnails.setForeignNative(j.beforeForeignNative);
  for(const id of j.addedIds){const row=await this.thumbnails.record(id);if(row?.operationId===j.operationId)await this.thumbnails.delete(id);}await this.thumbnails.setJournal(null);return 'rolled-back';
 }
}
