import {dateBound,periodText} from '../life/schema.js';
import {recentTrips,earthTripTitle,tripLocationCount} from './earth-home-model.js';
import {iconNode as icon} from './icons.js';

const node=(tag,attrs={},...children)=>{const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs))if(v!=null)el.setAttribute(k,String(v));for(const c of children.flat())if(c!=null)el.append(typeof c==='string'?document.createTextNode(c):c);return el;};
const button=(label,action,attrs={})=>node('button',{type:'button','data-earth':action,...attrs},label);
const period=t=>periodText(t.start,t.end);

export function mountEarthHome({repository,getTrips,getScope,getYear,onYear,onChapter,onSelect,onClear,onReplay,captureCamera,restoreCamera,thumbnail,recordCard,onPause}){
  document.body.classList.add('earth-home');
  const root=node('section',{id:'earth-sheet','data-height':'peek','aria-label':'旅行'}),handle=button('展开旅行','expand',{class:'earth-handle','aria-label':'展开当前旅行'}),bar=node('div',{class:'earth-sheet-bar'}),content=node('div',{class:'earth-sheet-content'}),card=document.querySelector('#card');
  root.append(handle,bar,content,card);document.body.append(root);
  const scopeButton=button([node('span',{},'全部时间'),icon('chevron-down')],'time',{id:'earth-time','aria-haspopup':'dialog'});document.querySelector('#brand').append(scopeButton);
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
  function summary(){
    const t=available()[0],demo=data().meta.origin==='demo';
    const scoped=getYear()!=null||getScope().type==='chapter';
    const head=node('div',{class:'earth-summary-top'},node('span',{},(demo?'示例 · ':'')+(t&&dateBound(t.start)==null?'日期未确认':'最近一次旅行')),button(['全部旅行',icon('chevron-right')],'directory'));
    if(!t)return node('div',{class:'earth-summary'},head,node('h2',{},scoped?'这段时间没有旅行':'还没有旅行记录'),node('p',{},scoped?'居住地和城市仍显示在地球上。':'导入相册后，会按拍摄时间和地点整理成旅行。'),button('添加照片','add',{class:'earth-primary'}),scoped?button('查看全部时间','year',{'data-year':'all'}):null,getScope().type==='chapter'?button('回放这个阶段','replay-range'):null,document.querySelector('#empty-demo').hidden?null:button('看看示例','demo',{class:'earth-demo'}));
    const text=node('div',{class:'earth-summary-copy'},node('h2',{},earthTripTitle(data(),t)),node('p',{},period(t)+' · '+count(t)));
    // No placeholder art: the cover slot appears only once a real photo has loaded.
    const cover=node('span',{class:'earth-cover','aria-hidden':'true',hidden:''});
    const body=button('','select',{'data-trip':t.id,class:'earth-summary-main'});body.append(cover,text,node('span',{class:'earth-chevron'},icon('chevron-right')));
    loadCover(t,cover);
    const photos=data().memories.filter(m=>m.kind==='photo'&&!m.hidden&&m.tripIds.includes(t.id)).length;
    return node('div',{class:'earth-summary'},head,body,node('div',{class:'earth-summary-actions'},button([icon('play'),'回放'],'replay',{'data-trip':t.id,class:'earth-primary','aria-label':'回放这次旅行'}),scoped?button(getYear()!=null?'回放这一年':'回放这个阶段','replay-range',{class:'earth-note'}):photos?node('span',{class:'earth-note'},photos+' 张照片'):null));
  }
  function loadCover(trip,el){
    const m=data().memories.find(m=>m.kind==='photo'&&!m.hidden&&m.tripIds.includes(trip.id)),key=m?.id||'';
    const show=slot=>{if(!slot)return;slot.replaceChildren(node('img',{src:coverURL,alt:''}));slot.hidden=false;};
    if(key===coverKey){if(coverURL)show(el);return;}
    coverKey=key;const ticket=++coverTicket;if(coverURL)URL.revokeObjectURL(coverURL);coverURL=null;
    if(!m)return;
    thumbnail(m,{}).then(blob=>{if(ticket!==coverTicket||!blob?.size)return;coverURL=URL.createObjectURL(blob);show(root.querySelector('.earth-cover'));}).catch(()=>{});
  }
  function directory(){
    const list=node('div',{class:'earth-directory'}),search=node('input',{type:'search',placeholder:'搜索旅行或城市','aria-label':'搜索旅行或城市',value:query});
    search.addEventListener('input',()=>{query=search.value;const start=search.selectionStart;render();const next=content.querySelector('input');next.focus();next.setSelectionRange(start,start);});
    list.append(search);let group=null;
    for(const t of available(query)){
      const year=t.start?.value?.slice(0,4)||'日期未知';if(year!==group){group=year;list.append(node('h3',{},year));}
      // The year is the group heading; rows start at the month.
      const when=period(t),local=when.startsWith(year+'年')&&when.length>year.length+1?when.slice(year.length+1):when;
      const row=button('','select',{'data-trip':t.id,class:'earth-trip-row'});
      row.append(node('span',{},node('strong',{},earthTripTitle(data(),t)),node('small',{},local+' · '+count(t))),icon('chevron-right'));list.append(row);
    }
    if(!available(query).length)list.append(node('p',{class:'earth-muted'},'没有符合条件的旅行。'));
    return list;
  }
  function timeChooser(){
    const d=data(),years=new Set();for(const t of [...d.trips,...d.residences])if(!t.hidden){const a=dateBound(t.start),b=dateBound(t.end,true);if(a!=null)for(let y=new Date(a).getUTCFullYear();y<=Math.min(new Date(b??a).getUTCFullYear(),9999);y++)years.add(y);}
    return node('div',{class:'earth-time-options'},button('全部时间','year',{'data-year':'all','aria-pressed':getYear()==null&&getScope().type!=='chapter'}),node('h3',{},'按年份'),node('div',{class:'earth-years'},[...years].sort((a,b)=>b-a).map(y=>button(y+' 年','year',{'data-year':y,'aria-pressed':getYear()===y}))),node('h3',{},'人生阶段'),d.chapters.filter(c=>!c.hidden).map(c=>button(c.title+' · '+period(c),'chapter',{'data-chapter':c.id,'aria-pressed':getScope().id===c.id})),d.chapters.some(c=>!c.hidden)?button('管理人生阶段','manage'):[node('p',{class:'earth-muted'},'还没有人生阶段。'),button('新建人生阶段','manage')]);
  }
  function render(){
    scopeButton.replaceChildren(node('span',{},label()),icon('chevron-down'));root.dataset.height=view.height;root.dataset.mode=view.mode;
    document.body.classList.toggle('earth-full',view.height==='full');
    const detail=view.mode==='detail'||view.mode==='record';card.hidden=!detail;
    bar.hidden=view.mode==='peek';content.hidden=detail;
    handle.setAttribute('aria-label',view.height==='peek'?'展开当前旅行':'收起当前内容');
    const title=view.mode==='directory'?'全部旅行':view.mode==='time'?'时间范围':view.mode==='cities'?'附近城市':view.mode==='record'?'详情':'';
    bar.replaceChildren(button([icon('chevron-left'),'返回'],'back',{'aria-label':'返回上一层'}),node('span',{},title),button(view.height==='half'?['展开',icon('maximize-2')]:['收起',icon('minimize-2')],'size'));
    if(hosted&&view.mode===hosted.mode){bar.hidden=true;const next=hosted.render(),step=content.firstElementChild?.dataset.step;content.replaceChildren(next);if(next.dataset.step!==step)content.scrollTop=0;return;}
    if(view.mode==='peek')content.replaceChildren(summary());
    if(view.mode==='directory'){content.replaceChildren(directory());content.scrollTop=directoryScroll;}
    if(view.mode==='time'){content.replaceChildren(timeChooser());content.scrollTop=scopeScroll;}
    if(view.mode==='cities')content.replaceChildren(node('div',{class:'earth-directory'},view.cities.map(p=>button([node('span',{},node('strong',{},p.name)),icon('chevron-right')],'city',{'data-place':p.id,class:'earth-trip-row'}))));
    if(detail)bar.querySelector('span').textContent=view.target?.kind==='place'?'城市':view.target?.kind==='chapter'?'人生阶段':'旅行';
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
