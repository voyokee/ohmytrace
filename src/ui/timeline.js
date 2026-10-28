import {timelineLayout} from '../life/timeline-layout.js';
import {yearOptions,inYear as matchesYear,timelineBuckets} from './year-scope.js';
export function mountTimeline({element,yearsElement,getModel,onSelect,onScope,onGroup,onInteraction=()=>{},coreName=name=>name,esc=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}){
const $=s=>s==='#timeline'?element:s==='#year-filter'?yearsElement:element.querySelector(s);
let timelineGroups=new Map(),timelineLayoutKey,timelineFrame,timelineViewportWidth=0,timelineAtLatest=true;
let yearSignature='';
function renderYears() {const {state,travelTrips}=getModel();
  const counted=travelTrips(),options=yearOptions(counted),signature=counted.length+'|'+options.map(y=>`${y}:${counted.filter(t=>matchesYear(t,y)).length}`).join('|');
  const el=$('#year-filter');
  if(signature!==yearSignature||!el.children.length) {
    const scroll=el.scrollLeft;yearSignature=signature;
    el.innerHTML=`<button class="year-option" data-act="all-years" aria-label="全部年份，${counted.length} 次旅行" aria-pressed="false">全部<span>${counted.length}</span></button>`+
      options.map(y=>{const count=counted.filter(t=>matchesYear(t,y)).length;return `<button class="year-option" data-year="${y}" aria-label="按 ${y} 年显示，${count} 次旅行" aria-pressed="false">${y}<span>${count}</span></button>`;}).join('');
    el.scrollLeft=scroll;
  }
  for(const button of el.children){const on=button.dataset.year?+button.dataset.year===state.year:state.year==null;button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));}
}

function renderTimeline() {const {state,lifeSnapshot,typeColors,visibleTrips,visibleHomes}=getModel();
  const dated=visibleTrips().filter(t=>t.date),track=$('#tl-track'),viewport=track.parentElement;timelineGroups=new Map();
  const context=[...visibleHomes().filter(h=>h.date),...(lifeSnapshot?.chapterPeriod?[{date:lifeSnapshot.chapterPeriod}]:[])];
  const periods=[...dated,...context];
  $('#timeline').classList.toggle('empty',!periods.length&&$('#chapter-filter').hidden);
  const layout=timelineLayout(dated,{year:state.year,context,viewportWidth:viewport.clientWidth}),P=layout.position;
  const key=JSON.stringify([lifeSnapshot?.chapter?.id,layout.key]);
  const previousScroll=viewport.scrollLeft,latest=key!==timelineLayoutKey||timelineAtLatest;
  timelineLayoutKey=key;timelineViewportWidth=viewport.clientWidth;
  track.style.width=`${layout.width}px`;
  cancelAnimationFrame(timelineFrame);
  timelineFrame=requestAnimationFrame(()=>{
    viewport.scrollLeft=latest?viewport.scrollWidth:previousScroll;
    if(latest)$('#year-filter').scrollLeft=$('#year-filter').scrollWidth;
  });
  if(!periods.length){track.innerHTML='<span class="tl-month" style="left:50%">日期未知</span>';return;}
  const dense=state.year!=null||dated.length>16;track.classList.toggle('dense',dense);
  let html='<div class="tl-rail"></div>';
  if(layout.overlaps(lifeSnapshot?.chapterPeriod)){const d=lifeSnapshot.chapterPeriod,l=P(d.start),r=P(d.end);html+=`<span class="tl-band life-band" style="left:${l}%;width:${Math.max(r-l,.6)}%" title="${esc(lifeSnapshot.chapter.title)} · ${esc(d.label)}"></span>`;}
  for(const h of visibleHomes()) {
    if(!layout.overlaps(h.date))continue;
    const l=P(h.date.start),r=P(h.date.end);
    html+=`<button class="tl-band ${h.kind}${state.sel===h.id?' on':''}" data-id="${esc(h.id)}" style="left:${l}%;width:${Math.max(r-l,.6)}%" title="${h.anchor?'阶段地点':h.kind==='home'?'现居':'曾居'} · ${esc(coreName(h.place))} · ${esc(h.date.label)}"></button>`;
  }
  if(!dense) {
    for(const y of layout.years)html+=`<button class="tl-year has" data-year="${y}" style="left:${layout.yearPosition(y)}%">${y}</button>`;
    for(const t of dated){const x=P(t.date.start);html+=`<button class="tl-dot${x<15?' at-start':x>85?' at-end':''}${state.sel===t.id?' on':''}" data-id="${esc(t.id)}" style="left:${x}%;--c:${typeColors[t.type]}" aria-label="${esc(t.title)}"><span class="tl-tip">${esc(t.title)} · ${esc(t.date.short)}</span></button>`;}
  } else if(state.year==null) {
    for(const {key,items}of timelineBuckets(dated)) {
      const x=layout.yearPosition(key);
      html+=`<button class="tl-bucket" data-year="${key}" style="left:${x}%" aria-label="${key} 年，${items.length} 次旅行，按年查看"><span>${items.length}</span></button><button class="tl-year has" data-year="${key}" style="left:${x}%">${key}</button>`;
    }
  } else {
    for(const month of layout.months)html+=`<span class="tl-month" style="left:${layout.monthPosition(month)}%">${month}月</span>`;
    for(const {key,items}of timelineBuckets(dated,state.year)) {
      const id=String(key),on=items.some(t=>t.id===state.sel);timelineGroups.set(id,items);
      const action=items.length===1?`data-id="${esc(items[0].id)}"`:`data-act="timeline-group" data-group="${id}"`;
      html+=`<button class="tl-bucket${on?' on':''}" ${action} style="left:${layout.monthPosition(key)}%" aria-label="${state.year} 年 ${key} 月，${items.length} 次旅行"><span>${items.length}</span></button>`;
    }
  }
  track.innerHTML=html;
}
function showTimelineGroup(button) {const {state}=getModel();
  onInteraction();
  const list=timelineGroups.get(button.dataset.group);if(!list?.length)return;
  const r=button.getBoundingClientRect();
  onGroup({title:`${state.year} 年 ${button.dataset.group} 月`,subtitle:`${list.length} 次旅行`,anchor:{x:r.left+r.width/2,y:r.top},element:button,type:'trips',
    items:list.map(t=>({title:t.title,meta:`${t.date.short} · ${t.stops.length} 个地点`,select:()=>onSelect(t.id)}))});
}

const viewport=element.querySelector('.tl-main');
function click(event){const b=event.target.closest('[data-id],[data-year],[data-act]');if(!b)return;if(b.dataset.id)onSelect(b.dataset.id);else if(b.dataset.year)onScope({type:'year',year:Number(b.dataset.year)});else if(b.dataset.act==='all-years')onScope({type:'all'});else if(b.dataset.act==='timeline-group')showTimelineGroup(b);}
// Events keep bubbling: document listeners (render wake-up, story shortcuts) still see them.
// The year strip normally sits inside the timeline, so listen once there.
element.addEventListener('click',click);if(!element.contains(yearsElement))yearsElement.addEventListener('click',click);
function keyboard(event){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;if(event.target.closest('#year-filter')){const buttons=[...yearsElement.children],i=buttons.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(event.key==='ArrowRight'?1:-1)));buttons[next]?.focus();}else{viewport.scrollLeft=event.key==='Home'?0:event.key==='End'?viewport.scrollWidth:viewport.scrollLeft+(event.key==='ArrowRight'?160:-160);timelineAtLatest=viewport.scrollWidth-viewport.clientWidth-viewport.scrollLeft<2;}event.preventDefault();}
viewport.addEventListener('keydown',keyboard);yearsElement.addEventListener('keydown',keyboard);
viewport.addEventListener('scroll',()=>{if(Math.abs(viewport.clientWidth-timelineViewportWidth)<=1)timelineAtLatest=viewport.scrollWidth-viewport.clientWidth-viewport.scrollLeft<2;},{passive:true});
const resize=new ResizeObserver(()=>{if(Math.abs(viewport.clientWidth-timelineViewportWidth)>1)renderTimeline();});resize.observe(viewport);
return {render:renderTimeline,renderYears,highlight(ref){for(const b of element.querySelectorAll('[data-id]'))b.classList.toggle('on',b.dataset.id===ref?.id);},scrollTo(ref){const b=[...element.querySelectorAll('[data-id]')].find(b=>b.dataset.id===ref?.id);b?.scrollIntoView({block:'nearest',inline:'nearest'});},dispose(){resize.disconnect();cancelAnimationFrame(timelineFrame);element.removeEventListener('click',click);yearsElement.removeEventListener('click',click);viewport.removeEventListener('keydown',keyboard);yearsElement.removeEventListener('keydown',keyboard);}};
}
