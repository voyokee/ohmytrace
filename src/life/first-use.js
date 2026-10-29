import {clone,newId,addEvidence,dateBound} from './schema.js';
import {tripCountsAsTravel,placeCountsAsVisited} from './travel-policy.js';
import {photoRegion} from './geocoding/region-policy.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const overlap=(a,b)=>(dateBound(a.start)??-Infinity)<=(dateBound(b.end,true)??Infinity)&&(dateBound(a.end,true)??Infinity)>=(dateBound(b.start)??-Infinity);
const evidenceOf=(d,e)=>(e.evidenceIds||[]).map(id=>d.evidence.find(v=>v.id===id)).filter(Boolean);
const manual=(d,e)=>evidenceOf(d,e).some(e=>e.state==='manual');
const eligible=(d,r)=>!r.hidden&&d.places.some(p=>p.id===r.placeId&&!p.hidden)&&evidenceOf(d,r).some(e=>e.source?.kind==='photo-auto-import');
export const residencePhotos=(d,r)=>d.memories.filter(m=>m.kind==='photo'&&!m.hidden&&m.placeIds.includes(r.placeId)&&overlap(m,r));
function links(d,r){const trips=d.trips.filter(t=>tripCountsAsTravel(d,t)&&overlap(t,r));return {relatedTripIds:trips.map(t=>t.id),memoryIds:residencePhotos(d,r).map(m=>m.id)};}
export function prepareFirstUse(data,{now=new Date()}={}){
 if(data.meta.origin==='demo'||data.meta.firstUse||!data.memories.some(m=>m.kind==='photo'))return false;
 const residences=data.residences.filter(r=>eligible(data,r)),drafts=[];
 for(const r of residences){
  let c=data.chapters.find(c=>!c.hidden&&(c.draft?.residenceId===r.id||c.homeAnchors.includes(r.placeId)&&same(c.start,r.start)&&same(c.end,r.end)));
  if(!c){const p=data.places.find(p=>p.id===r.placeId),photos=residencePhotos(data,r),state=manual(data,r)?'manual':'inferred';c={id:newId('chapter'),title:p.name+'的日子',type:'life',start:clone(r.start),end:clone(r.end),homeAnchors:[r.placeId],...links(data,r),draft:{residenceId:r.id,status:state==='manual'?'confirmed':'inferred'},evidenceIds:addEvidence(data,state,{kind:'residence-stage-draft',residenceId:r.id,photoIds:photos.map(m=>m.id),at:now.toISOString()})};data.chapters.push(c);}
  drafts.push(c.id);
 }
 const weak=r=>new Set(residencePhotos(data,r).map(m=>m.start.value).filter(Boolean)).size;
 const candidates=residences.filter(r=>!manual(data,r)).sort((a,b)=>(b.kind==='home')-(a.kind==='home')||weak(a)-weak(b)||(dateBound(b.start)??0)-(dateBound(a.start)??0)||a.id.localeCompare(b.id));
 const questions=candidates.slice(0,3).map(r=>r.id);
 data.meta.firstUse={version:1,status:questions.length?'pending':'complete',questions,answers:[],draftIds:drafts,startedAt:now.toISOString()};return true;
}
/** Called by EditHistory, so a confirmation/type change and its draft share one undo patch. */
export function answerResidence(data,{target,value},classify){
 const flow=data.meta.firstUse,r=data.residences.find(r=>r.id===target?.id&&!r.hidden);
 if(!flow||!flow.questions.includes(target?.id)||flow.answers.some(a=>a.residenceId===target.id)||!r)throw new Error('这项判断已变化，请重新查看');
 if(!['home','past','travel','pass-through','transit'].includes(value))throw new Error('请选择居住、旅行、路过或转机');
 const id=r.id,chapter=data.chapters.find(c=>c.draft?.residenceId===id&&!c.hidden),result=classify({target:{kind:'residence',id},value});
 const residence=data.residences.find(r=>r.id===id);
 if(residence){residence.userConfirmed=true;const visit=data.visits.find(v=>v.id===residence.visitId);visit.userConfirmed=true;
  if(chapter)Object.assign(chapter,{start:clone(residence.start),end:clone(residence.end),...links(data,residence),draft:{residenceId:id,status:'confirmed'}});
 }else if(chapter)chapter.hidden=true;
 return chapter&&!chapter.hidden?{kind:'chapter',id:chapter.id}:result;
}
export function firstUseView(data){
 const flow=data.meta.firstUse;if(!flow)return null;
 const answered=new Set(flow.answers.map(a=>a.residenceId));
 const next=flow.questions.find(id=>!answered.has(id)&&data.residences.some(r=>r.id===id&&eligible(data,r)));
 const residence=data.residences.find(r=>r.id===next),photos=residence?residencePhotos(data,residence):[],place=residence?data.places.find(p=>p.id===residence.placeId):null;
 const chapters=flow.draftIds.map(id=>data.chapters.find(c=>c.id===id&&!c.hidden)).filter(Boolean);
 const places=data.places.filter(p=>placeCountsAsVisited(data,p.id)),countries=new Set(places.map(p=>photoRegion(p.location?.photoCity).sovereignCode).filter(Boolean));
 const trips=data.trips.filter(t=>tripCountsAsTravel(data,t)),years=trips.flatMap(t=>t.start.value?[Number(t.start.value.slice(0,4))]:[]);
 return {finished:!!flow.finishedAt,pending:flow.status==='pending'&&!!residence,answered:flow.answers.length,total:flow.questions.length,question:residence?{id:residence.id,place:place.name,kind:residence.kind,start:clone(residence.start),end:clone(residence.end),photos:photos.length,days:new Set(photos.map(m=>m.start.value).filter(Boolean)).size}:null,
  chapters:chapters.map(c=>({id:c.id,title:c.title,start:clone(c.start),end:clone(c.end),confirmed:c.draft?c.draft.status==='confirmed':manual(data,c)})),counts:{cities:places.length,countries:countries.size,trips:trips.length,photos:data.memories.filter(m=>m.kind==='photo').length,located:data.memories.filter(m=>m.kind==='photo'&&!m.hidden&&m.placeIds.length).length},year:years.length?Math.max(...years):null};
}
export class FirstUseService {
 constructor(repository,edits){this.repository=repository;this.edits=edits;this.commands=[];}
 view(){return firstUseView(this.repository.getDataset());}
 async prepare(){const d=this.repository.getDataset();if(d.meta.firstUse)return this.view();if(d.meta.origin==='demo'||!d.memories.some(m=>m.kind==='photo'))return null;await this.repository.update(d=>prepareFirstUse(d));return this.view();}
 async answer(choice,value){const q=this.view()?.question;if(!q)return;
  if(choice!=='skip'){if(!['confirm','change'].includes(choice))throw new Error('请选择确认、修改或跳过');const before=this.edits.undoStack.at(-1)?.id;await this.edits.execute({type:'confirm-residence',target:{kind:'residence',id:q.id},value:choice==='confirm'?q.kind:value});const after=this.edits.undoStack.at(-1)?.id;if(after&&after!==before)this.commands.push(after);}
  await this.repository.update(d=>{const f=d.meta.firstUse;if(!f||f.answers.some(a=>a.residenceId===q.id))return;f.answers.push({residenceId:q.id,choice,at:new Date().toISOString()});if(f.answers.length>=f.questions.length)f.status='complete';});return this.view();
 }
 async skip(){await this.repository.update(d=>{const f=d.meta.firstUse;if(!f)return;for(const id of f.questions)if(!f.answers.some(a=>a.residenceId===id))f.answers.push({residenceId:id,choice:'skip',at:new Date().toISOString()});f.status='complete';});return this.view();}
 get canUndo(){return this.commands.length>0&&this.commands.at(-1)===this.edits.undoStack.at(-1)?.id;}
 async finish(){await this.repository.update(d=>{if(d.meta.firstUse)d.meta.firstUse.finishedAt=new Date().toISOString();});}
 async undo(){if(this.canUndo){await this.edits.undo();this.commands.pop();}return this.view();}
}
