import {clone,dateBound,periodText} from './schema.js';
import {sourceSummary} from './edits.js';
import {tripCountsAsTravel,visitCountsAsTravel,visiblePlace} from './travel-policy.js';
import {photoPlaceName,photoRegion,cityIdentity} from './geocoding/region-policy.js';
import {readTripTitle} from './media/journey-title.js';

const collections={place:'places',trip:'trips',residence:'residences',chapter:'chapters'};
const dateText=d=>periodText(d);
const period=e=>periodText(e.start,e.end);
const overlaps=(a,b)=>(dateBound(a.start)??-Infinity)<=(dateBound(b.end,true)??Infinity)&&(dateBound(a.end,true)??Infinity)>=(dateBound(b.start)??-Infinity);
export function recordCardModel(data,target,{year=null,scope:browsingScope=null}={}){
  const key=collections[target?.kind],entity=key&&data[key].find(e=>e.id===target.id&&!e.hidden);
  if(!entity)return null;
  const placeName=id=>photoPlaceName(data.places.find(p=>p.id===id),data);
  const inYear=e=>year===null||overlaps(e,{start:{precision:'year',value:String(year)},end:{precision:'year',value:String(year)}});
  const chapter=browsingScope?.type==='chapter'?data.chapters.find(c=>c.id===browsingScope.id&&!c.hidden):null;
  const inStage=e=>!chapter||overlaps(e,chapter);
  const aliases=new Set(target.kind==='place'?data.places.filter(p=>!p.hidden&&cityIdentity(p)===cityIdentity(entity)).map(p=>p.id):[]);
  const placeId=target.kind==='place'?entity.id:target.kind==='residence'?entity.placeId:null;
  const visits=data.visits.filter(v=>!v.hidden&&visiblePlace(data,v.placeId));
  const relevant=target.kind==='place'?visits.filter(v=>aliases.has(v.placeId)&&inYear(v)&&inStage(v)&&(!chapter||chapter.relatedTripIds.includes(v.tripId)||chapter.homeAnchors.some(id=>aliases.has(id)))):target.kind==='trip'?visits.filter(v=>entity.visitIds.includes(v.id)&&inYear(v)&&inStage(v)):target.kind==='residence'?visits.filter(v=>v.placeId===placeId&&overlaps(v,entity)):visits.filter(v=>entity.relatedTripIds.includes(v.tripId));
  const relatedIds=new Set(relevant.map(v=>v.tripId).filter(Boolean));
  const journeys=data.trips.filter(t=>!t.hidden&&(target.kind==='chapter'?entity.relatedTripIds.includes(t.id):target.kind==='trip'?t.id===entity.id:relatedIds.has(t.id))).sort((a,b)=>(dateBound(b.start)??-Infinity)-(dateBound(a.start)??-Infinity));
  const traveled=t=>tripCountsAsTravel(data,t)&&(target.kind!=='place'||relevant.some(v=>v.tripId===t.id&&visitCountsAsTravel(data,v,t)));
  const photos=data.memories.filter(m=>m.kind==='photo'&&!m.hidden&&inYear(m)&&inStage(m)&&(target.kind==='place'?m.placeIds.some(id=>aliases.has(id))&&(!chapter||chapter.memoryIds.includes(m.id)||m.tripIds.some(id=>chapter.relatedTripIds.includes(id))||chapter.homeAnchors.some(id=>aliases.has(id))):target.kind==='trip'?m.tripIds.includes(entity.id):target.kind==='residence'?m.placeIds.includes(placeId)&&overlaps(m,entity):entity.memoryIds.includes(m.id)||m.tripIds.some(id=>entity.relatedTripIds.includes(id))||entity.homeAnchors.some(id=>m.placeIds.includes(id))&&overlaps(m,entity)));
  const residences=data.residences.filter(r=>!r.hidden&&(aliases.size?aliases.has(r.placeId):r.placeId===placeId)&&inYear(r)&&inStage(r));
  const mergeKind=target.kind==='residence'?'place':target.kind,mergeId=target.kind==='residence'?placeId:entity.id;
  const visitType=entity.visitType||(target.kind==='residence'?entity.kind:target.kind==='trip'?({转机:'transit',路过:'pass-through'}[entity.type]||'travel'):residences.some(r=>r.kind==='home')?'home':residences.length?'past':relevant.length&&relevant.every(v=>v.legacy.type==='转机')?'transit':relevant.length&&relevant.every(v=>v.legacy.type==='路过')?'pass-through':'travel');
  const scope=target.kind==='trip'&&!tripCountsAsTravel(data,entity)?{type:'place',id:relevant[0]?.placeId}: {type:target.kind,id:entity.id};
  const provenance=sourceSummary(data,entity);if(target.kind==='trip')provenance.detail+=' 地点之间为推测连接，不代表实际轨迹。';
  return {target:clone(target),entity,visitType,title:target.kind==='place'?photoPlaceName(entity,data):target.kind==='trip'?readTripTitle(data,entity):entity.title,region:placeId?photoRegion(data.places.find(p=>p.id===placeId)?.location?.photoCity).displayName:null,
    kindLabel:target.kind==='place'?({transit:'转机', 'pass-through':'路过',home:'居住城市',past:'曾住城市'}[visitType]||'城市'):target.kind==='residence'?(entity.kind==='home'?'现居':'曾居'):target.kind==='chapter'?'人生阶段':tripCountsAsTravel(data,entity)?'旅程':'路过 / 转机',
    period:target.kind==='place'?(year===null?'照片与到访记录':year+' 年 · 照片与到访记录'):period(entity),provenance,actions:['回放','照片','分享','不对？'],scope:{...scope,...(year!==null?{year}:{}),...(chapter&&target.kind!=='chapter'?{chapterId:chapter.id}:{})},
    photos,photoIds:photos.map(m=>m.id),journeys:journeys.filter(traveled).map(t=>({kind:'trip',id:t.id,title:readTripTitle(data,t),period:period(t)})),
    connections:journeys.filter(t=>!traveled(t)).map(t=>({kind:'trip',id:t.id,title:t.title,period:period(t)})),
    residences:residences.map(r=>({kind:'residence',id:r.id,title:r.title,period:period(r)})),
    places:relevant.filter((v,i,all)=>all.findIndex(o=>cityIdentity(data.places.find(p=>p.id===o.placeId))===cityIdentity(data.places.find(p=>p.id===v.placeId)))===i).map(v=>({kind:'place',id:v.placeId,title:placeName(v.placeId),period:period(v)})),
    mergeKind,mergeId,mergeOptions:data[collections[mergeKind]].filter(e=>!e.hidden&&e.id!==mergeId).map(e=>({id:e.id,title:mergeKind==='place'?photoPlaceName(e,data):e.title})),
    splitVisits:target.kind==='trip'?visits.filter(v=>entity.visitIds.includes(v.id)).map(v=>({id:v.id,title:placeName(v.placeId),period:period(v)})):[]};
}

// DOM construction deliberately uses text nodes for all user-entered names.
function node(tag,attrs={},...children){
  const e=document.createElement(tag);
  for(const [key,value]of Object.entries(attrs))if(value!==false&&value!==null&&value!==undefined)e.setAttribute(key,value===true?'':String(value));
  for(const child of children.flat())if(child!==null&&child!==undefined)e.append(typeof child==='string'?document.createTextNode(child):child);
  return e;
}
export function mountRecordCard({element,repository,edits,getYear=()=>null,onClose=()=>{},onSelect=()=>{},onChange=()=>{},onReplay=()=>{},onShare=()=>{},onExplore=()=>{},thumbnail=async()=>null,getScope=()=>null,compact=false,titleFor=null,onMode=()=>{}}){
  let photoReturn=null,photoId=null,selection=null,mode='overview',busy=false,message='',failure='',page=0,shown=20,generation=0,urls=[],controller=null;
  const pairs={undo:[],redo:[]},feedback=node('div',{id:'record-feedback',class:'glass',role:'status',hidden:true});
  document.body.append(feedback);
  const data=()=>repository.snapshot();
  const readonly=()=>data().meta.origin==='demo'||document.body.classList.contains('story-readonly');
  const release=()=>{generation++;controller?.abort();urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};
  function notice(){
    if(document.body.classList.contains('story-readonly')){feedback.hidden=true;return;}
    feedback.replaceChildren();feedback.hidden=!message&&!failure;
    if(feedback.hidden)return;
    feedback.append(node('span',{},failure||message));
    const status=edits.status();
    if(status.canUndo)feedback.append(node('button',{'data-record-action':'undo',type:'button',disabled:busy},'撤销'));
    if(status.canRedo)feedback.append(node('button',{'data-record-action':'redo',type:'button',disabled:busy},'重做'));
    feedback.append(node('button',{'data-record-action':'dismiss',type:'button','aria-label':'关闭修改提示'},'×'));
  }
  function close(){selection=null;mode='overview';release();element.classList.remove('show','record-card','record-editing','expanded');document.body.classList.remove('card-open');}
  function links(title,items){
    if(!items.length)return null;
    return node('section',{class:'record-links'},node('h3',{},title),items.slice(0,shown).map(item=>node('button',{type:'button','data-record-action':'select','data-record-kind':item.kind,'data-record-id':item.id,class:'mini'},node('strong',{},item.title),node('small',{},item.period||''))),items.length>shown?node('button',{type:'button','data-record-action':'more',class:'record-more'},'显示更多记录'):null);
  }
  function correction(model){
    const disabled=busy||readonly(),name=node('input',{name:'name',value:model.title,required:true,maxlength:160,'aria-label':'记录名称'});
    const rename=node('form',{'data-record-form':'rename'},node('label',{},'名称',name),node('button',{type:'submit',class:'btn',disabled},'保存名称'));
    const types=selection.kind==='chapter'?{study:'学习',work:'工作',life:'生活',travel:'旅行',other:'其他'}:{travel:'旅行','pass-through':'路过',transit:'转机',home:'现居',past:'曾居'};
    const value=selection.kind==='chapter'?model.entity.type:model.visitType;
    const select=node('select',{name:'value','aria-label':'记录类型'},Object.entries(types).map(([v,label])=>node('option',{value:v,selected:v===value},label)));
    const forms=[rename,node('form',{'data-record-form':'classify'},node('label',{},'类型',select),node('button',{type:'submit',class:'btn',disabled},'保存类型'))];
    if(model.mergeOptions.length){
      forms.push(node('form',{'data-record-form':'merge'},node('label',{},(model.mergeKind==='place'?'合并另一座城市到这里':'合并另一条记录到这里'),node('select',{name:'other',required:true,'aria-label':'待合并记录'},node('option',{value:''},'选择一条记录'),model.mergeOptions.map(item=>node('option',{value:item.id},item.title)))),node('p',{class:'hint'},'保留这里的名称；按'+({place:'城市',trip:'旅程',chapter:'阶段'}[model.mergeKind])+'合并关联照片和记录，可撤销。'),node('button',{type:'submit',class:'btn',disabled},'合并记录')));
    }
    if(model.splitVisits.length>1){
      forms.push(node('form',{'data-record-form':'split'},node('h3',{},'拆成另一段旅程'),node('p',{class:'hint'},'选择要拆出的地点，至少留一个地点在当前旅程中。'),
        node('div',{class:'record-split-options'},model.splitVisits.map(v=>node('label',{},node('input',{name:'visitIds',value:v.id,type:'checkbox'}),v.title+' · '+v.period))),
        node('label',{},'新旅程名称',node('input',{name:'title',maxlength:160,value:model.title+' · 第二段'})),node('button',{type:'submit',class:'btn',disabled},'拆分旅程')));
    }
    forms.push(node('p',{class:'hint'},'删除只隐藏这条记录，照片原图保留；可以撤销。'),node('button',{type:'button',class:'btn danger','data-record-action':'delete',disabled},'删除这条记录'));
    return node('div',{class:'record-corrections'},node('h3',{},'哪里不对？'),forms,node('button',{type:'button',class:'btn','data-record-action':'overview'},'返回记录'));
  }
  function gallery(model,ticket){
    const photos=model.photos.slice(page*12,page*12+12),grid=node('div',{class:'record-photo-grid'}),targets=new Map();
    if(!photos.length)grid.append(node('p',{class:'hint'},'这条记录还没有关联照片。'));
    for(const m of photos){
      const placeholder=node(compact?'button':'span',compact?{type:'button','data-record-action':'photo-open','data-photo-id':m.id,'aria-label':'查看照片 '+(m.title||'照片')}:{},'正在读取照片…');
      grid.append(node('figure',{},placeholder,node('figcaption',{},m.title||'照片',node('small',{},dateText(m.start)))));
      // Bounded workers below prevent a 5k library from requesting 5k images.
      placeholder.dataset.recordPhoto=m.id;targets.set(m.id,placeholder);
    }
    const section=node('section',{},node('h3',{},'照片 · '+model.photos.length),grid,
      node('div',{class:'row-actions'},page>0?node('button',{type:'button',class:'btn','data-record-action':'photo-prev'},'上一页'):null,
        (page+1)*12<model.photos.length?node('button',{type:'button',class:'btn','data-record-action':'photo-next'},'下一页'):null));
    let next=0;
    const worker=async()=>{while(next<photos.length){
      const m=photos[next++],placeholder=targets.get(m.id);
      try{const blob=await thumbnail(m,{signal:controller.signal});if(ticket!==generation)return;
        if(!blob||!blob.size)throw new Error('unavailable');const url=URL.createObjectURL(blob);urls.push(url);
        placeholder.replaceChildren(node('img',{src:url,alt:m.title||'照片缩略图',loading:'lazy'}));
      }catch{if(ticket===generation)placeholder.textContent='原图不在本机，或尚未授权读取。';}
    }};
    void Promise.all([worker(),worker()]);return section;
  }
  function render(){
    if(document.body.classList.contains('story-readonly')){feedback.hidden=true;return false;}
    notice();if(!selection){release();element.classList.remove('show','record-card');document.body.classList.remove('card-open');return false;}
    const model=recordCardModel(data(),selection,{year:getYear(),scope:getScope()});
    if(!model){element.classList.remove('show');document.body.classList.remove('card-open');return false;}
    const previous=element.querySelector('.record-body')?.scrollTop||0;
    release();controller=new AbortController();const ticket=generation;
    element.classList.add('record-card');element.classList.toggle('record-editing',mode==='correct');
    element.dataset.recordKind=selection.kind;element.dataset.recordId=selection.id;
    const source=node('details',{class:'record-source'},node('summary',{},'来源：'+model.provenance.label),node('p',{class:'hint'},model.provenance.detail));
    const actions=node('nav',{class:'record-actions','aria-label':'记录操作'},model.actions.map((label,i)=>node('button',{type:'button','data-record-action':['replay','photos','share','correct'][i],class:i===0?'card-replay':'',disabled:busy||(i===2||i===3)&&readonly()},label)));
    const content=node('div',{class:'record-body'});
    if(model.region)content.append(node('p',{class:'hint record-region'},model.region));
    if(compact&&titleFor&&selection.kind==='trip')model.title=titleFor(data(),model.entity);
    if(compact){actions.children[3].textContent='编辑';
      // Read-only data (the demo) cannot share or edit; two dead buttons only add noise to a small sheet.
      if(readonly()){actions.children[3].remove();actions.children[2].remove();}}
    if(mode==='photo'){const memory=model.photos.find(m=>m.id===photoId);content.append(node('p',{},memory?.title||'照片'),node('button',{type:'button',class:'btn','data-record-action':'photos'},'返回照片'));if(memory)thumbnail(memory,{signal:controller.signal}).then(blob=>{if(ticket!==generation)return;if(!blob?.size)throw new Error();const url=URL.createObjectURL(blob);urls.push(url);content.append(node('img',{src:url,alt:memory.title||'照片',class:'earth-photo-large'}));}).catch(()=>{if(ticket===generation)content.append(node('p',{class:'hint'},'原图不在本机，或尚未授权读取。'));});}
    else if(mode==='correct')content.append(correction(model));
    else if(mode==='photos')content.append(gallery(model,ticket));
    else {
      content.append(...[links('居住记录',model.residences),compact&&selection.kind==='trip'?null:links((compact&&selection.kind==='place'?'到访与相关旅行 · ':'相关旅程 · ')+model.journeys.length,model.journeys),links('路过 / 转机',model.connections)].filter(Boolean));
      // Said once, and only where there is a line to qualify; the source details carry the full note.
      if(compact&&selection.kind==='trip'&&model.places.length>1)content.append(node('p',{class:'hint'},'连线按地点先后画出，不是实际路线。'));
      if(selection.kind==='trip'){const places=links('途经城市',model.places);if(places){if(compact)places.classList.add('earth-city-links');content.append(places);}}
      if(selection.kind==='chapter'){content.append(node('p',{class:'hint'},'阶段中的居住地点、旅程和照片共同组成这段回放。'));const anchors=links('阶段地点',model.entity.homeAnchors.filter(id=>visiblePlace(data(),id)).map(id=>({kind:'place',id,title:photoPlaceName(data().places.find(p=>p.id===id),data())})));if(anchors)content.append(anchors);}
      if(compact&&model.photos.length){const preview=gallery({...model,photos:model.photos.slice(0,3)},ticket);preview.querySelector('h3').textContent='照片 · '+model.photos.length;content.append(preview);if(model.photos.length>3)content.append(node('button',{type:'button',class:'record-more','data-record-action':'photos'},'查看全部 '+model.photos.length+' 张照片'));}
      const placeId=selection.kind==='place'?selection.id:selection.kind==='residence'?model.entity.placeId:model.places[0]?.id;
      if(compact)content.append(source);
      if(placeId)content.append(node('button',{type:'button',class:'record-more','data-record-action':'explore','data-record-id':placeId},'近看这里'));
    }
    element.replaceChildren(node('button',{type:'button',class:'x card-x','data-record-action':'close','aria-label':'关闭记录卡片'},'×'),
      node('div',{class:'card-kicker'},model.kindLabel),node('h2',{title:model.title},model.title),node('div',{class:'card-date'},model.period),...(compact?[]:[source]),actions,content);
    content.scrollTop=previous;document.body.classList.add('card-open');element.classList.add('show');onMode(mode);return true;
  }
  async function perform(command){
    if(busy||readonly())return;const before=clone(selection);busy=true;failure='';render();
    try{
      const result=await edits.execute(command),after={kind:result?.kind||command.kind||before.kind,id:result?.id||before.id};
      pairs.undo.push({before,after});pairs.redo=[];while(pairs.undo.length>edits.status().undoCount)pairs.undo.shift();
      selection=recordCardModel(data(),after)?after:null;mode='overview';message='已修改';onChange(clone(selection));
    }catch(error){failure=error.message;}
    finally{busy=false;render();notice();}
  }
  async function restore(action){
    if(busy||readonly())return;busy=true;failure='';
    try{if(await edits[action]()){
      const from=action==='undo'?pairs.undo:pairs.redo,to=action==='undo'?pairs.redo:pairs.undo,pair=from.pop();
      if(pair){to.push(pair);selection=clone(action==='undo'?pair.before:pair.after);}
      if(selection&&!recordCardModel(data(),selection))selection=null;
      mode='overview';message=action==='undo'?'已撤销':'已重做';onChange(clone(selection));
    }}catch(error){failure=error.message;}finally{busy=false;render();notice();}
  }
  const click=event=>{
    const button=event.target.closest('[data-record-action]');if(!button||busy)return;
    const action=button.dataset.recordAction;
    if(action==='undo'||action==='redo'){void restore(action);return;}
    if(action==='dismiss'){message='';failure='';notice();return;}
    if(action==='close'){close();onClose();return;}
    if(action==='select'){onSelect({kind:button.dataset.recordKind,id:button.dataset.recordId});return;}
    if(action==='explore'){onExplore(button.dataset.recordId);return;}
    if(action==='delete'){void perform({type:'delete',target:clone(selection)});return;}
    const model=selection&&recordCardModel(data(),selection,{year:getYear(),scope:getScope()});if(!model)return;
    if(action==='replay'){Promise.resolve(onReplay(model.scope)).catch(e=>{failure=e.message;notice();});return;}
    if(action==='share'){Promise.resolve(onShare(model.scope)).catch(e=>{failure=e.message;notice();});return;}
    if(action==='correct'){mode='correct';render();element.querySelector('[name=name]')?.focus({preventScroll:true});return;}
    if(action==='photo-open'){photoReturn={page,scroll:element.querySelector('.record-body')?.scrollTop||0};mode='photo';photoId=button.dataset.photoId;}
    if(action==='photos'){const returning=mode==='photo';mode='photos';page=returning?photoReturn?.page||0:0;}
    if(action==='overview')mode='overview';
    if(action==='more')shown+=20;
    if(action==='photo-prev')page=Math.max(0,page-1);
    if(action==='photo-next')page++;
    render();
  };
  const submit=event=>{
    const form=event.target.closest('[data-record-form]');if(!form)return;event.preventDefault();
    const values=new FormData(form),type=form.dataset.recordForm,model=recordCardModel(data(),selection);if(!model)return;
    const command=type==='rename'?{type,target:clone(selection),name:values.get('name')}:type==='classify'?{type,target:clone(selection),value:values.get('value')}:type==='merge'?{type,kind:model.mergeKind,ids:[model.mergeId,values.get('other')]}:{type,kind:'trip',id:selection.id,visitIds:values.getAll('visitIds'),title:values.get('title')};
    void perform(command);
  };
  function escape(){if(!selection)return false;if(mode==='photo'){mode='photos';page=photoReturn?.page||0;render();element.querySelector('.record-body')?.scrollTo(0,photoReturn?.scroll||0);return true;}if(mode!=='overview'){mode='overview';render();element.querySelector('[data-record-action=correct]')?.focus();}else{close();onClose();}return true;}
  const keydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();escape();}};
  element.addEventListener('keydown',keydown);
  element.addEventListener('click',click);element.addEventListener('submit',submit);feedback.addEventListener('click',click);
  const off=repository.subscribe(()=>render()),offHistory=edits.subscribe(()=>notice());
  return {snapshot(){return {selection:clone(selection),mode,page,photoId,photoReturn:clone(photoReturn),scroll:element.querySelector('.record-body')?.scrollTop||0};},restore(saved){if(!saved?.selection)return;selection=clone(saved.selection);mode=saved.mode;page=saved.page;photoId=saved.photoId;photoReturn=clone(saved.photoReturn);render();element.querySelector('.record-body')?.scrollTo(0,saved.scroll);},open(target){selection=clone(target);mode='overview';failure='';page=0;shown=20;render();},close,render,escape,edit(){if(selection&&!readonly()){mode='correct';render();element.querySelector('[name=name]')?.focus();}},get selection(){return clone(selection);},
    dispose(){release();off();offHistory();element.removeEventListener('keydown',keydown);element.removeEventListener('click',click);element.removeEventListener('submit',submit);feedback.remove();}};
}
