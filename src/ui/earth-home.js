import {dateBound} from '../life/schema.js';
import {recentTrips,earthTripTitle,tripLocationCount} from './earth-home-model.js';

const node=(tag,attrs={},...children)=>{const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs))if(v!=null)el.setAttribute(k,String(v));for(const c of children.flat())if(c!=null)el.append(typeof c==='string'?document.createTextNode(c):c);return el;};
const button=(label,action,attrs={})=>node('button',{type:'button','data-earth':action,...attrs},label);
const period=t=>{const date=d=>d?.value|| (d?.precision==='ongoing'?'至今':'日期未知');return date(t.start)===date(t.end)?date(t.start):date(t.start)+' — '+date(t.end);};

export function mountEarthHome({repository,getTrips,getScope,getYear,onYear,onChapter,onSelect,onClear,onReplay,captureCamera,restoreCamera,thumbnail,recordCard,onPause}){
  document.body.classList.add('earth-home');
  const root=node('section',{id:'earth-sheet','data-height':'peek','aria-label':'旅行与回忆'}),handle=button('展开旅行','expand',{class:'earth-handle','aria-label':'展开当前旅行'}),bar=node('div',{class:'earth-sheet-bar'}),content=node('div',{class:'earth-sheet-content'}),card=document.querySelector('#card');
  root.append(handle,bar,content,card);document.body.append(root);
  const scopeButton=button('全部时间⌄','time',{id:'earth-time','aria-haspopup':'dialog'});document.querySelector('#brand').append(scopeButton);
  let view={mode:'peek',height:'peek',target:null},history=[],restoring=false,query='',directoryScroll=0,scopeScroll=0,replayState=null;
  let coverKey='',coverURL=null,coverTicket=0;
  const data=()=>repository.getDataset(),available=(filter='')=>recentTrips(data(),new Set(getTrips().map(t=>t.id)),filter);
  const count=t=>tripLocationCount(data(),t,new Set((getTrips().find(p=>p.id===t.id)?.stops||[]).map(s=>s.visitId)));
  const label=()=>getScope().type==='chapter'?data().chapters.find(c=>c.id===getScope().id)?.title||'人生阶段':getYear()!=null?getYear()+' 年':'全部时间';
  function snapshot(){return {view:structuredClone(view),camera:captureCamera(),scroll:view.mode==='detail'||view.mode==='record'?card.querySelector('.record-body')?.scrollTop||0:content.scrollTop,record:recordCard.snapshot(),query};}
  function push(){if(view.mode==='directory')directoryScroll=content.scrollTop;if(view.mode==='time')scopeScroll=content.scrollTop;history.push(snapshot());}
  function navigate(mode,height='full'){push();view={...view,mode,height};render();}
  function selected(target){
    if(restoring)return;
    const same=JSON.stringify(target)===JSON.stringify(view.target);
    if(!same||view.mode!=='detail')push();view={mode:'detail',height:'half',target:structuredClone(target)};render();
  }
  function changed(target){
    if(view.mode==='record'&&history.at(-1)?.view.mode==='detail')history.pop();
    if(!target){reset();return;}
    view={mode:'detail',height:'half',target:structuredClone(target)};render();
  }
  function clearRecord(){recordCard.close();onClear();}
  function back(){
    const previous=history.pop();
    if(!previous){reset();return;}
    restoring=true;view=previous.view;query=previous.query;
    if(view.target){onSelect(view.target,{fly:false});recordCard.restore(previous.record);}else clearRecord();
    restoring=false;render();content.scrollTop=previous.scroll;restoreCamera(previous.camera);
    if(view.mode==='detail')card.querySelector('.record-body')?.scrollTo(0,previous.scroll);
  }
  function reset(){history=[];view={mode:'peek',height:'peek',target:null};clearRecord();render();}
  function modeChanged(mode){
    if(restoring||view.mode!=='detail'&&view.mode!=='record')return;
    if(mode!=='overview'&&view.mode==='detail'){push();view={...view,mode:'record',height:'full'};onPause();render();}
    else if(mode==='overview'&&view.mode==='record'){if(history.at(-1)?.view.mode==='detail')history.pop();view={...view,mode:'detail',height:'half'};render();}
  }
  function summary(){
    const t=available()[0],demo=data().meta.origin==='demo';
    const head=node('div',{class:'earth-summary-top'},node('span',{},t&&dateBound(t.start)==null?'日期待确认的旅行':demo?'虚构足迹 · 最近旅行':'最近旅行'),button('全部旅行 ›','directory'));
    if(!t)return node('div',{class:'earth-summary'},head,node('h2',{},getYear()!=null||getScope().type==='chapter'?'这段时间还没有旅行':'把照片里的旅行，点亮在地球上'),node('p',{},'城市与居住记录仍可在地球上查看。'),button('添加照片','add',{class:'earth-primary'}),getYear()!=null||getScope().type==='chapter'?button('查看全部时间','year',{'data-year':'all'}):null,getScope().type==='chapter'?button('重走这个阶段','replay-range'):null,document.querySelector('#empty-demo').hidden?null:button('先看看虚构示例','demo',{class:'earth-demo'}));
    const text=node('div',{class:'earth-summary-copy'},node('h2',{},earthTripTitle(data(),t)),node('p',{},period(t)+' · '+count(t)));
    const cover=node('span',{class:'earth-cover','aria-hidden':'true'},'◌');
    const body=button('','select',{'data-trip':t.id,class:'earth-summary-main'});body.append(cover,text,node('span',{class:'earth-chevron'},'↗'));
    loadCover(t,cover);
    return node('div',{class:'earth-summary'},head,body,node('div',{class:'earth-summary-actions'},button('▶ 重走这段旅行','replay',{'data-trip':t.id,class:'earth-primary'}),getYear()!=null||getScope().type==='chapter'?button(getYear()!=null?'重走这一年':'重走这个阶段','replay-range',{class:'earth-note'}):node('span',{class:'earth-note'},'照片里的时间与地点')));
  }
  function loadCover(trip,el){
    const m=data().memories.find(m=>m.kind==='photo'&&!m.hidden&&m.tripIds.includes(trip.id)),key=m?.id||'';
    if(key===coverKey){if(coverURL)el.replaceChildren(node('img',{src:coverURL,alt:''}));return;}
    coverKey=key;const ticket=++coverTicket;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=null;
    if(!m)return;
    thumbnail(m,{}).then(blob=>{if(ticket!==coverTicket||!blob?.size)return;coverURL=URL.createObjectURL(blob);root.querySelector('.earth-cover')?.replaceChildren(node('img',{src:coverURL,alt:''}));}).catch(()=>{});
  }
  function directory(){
    const list=node('div',{class:'earth-directory'}),search=node('input',{type:'search',placeholder:'搜索旅行或城市','aria-label':'搜索旅行或城市',value:query});
    search.addEventListener('input',()=>{query=search.value;const start=search.selectionStart;render();const next=content.querySelector('input');next.focus();next.setSelectionRange(start,start);});
    list.append(search);let group=null;
    for(const t of available(query)){
      const year=t.start?.value?.slice(0,4)||'日期未知';if(year!==group){group=year;list.append(node('h3',{},year));}
      const row=button('','select',{'data-trip':t.id,class:'earth-trip-row'});
      row.append(node('span',{class:'earth-row-icon'},'↗'),node('span',{},node('strong',{},earthTripTitle(data(),t)),node('small',{},period(t)+' · '+count(t))),node('span',{},'›'));list.append(row);
    }
    if(!available(query).length)list.append(node('p',{class:'earth-muted'},'没有符合条件的旅行。'));
    return list;
  }
  function timeChooser(){
    const d=data(),years=new Set();for(const t of [...d.trips,...d.residences])if(!t.hidden){const a=dateBound(t.start),b=dateBound(t.end,true);if(a!=null)for(let y=new Date(a).getUTCFullYear();y<=Math.min(new Date(b??a).getUTCFullYear(),9999);y++)years.add(y);}
    return node('div',{class:'earth-time-options'},button('全部时间','year',{'data-year':'all','aria-pressed':getYear()==null&&getScope().type!=='chapter'}),node('h3',{},'按年份'),[...years].sort((a,b)=>b-a).map(y=>button(y+' 年','year',{'data-year':y,'aria-pressed':getYear()===y})),node('h3',{},'人生阶段'),d.chapters.filter(c=>!c.hidden).map(c=>button(c.title+' · '+period(c),'chapter',{'data-chapter':c.id,'aria-pressed':getScope().id===c.id})),!d.chapters.some(c=>!c.hidden)?node('p',{class:'earth-muted'},'还没有人生阶段，可在“我的”中建立。'):null,button('管理人生阶段','manage'));
  }
  function render(){
    scopeButton.textContent=label()+' ⌄';root.dataset.height=view.height;root.dataset.mode=view.mode;
    document.body.classList.toggle('earth-full',view.height==='full');
    const detail=view.mode==='detail'||view.mode==='record';card.hidden=!detail;
    bar.hidden=view.mode==='peek';content.hidden=detail;
    handle.setAttribute('aria-label',view.height==='peek'?'展开当前旅行':'收起当前内容');
    const title=view.mode==='directory'?'全部旅行':view.mode==='time'?'选择时间':view.mode==='cities'?'这一带的城市':view.mode==='record'?'照片与编辑':'旅行与回忆';
    bar.replaceChildren(button('‹ 返回','back',{'aria-label':'返回上一层'}),node('span',{},title),button(view.height==='half'?'展开 ↗':'收起','size'));
    if(view.mode==='peek')content.replaceChildren(summary());
    if(view.mode==='directory'){content.replaceChildren(directory());content.scrollTop=directoryScroll;}
    if(view.mode==='time'){content.replaceChildren(timeChooser());content.scrollTop=scopeScroll;}
    if(view.mode==='cities')content.replaceChildren(node('div',{class:'earth-directory'},view.cities.map(p=>button(p.name+' ›','city',{'data-place':p.id,class:'earth-trip-row'}))));
    if(detail)bar.querySelector('span').textContent=view.target?.kind==='place'?'城市与到访':view.target?.kind==='chapter'?'人生阶段':'旅行回忆';
  }
  async function replay(scope){
    replayState={view:structuredClone(view),history:[...history],camera:captureCamera(),record:recordCard.snapshot(),scroll:card.querySelector('.record-body')?.scrollTop||content.scrollTop};
    try{await onReplay(scope);}catch(error){replayState=null;throw error;}
  }
  function restoreReplay(){if(!replayState)return;const saved=replayState;replayState=null;view=saved.view;history=saved.history;render();restoreCamera(saved.camera);if(view.target){restoring=true;onSelect(view.target,{fly:false});recordCard.restore(saved.record);restoring=false;render();}const scroll=card.querySelector('.record-body')||content;scroll.scrollTop=saved.scroll;}
  root.addEventListener('click',event=>{
    const b=event.target.closest('[data-earth]');if(!b)return;event.stopPropagation();const action=b.dataset.earth;
    if(action==='directory'){onPause();navigate('directory');}
    if(action==='city')onSelect({kind:'place',id:b.dataset.place});
    if(action==='select')onSelect({kind:'trip',id:b.dataset.trip});
    if(action==='back') {if(view.mode==='record'){recordCard.escape();}else back();}
    if(action==='expand'&&event.detail>0&&performance.now()<suppressedUntil)return;
    if(action==='expand'){if(view.mode==='peek'){const t=available()[0];if(t)onSelect({kind:'trip',id:t.id});}else back();}
    if(action==='size'){view.height=view.height==='half'?'full':'half';render();}
    if(action==='replay-range')void replay(getYear()!=null?{type:'year',year:getYear()}:getScope()).catch(error=>window.alert(error.message));
    if(action==='demo')document.querySelector('#empty-demo').click();
    if(action==='replay')void replay({type:'trip',id:b.dataset.trip,...(getYear()!=null?{year:getYear()}:{}),...(getScope().type==='chapter'?{chapterId:getScope().id}:{})}).catch(error=>window.alert(error.message));
    if(action==='year'){clearRecord();view={mode:'peek',height:'peek',target:null};history=[];onYear(b.dataset.year==='all'?null:Number(b.dataset.year));render();}
    if(action==='chapter'){clearRecord();view={mode:'peek',height:'peek',target:null};history=[];onChapter(b.dataset.chapter);render();}
    if(action==='manage'){reset();document.querySelector('#btn-life').click();}
    if(action==='add')document.querySelector('#btn-photos').click();
  });
  scopeButton.addEventListener('click',()=>{onPause();navigate('time');});
  document.querySelector('#btn-list').addEventListener('click',()=>{document.body.classList.remove('list-open');navigate('directory');});
  let start=null,suppressedUntil=0;handle.addEventListener('pointerdown',e=>{start=e.clientY;handle.setPointerCapture(e.pointerId);});handle.addEventListener('pointerup',e=>{if(start==null)return;const delta=start-e.clientY;start=null;if(Math.abs(delta)>35)suppressedUntil=performance.now()+400;if(delta>35){if(view.mode==='peek'){const t=available()[0];if(t)onSelect({kind:'trip',id:t.id});}else{view.height='full';onPause();render();}}else if(delta< -35)back();});
  return {openCities(cities){push();view={mode:'cities',height:'half',target:null,cities};onPause();render();},render,selected,changed,modeChanged,reset,back,replay,restoreReplay,escape(){if(view.mode==='peek')return false;if(view.mode==='record'){recordCard.escape();}else back();return true;},get state(){return structuredClone(view);}};
}
