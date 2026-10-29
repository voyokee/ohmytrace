import {periodText} from '../life/schema.js';
import {html} from '../../vendor/htm-preact/standalone.module.js';

// First use inside the earth sheet: reveal what the photos produced, replay it once,
// ask at most three residence questions, then hand over to naming stages or a year review.
// FirstUseService owns the state; this only presents it over the globe.
const Action=({action,primary=false,children,...attrs})=>html`<button type="button" data-first-action=${action} class=${primary?'earth-primary':'earth-first-button'} ...${attrs}>${children}</button>`;
const Stat=({n,unit})=>html`<span><b>${String(n)}</b>${unit}</span>`;
const KINDS={home:'现在居住',past:'曾经居住',travel:'旅行','pass-through':'路过',transit:'转机'};

export function mountEarthFirstUse({service,earthHome,onIntro=null,onOpenChapter,onShareYear,reducedMotion=false}){
  let mode='reveal',busy=false,changing=false,error='',timer=null,generation=0,open=false;
  const stop=()=>{clearTimeout(timer);timer=null;generation++;};
  const refresh=()=>{if(open)earthHome.render();};

  function Reveal({v,busy}){
    const c=v.counts,unlocated=c.photos-c.located;
    return html`<p class="earth-first-kicker">照片整理好了</p>
      <p class="earth-first-counts first-counts"><${Stat} n=${c.cities} unit="座城市" /><${Stat} n=${c.trips} unit="次旅行" />${c.countries?html`<${Stat} n=${c.countries} unit="个国家 / 地区" />`:null}</p>
      <p class="earth-muted">${`来自 ${c.located} 张带位置的照片${unlocated>0?`，另有 ${unlocated} 张没有位置`:''}。城市、居住地和旅行都是按拍摄时间和地点推断的，之后可以改。`}</p>
      <div class="earth-first-actions"><${Action} action="questions" primary disabled=${busy}>${v.pending?'确认居住地 · 最多 3 问':'看看人生阶段'}</${Action}>${onIntro&&c.cities?html`<${Action} action="intro" disabled=${busy}>回放</${Action}>`:null}<${Action} action="finish" disabled=${busy}>先看地球</${Action}></div>`;
  }
  function Question({v,busy,changing,canUndo}){
    const q=v.question,when=q.kind==='home'?`你现在住在${q.place}，对吗？`:`${periodText(q.start,q.end)}，你住在${q.place}，对吗？`;
    return html`<p class="earth-first-kicker first-progress">${`问题 ${v.answered+1} / ${v.total}`}</p>
      <h2>${when}</h2>
      <p class="earth-muted">${`${q.photos} 张照片，${q.days} 个拍照日。照片看不出具体哪天搬家，以后可以再改。`}</p>${changing?html`<label class="earth-first-field">这段经历更像<select data-first-type="" aria-label="这段经历的类型" value=${q.kind} disabled=${busy}>${Object.entries(KINDS).map(([value,text])=>html`<option key=${value} value=${value}>${text}</option>`)}</select></label><div class="earth-first-actions"><${Action} action="change" primary disabled=${busy}>保存并继续</${Action}><${Action} action="skip" disabled=${busy}>跳过这项</${Action}></div>`:html`<div class="earth-first-actions"><${Action} action="confirm" primary disabled=${busy}>对</${Action}><${Action} action="edit" disabled=${busy}>改一下</${Action}><${Action} action="skip" disabled=${busy}>跳过这项</${Action}></div>`}<div class="earth-first-actions">${canUndo&&html`<${Action} action="undo" class="earth-first-link" disabled=${busy}>撤销上次确认</${Action}>`}<${Action} action="finish" class="earth-first-link" disabled=${busy}>先看地球</${Action}></div>`;
  }
  function Drafts({v,busy,canUndo}){
    const many=v.chapters.length>1,review=!many&&v.year&&v.counts.trips;
    return html`<p class="earth-first-kicker">${v.chapters.length?'人生阶段草稿':'整理完成'}</p>
      <p class="earth-muted">${v.chapters.length?'按照片时间分成了这几段。起个名字就算确认，也可以之后再起。':'照片还不够推断住过哪里，可以先看看去过的地方。'}</p>${v.chapters.length?html`<div class="first-drafts">${v.chapters.map(c=>html`<${Action} key=${c.id} action="name" class="earth-first-draft" data-chapter-id=${c.id} disabled=${busy}><strong>${c.title}</strong><small>${periodText(c.start,c.end)+(c.confirmed?' · 已确认':' · 推断')}</small></${Action}>`)}</div>`:null}<div class="earth-first-actions">${review?html`<${Action} action="year" primary disabled=${busy}>${`生成 ${v.year} 年度回顾`}</${Action}>`:null}<${Action} action="finish" primary=${!review&&!many} disabled=${busy}>去地球上看看</${Action}></div>${canUndo&&html`<${Action} action="undo" class="earth-first-link" disabled=${busy}>撤销上次确认</${Action}>`}`;
  }
  function FirstUse({v,mode,busy,changing,error,canUndo}){
    if(!v)return html`<div class="earth-first" />`;
    const step=mode==='reveal'?'reveal':v.pending?'question-'+v.answered:'drafts';
    return html`<div class="earth-first" data-step=${step} onClick=${click}>${step==='reveal'?html`<${Reveal} v=${v} busy=${busy} />`:v.pending?html`<${Question} v=${v} busy=${busy} changing=${changing} canUndo=${canUndo} />`:html`<${Drafts} v=${v} busy=${busy} canUndo=${canUndo} />`}${error&&html`<p role="alert" class="earth-first-error">${error}</p>`}</div>`;
  }
  function click(event){const b=event.target.closest('[data-first-action]');if(b){event.stopPropagation();void act(b);}}
  function render(){return html`<${FirstUse} v=${service.view()} mode=${mode} busy=${busy} changing=${changing} error=${error} canUndo=${service.canUndo} />`;}

  function host(){earthHome.host({mode:'first',height:'half',render,onEscape:()=>{if(!busy)void finish().catch(e=>{error=e.message;refresh();});}});}
  function close(){stop();open=false;earthHome.release();}
  async function finish(){await service.skip();await service.finish();close();}
  async function intro(){
    stop();if(!onIntro){mode='questions';refresh();return;}
    // The story player hides the sheet while it plays; it comes back on the questions.
    await onIntro(()=>{mode='questions';changing=false;if(open&&!earthHome.hosting)host();else refresh();});
  }
  async function act(b){
    if(busy)return;stop();const action=b.dataset.firstAction,value=b.closest('.earth-first')?.querySelector('[data-first-type]')?.value;
    busy=true;error='';refresh();
    try{
      if(action==='finish'){await finish();return;}
      if(action==='intro'){busy=false;await intro();return;}
      if(action==='questions'){mode='questions';changing=false;}
      if(action==='edit')changing=true;
      if(['confirm','change','skip'].includes(action)){await service.answer(action,value);mode='questions';changing=false;}
      if(action==='undo')await service.undo();
      if(action==='name'){await service.finish();close();onOpenChapter(b.dataset.chapterId);return;}
      if(action==='year'){const year=service.view().year;await service.finish();close();onShareYear(year);return;}
    }catch(e){error=e.message;}
    finally{busy=false;refresh();}
  }

  return {
    /** auto: a first import just finished, so the reveal replays on its own (unless motion is reduced). */
    present({auto=false,resume=false}={}){
      const v=service.view();if(!v||v.finished)return false;
      stop();mode=resume&&v.answered?'questions':'reveal';changing=false;error='';open=true;
      host();
      if(auto&&mode==='reveal'&&!reducedMotion&&onIntro&&v.counts.cities){const ticket=generation;timer=setTimeout(()=>{if(ticket===generation&&open)void intro().catch(e=>{error=e.message;refresh();});},1200);}
      return true;
    },
    get isOpen(){return open&&earthHome.hosting;},
  };
}
