import {dateBound,periodText} from '../life/schema.js';
import {recentTrips,earthTripTitle,tripLocationCount} from './earth-home-model.js';
import {html,render as renderView} from '../../vendor/htm-preact/standalone.module.js';
import {paths} from './icons.js';

const Icon=({name})=>html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{__html:paths[name]||''}} />`;
const period=t=>periodText(t.start,t.end);

export function mountEarthHome({repository,getTrips,getScope,getYear,onYear,onChapter,onSelect,onClear,onReplay,captureCamera,restoreCamera,thumbnail,recordCard,onPause}){
  document.body.classList.add('earth-home');
  const root=document.createElement('section'),handle=document.createElement('button'),bar=document.createElement('div'),content=document.createElement('div'),card=document.querySelector('#card');
  root.id='earth-sheet';root.dataset.height='peek';root.setAttribute('aria-label','旅行');
  handle.type='button';handle.dataset.earth='expand';handle.className='earth-handle';handle.textContent='展开旅行';handle.setAttribute('aria-label','展开当前旅行');
  bar.className='earth-sheet-bar';content.className='earth-sheet-content';
  // Preact owns only these containers; the record card remains an imperative sibling.
  root.append(handle,bar,content,card);document.body.append(root);
  const scopeButton=document.createElement('button');scopeButton.type='button';scopeButton.id='earth-time';scopeButton.dataset.earth='time';scopeButton.setAttribute('aria-haspopup','dialog');document.querySelector('#brand').append(scopeButton);
  renderView(html`<span>全部时间</span><${Icon} name="chevron-down" />`,scopeButton);
  let view={mode:'peek',height:'peek',target:null},history=[],restoring=false,query='',directoryScroll=0,scopeScroll=0,replayState=null;
  // A flow from outside (first use) can borrow the sheet; it supplies the content and handles Escape.
  let hosted=null;
  let coverKey='',coverURL=null,coverTicket=0;
  const data=()=>repository.getDataset(),available=(filter='')=>recentTrips(data(),new Set(getTrips().map(t=>t.id)),filter);
  const count=t=>tripLocationCount(data(),t,new Set((getTrips().find(p=>p.id===t.id)?.stops||[]).map(s=>s.visitId)));
  const label=()=>getScope().type==='chapter'?data().chapters.find(c=>c.id===getScope().id)?.title||'人生阶段':getYear()!=null?getYear()+' 年':'全部时间';
  function snapshot(){return {view:structuredClone(view),camera:captureCamera(),scroll:view.mode==='detail'||view.mode==='record'?card.querySelector('.record-body')?.scrollTop||0:content.scrollTop,record:recordCard.snapshot(),query};}
  function push(){if(view.mode==='directory')directoryScroll=content.scrollTop;if(view.mode==='time')scopeScroll=content.scrollTop;history.push(snapshot());}
  function navigate(mode,height='full'){push();view={...view,mode,height};render();}
  function selected(target){
    if(restoring)return;
    hosted=null;
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
    if(hosted){hosted.onEscape?.();return;}
    const previous=history.pop();
    if(!previous){reset();return;}
    restoring=true;view=previous.view;query=previous.query;
    if(view.target){onSelect(view.target,{fly:false});recordCard.restore(previous.record);}else clearRecord();
    restoring=false;render();content.scrollTop=previous.scroll;restoreCamera(previous.camera);
    if(view.mode==='detail')card.querySelector('.record-body')?.scrollTo(0,previous.scroll);
  }
  function reset(){hosted=null;history=[];view={mode:'peek',height:'peek',target:null};clearRecord();render();}
  function host(flow){hosted=flow;history=[];recordCard.close();view={mode:flow.mode,height:flow.height||'half',target:null};render();}
  function release(){if(hosted)reset();}
  function modeChanged(mode){
    if(restoring||view.mode!=='detail'&&view.mode!=='record')return;
    if(mode!=='overview'&&view.mode==='detail'){push();view={...view,mode:'record',height:'full'};onPause();render();}
    else if(mode==='overview'&&view.mode==='record'){if(history.at(-1)?.view.mode==='detail')history.pop();view={...view,mode:'detail',height:'half'};render();}
  }
  function Summary({d,t,scoped,year,scope,coverURL,demoAvailable}){
    const demo=d.meta.origin==='demo';
    const head=html`<div class="earth-summary-top"><span>${(demo?'示例 · ':'')+(t&&dateBound(t.start)==null?'日期未确认':'最近一次旅行')}</span><button type="button" data-earth="directory">全部旅行<${Icon} name="chevron-right" /></button></div>`;
    if(!t)return html`<div class="earth-summary">${head}<h2>${scoped?'这段时间没有旅行':'还没有旅行记录'}</h2><p>${scoped?'居住地和城市仍显示在地球上。':'导入相册后，会按拍摄时间和地点整理成旅行。'}</p><button type="button" data-earth="add" class="earth-primary">添加照片</button>${scoped&&html`<button type="button" data-earth="year" data-year="all">查看全部时间</button>`}${scope.type==='chapter'&&html`<button type="button" data-earth="replay-range">回放这个阶段</button>`}${demoAvailable&&html`<button type="button" data-earth="demo" class="earth-demo">看看示例</button>`}</div>`;
    const photos=d.memories.filter(m=>m.kind==='photo'&&!m.hidden&&m.tripIds.includes(t.id)).length;
    // No placeholder art: the cover slot appears only once a real photo has loaded.
    return html`<div class="earth-summary">${head}<button type="button" data-earth="select" data-trip=${t.id} class="earth-summary-main"><span class="earth-cover" aria-hidden="true" hidden=${!coverURL}>${coverURL&&html`<img src=${coverURL} alt="" />`}</span><div class="earth-summary-copy"><h2>${earthTripTitle(d,t)}</h2><p>${period(t)+' · '+count(t)}</p></div><span class="earth-chevron"><${Icon} name="chevron-right" /></span></button>
      <div class="earth-summary-actions"><button type="button" data-earth="replay" data-trip=${t.id} class="earth-primary" aria-label="回放这次旅行"><${Icon} name="play" />回放</button>${scoped?html`<button type="button" data-earth="replay-range" class="earth-note">${year!=null?'回放这一年':'回放这个阶段'}</button>`:photos?html`<span class="earth-note">${photos+' 张照片'}</span>`:null}</div></div>`;
  }
  function loadCover(trip){
    const m=data().memories.find(m=>m.kind==='photo'&&!m.hidden&&m.tripIds.includes(trip.id)),key=m?.id||'';
    if(key===coverKey)return;
    coverKey=key;const ticket=++coverTicket;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=null;
    if(!m)return;
    thumbnail(m,{}).then(blob=>{if(ticket!==coverTicket||!blob?.size)return;coverURL=URL.createObjectURL(blob);if(view.mode==='peek'&&!hosted)render();}).catch(()=>{});
  }
  function Directory({trips,query}){
    let group=null;const rows=[];
    for(const t of trips){
      const year=t.start?.value?.slice(0,4)||'日期未知';if(year!==group){group=year;rows.push(html`<h3 key=${'year-'+year}>${year}</h3>`);}
      // The year is the group heading; rows start at the month.
      const when=period(t),local=when.startsWith(year+'年')&&when.length>year.length+1?when.slice(year.length+1):when;
      rows.push(html`<button key=${t.id} type="button" data-earth="select" data-trip=${t.id} class="earth-trip-row"><span><strong>${earthTripTitle(data(),t)}</strong><small>${local+' · '+count(t)}</small></span><${Icon} name="chevron-right" /></button>`);
    }
    return html`<div class="earth-directory"><input type="search" placeholder="搜索旅行或城市" aria-label="搜索旅行或城市" value=${query} onInput=${search} />${rows}${!trips.length&&html`<p class="earth-muted">没有符合条件的旅行。</p>`}</div>`;
  }
  function search(event){query=event.currentTarget.value;render();}
  function TimeChooser({d,year,scope}){
    const years=new Set();for(const t of [...d.trips,...d.residences])if(!t.hidden){const a=dateBound(t.start),b=dateBound(t.end,true);if(a!=null)for(let y=new Date(a).getUTCFullYear();y<=Math.min(new Date(b??a).getUTCFullYear(),9999);y++)years.add(y);}
    const chapters=d.chapters.filter(c=>!c.hidden);
    return html`<div class="earth-time-options"><button type="button" data-earth="year" data-year="all" aria-pressed=${year==null&&scope.type!=='chapter'}>全部时间</button>
      <h3>按年份</h3><div class="earth-years">${[...years].sort((a,b)=>b-a).map(y=>html`<button key=${y} type="button" data-earth="year" data-year=${y} aria-pressed=${year===y}>${y+' 年'}</button>`)}</div>
      <h3>人生阶段</h3>${chapters.map(c=>html`<button key=${c.id} type="button" data-earth="chapter" data-chapter=${c.id} aria-pressed=${scope.id===c.id}>${c.title+' · '+period(c)}</button>`)}${chapters.length?html`<button type="button" data-earth="manage">管理人生阶段</button>`:html`<p class="earth-muted">还没有人生阶段。</p><button type="button" data-earth="manage">新建人生阶段</button>`}</div>`;
  }
  function Cities({cities}){return html`<div class="earth-directory">${cities.map(p=>html`<button key=${p.id} type="button" data-earth="city" data-place=${p.id} class="earth-trip-row"><span><strong>${p.name}</strong></span><${Icon} name="chevron-right" /></button>`)}</div>`;}
  function Bar({title,height}){return html`<button type="button" data-earth="back" aria-label="返回上一层"><${Icon} name="chevron-left" />返回</button><span>${title}</span><button type="button" data-earth="size">${height==='half'?html`展开<${Icon} name="maximize-2" />`:html`收起<${Icon} name="minimize-2" />`}</button>`;}
  function render(){
    renderView(html`<span>${label()}</span><${Icon} name="chevron-down" />`,scopeButton);root.dataset.height=view.height;root.dataset.mode=view.mode;
    document.body.classList.toggle('earth-full',view.height==='full');
    const detail=view.mode==='detail'||view.mode==='record';card.hidden=!detail;
    bar.hidden=view.mode==='peek';content.hidden=detail;
    handle.setAttribute('aria-label',view.height==='peek'?'展开当前旅行':'收起当前内容');
    const title=detail?(view.target?.kind==='place'?'城市':view.target?.kind==='chapter'?'人生阶段':'旅行'):view.mode==='directory'?'全部旅行':view.mode==='time'?'时间范围':view.mode==='cities'?'附近城市':'';
    renderView(html`<${Bar} title=${title} height=${view.height} />`,bar);
    if(hosted&&view.mode===hosted.mode){bar.hidden=true;const step=content.firstElementChild?.dataset.step;renderView(hosted.render(),content);if(content.firstElementChild?.dataset.step!==step)content.scrollTop=0;return;}
    if(view.mode==='peek'){const t=available()[0];if(t)loadCover(t);renderView(html`<${Summary} d=${data()} t=${t} scoped=${getYear()!=null||getScope().type==='chapter'} year=${getYear()} scope=${getScope()} coverURL=${coverURL} demoAvailable=${!document.querySelector('#empty-demo').hidden} />`,content);}
    if(view.mode==='directory'){renderView(html`<${Directory} trips=${available(query)} query=${query} />`,content);content.scrollTop=directoryScroll;}
    if(view.mode==='time'){renderView(html`<${TimeChooser} d=${data()} year=${getYear()} scope=${getScope()} />`,content);content.scrollTop=scopeScroll;}
    if(view.mode==='cities')renderView(html`<${Cities} cities=${view.cities} />`,content);
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
    if(action==='expand'&&(hosted||event.detail>0&&performance.now()<suppressedUntil))return;
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
  // The sheet follows the finger (with resistance upwards) and settles on release.
  let start=null,suppressedUntil=0;
  const settle=()=>{root.classList.remove('dragging');root.style.removeProperty('--drag');};
  handle.addEventListener('pointerdown',e=>{start=e.clientY;root.classList.add('dragging');handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(start==null)return;const d=e.clientY-start;root.style.setProperty('--drag',(d>0?d:d*.3).toFixed(1)+'px');});
  handle.addEventListener('pointercancel',()=>{start=null;settle();});
  handle.addEventListener('pointerup',e=>{if(start==null)return;const delta=start-e.clientY;start=null;settle();if(hosted)return;if(Math.abs(delta)>35)suppressedUntil=performance.now()+400;if(delta>35){if(view.mode==='peek'){const t=available()[0];if(t)onSelect({kind:'trip',id:t.id});}else{view.height='full';onPause();render();}}else if(delta< -35)back();});
  return {host,release,get hosting(){return !!hosted;},featured:()=>available()[0]?.id||null,openCities(cities){push();view={mode:'cities',height:'half',target:null,cities};onPause();render();},render,selected,changed,modeChanged,reset,back,replay,restoreReplay,escape(){if(hosted){hosted.onEscape?.();return true;}if(view.mode==='peek')return false;if(view.mode==='record'){recordCard.escape();}else back();return true;},get state(){return structuredClone(view);}};
}
