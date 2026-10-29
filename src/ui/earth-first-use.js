import {periodText} from '../life/schema.js';
import {html} from '../../vendor/htm-preact/standalone.module.js';

// First use inside the earth sheet: reveal what the photos produced, replay it once,
// ask at most three residence questions, then hand over to naming stages or a year review.
// FirstUseService owns the state; this only presents it over the globe.
const Action=({action,primary=false,children,...attrs})=>html`<button type="button" data-first-action=${action} class=${primary?'earth-primary':'earth-first-button'} ...${attrs}>${children}</button>`;
const Stat=({n,unit})=>html`<span><b>${String(n)}</b>${unit}</span>`;
const KINDS={home:'现在居住',past:'曾经居住',travel:'旅行','pass-through':'路过',transit:'转机'};

export function mountEarthFirstUse({service,earthHome,onIntro=null,onOpenChapter,onShareYear,onRetry=()=>{},onDemo=null,reducedMotion=false}){
  let mode='reveal',busy=false,changing=false,error='',timer=null,generation=0,open=false,empty=null;
  const stop=()=>{clearTimeout(timer);timer=null;generation++;};
  const refresh=()=>{if(open)earthHome.render();};

  function Reveal({v,busy}){
    const c=v.counts,sparse=c.scanned>=50&&c.located<c.scanned*.2;
    return html`<p class="earth-first-kicker">照片整理好了</p>
      <p class="earth-first-counts first-counts"><${Stat} n=${c.cities} unit="座城市" /><${Stat} n=${c.trips} unit="次旅行" />${c.countries?html`<${Stat} n=${c.countries} unit="个国家 / 地区" />`:null}</p>
      <p class="earth-muted">${`读取了 ${c.scanned.toLocaleString()} 张照片，${c.located.toLocaleString()} 张带拍摄位置。城市、居住地和旅行都是按拍摄时间和地点推断的，之后可以改。`}</p>${sparse&&html`<p class="earth-muted">大部分照片没有记录位置。打开相机的位置信息后再导入，地图会更完整。</p>`}
      <div class="earth-first-actions"><${Action} action="questions" primary disabled=${busy}>${v.pending?'确认居住地 · 最多 3 问':'看看人生阶段'}</${Action}>${onIntro&&c.cities?html`<${Action} action="intro" disabled=${busy}>回放</${Action}>`:null}<${Action} action="finish" disabled=${busy}>${v.pending?'跳过，直接看地球':'先看地球'}</${Action}></div>${v.pending&&html`<p class="earth-first-hint">跳过的居住地仍按推断显示，之后可在「我的」里继续确认。</p>`}`;
  }
  function Question({v,busy,changing,canUndo}){
    const q=v.question,when=q.kind==='home'?`你现在住在${q.place}，对吗？`:`${periodText(q.start,q.end)}，你住在${q.place}，对吗？`;
    return html`<p class="earth-first-kicker first-progress">${`问题 ${v.answered+1} / ${v.total}`}</p>
      <h2>${when}</h2>
      <p class="earth-muted">${`${q.photos} 张照片，${q.days} 个拍照日。照片看不出具体哪天搬家，以后可以再改。`}</p>${changing?html`<label class="earth-first-field">这段经历更像<select data-first-type="" aria-label="这段经历的类型" value=${q.kind} disabled=${busy}>${Object.entries(KINDS).map(([value,text])=>html`<option key=${value} value=${value}>${text}</option>`)}</select></label><div class="earth-first-actions"><${Action} action="change" primary disabled=${busy}>保存并继续</${Action}><${Action} action="skip" disabled=${busy}>跳过这项</${Action}></div>`:html`<div class="earth-first-actions"><${Action} action="confirm" primary disabled=${busy}>对</${Action}><${Action} action="edit" disabled=${busy}>改一下</${Action}><${Action} action="skip" disabled=${busy}>跳过这项</${Action}></div>`}<div class="earth-first-actions">${canUndo&&html`<${Action} action="undo" class="earth-first-link" disabled=${busy}>撤销上次确认</${Action}>`}<${Action} action="finish" class="earth-first-link" disabled=${busy}>跳过剩下的问题</${Action}></div>`;
  }
  function Drafts({v,busy,canUndo}){
    const many=v.chapters.length>1,review=!many&&v.year&&v.counts.trips;
    return html`<p class="earth-first-kicker">${v.chapters.length?'人生阶段草稿':'整理完成'}</p>
      <p class="earth-muted">${v.chapters.length?'按照片时间分成了这几段。起个名字就算确认，也可以之后再起。':'照片还不够推断住过哪里，可以先看看去过的地方。'}</p>${v.chapters.length?html`<div class="first-drafts">${v.chapters.map(c=>html`<${Action} key=${c.id} action="name" class="earth-first-draft" data-chapter-id=${c.id} disabled=${busy}><strong>${c.title}</strong><small>${periodText(c.start,c.end)+(c.confirmed?' · 已确认':' · 推断')}</small></${Action}>`)}</div>`:null}<div class="earth-first-actions">${review?html`<${Action} action="year" primary disabled=${busy}>${`生成 ${v.year} 年度回顾`}</${Action}>`:null}<${Action} action="finish" primary=${!review&&!many} disabled=${busy}>去地球上看看</${Action}></div>${canUndo&&html`<${Action} action="undo" class="earth-first-link" disabled=${busy}>撤销上次确认</${Action}>`}`;
  }
  // A first import with no located photo: say why, and what to do, instead of an empty reveal.
  function Empty({scanned,busy}){
    return html`<div class="earth-first" data-step="empty" onClick=${click}><p class="earth-first-kicker">还放不到地球上</p>
      <h2>${scanned?`这 ${scanned.toLocaleString()} 张照片都没有拍摄位置`:'没有读到照片'}</h2>
      <p class="earth-muted">${scanned?'常见原因：相机设置里没有打开位置信息；微信保存的图片和截图也不带位置。':'相册里可能还没有照片，或这次没有选中照片。'}</p>
      ${scanned?html`<p class="earth-muted">打开方法：相机 → 设置 → 位置信息（不同手机叫法略有不同）。打开后新拍的照片会带上位置，可以先导入其他时间段的照片试试。</p>`:null}
      <div class="earth-first-actions"><${Action} action="retry" primary disabled=${busy}>换一批照片</${Action}>${onDemo&&!document.querySelector('#empty-demo')?.hidden&&html`<${Action} action="demo" disabled=${busy}>看看示例</${Action}>`}<${Action} action="finish" disabled=${busy}>先看地球</${Action}></div></div>`;
  }
  function FirstUse({v,mode,busy,changing,error,canUndo}){
    if(!v)return html`<div class="earth-first" />`;
    const step=mode==='reveal'?'reveal':v.pending?'question-'+v.answered:'drafts';
    return html`<div class="earth-first" data-step=${step} onClick=${click}>${step==='reveal'?html`<${Reveal} v=${v} busy=${busy} />`:v.pending?html`<${Question} v=${v} busy=${busy} changing=${changing} canUndo=${canUndo} />`:html`<${Drafts} v=${v} busy=${busy} canUndo=${canUndo} />`}${error&&html`<p role="alert" class="earth-first-error">${error}</p>`}</div>`;
  }
  function click(event){const b=event.target.closest('[data-first-action]');if(b){event.stopPropagation();void act(b);}}
  function render(){return empty?html`<${Empty} scanned=${empty.scanned} busy=${busy} />`:html`<${FirstUse} v=${service.view()} mode=${mode} busy=${busy} changing=${changing} error=${error} canUndo=${service.canUndo} />`;}

  function host(){earthHome.host({mode:'first',height:'half',render,onEscape:()=>{if(empty){close();return;}if(!busy)void finish().catch(e=>{error=e.message;refresh();});}});}
  function close(){stop();open=false;empty=null;earthHome.release();}
  async function finish(){await service.skip();await service.finish();close();}
  async function intro(){
    stop();if(!onIntro){mode='questions';refresh();return;}
    // The story player hides the sheet while it plays; it comes back on the questions.
    await onIntro(()=>{mode='questions';changing=false;if(open&&!earthHome.hosting)host();else refresh();});
  }
  async function act(b){
    if(busy)return;stop();
    // The empty step has no first-use state to skip or finish.
    if(empty){const action=b.dataset.firstAction;close();if(action==='retry')onRetry();if(action==='demo')onDemo?.();return;}
    const action=b.dataset.firstAction,value=b.closest('.earth-first')?.querySelector('[data-first-type]')?.value;
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
    /** No photo of a first import had a location; nothing was prepared, so the next import still counts as first. */
    explainEmpty({scanned=0}={}){stop();empty={scanned};open=true;host();},
    get isOpen(){return open&&earthHome.hosting;},
  };
}
