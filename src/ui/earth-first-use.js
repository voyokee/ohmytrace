import {periodText} from '../life/schema.js';

// First use inside the earth sheet: reveal what the photos produced, replay it once,
// ask at most three residence questions, then hand over to naming stages or a year review.
// FirstUseService owns the state; this only presents it over the globe.
const node=(tag,attrs={},...children)=>{const el=document.createElement(tag);for(const [k,v]of Object.entries(attrs))if(v!=null)el.setAttribute(k,String(v));for(const c of children.flat())if(c!=null)el.append(typeof c==='string'?document.createTextNode(c):c);return el;};
const button=(label,action,primary=false,attrs={})=>node('button',{type:'button','data-first-action':action,class:primary?'earth-primary':'earth-first-button',...attrs},label);
const stat=(n,unit)=>node('span',{},node('b',{},String(n)),unit);
const KINDS={home:'现在居住',past:'曾经居住',travel:'旅行','pass-through':'路过',transit:'转机'};

export function mountEarthFirstUse({service,earthHome,onIntro=null,onOpenChapter,onShareYear,reducedMotion=false}){
  let mode='reveal',busy=false,changing=false,error='',timer=null,generation=0,open=false;
  const stop=()=>{clearTimeout(timer);timer=null;generation++;};
  const refresh=()=>{if(open)earthHome.render();};

  function reveal(v){
    const c=v.counts,unlocated=c.photos-c.located;
    return [node('p',{class:'earth-first-kicker'},'照片整理好了'),
      node('p',{class:'earth-first-counts first-counts'},stat(c.cities,'座城市'),stat(c.trips,'次旅行'),c.countries?stat(c.countries,'个国家 / 地区'):null),
      node('p',{class:'earth-muted'},`来自 ${c.located} 张带位置的照片${unlocated>0?`，另有 ${unlocated} 张没有位置`:''}。城市、居住地和旅行都是按拍摄时间和地点推断的，之后可以改。`),
      node('div',{class:'earth-first-actions'},button(v.pending?'确认居住地 · 最多 3 问':'看看人生阶段','questions',true),onIntro&&c.cities?button('回放','intro'):null,button('先看地球','finish'))];
  }
  function question(v){
    const q=v.question,when=q.kind==='home'?`你现在住在${q.place}，对吗？`:`${periodText(q.start,q.end)}，你住在${q.place}，对吗？`;
    const out=[node('p',{class:'earth-first-kicker first-progress'},`问题 ${v.answered+1} / ${v.total}`),node('h2',{},when),
      node('p',{class:'earth-muted'},`${q.photos} 张照片，${q.days} 个拍照日。照片看不出具体哪天搬家，以后可以再改。`)];
    if(changing){
      const select=node('select',{'data-first-type':'','aria-label':'这段经历的类型'});
      for(const [value,text]of Object.entries(KINDS)){const o=node('option',{value},text);if(value===q.kind)o.selected=true;select.append(o);}
      out.push(node('label',{class:'earth-first-field'},'这段经历更像',select),node('div',{class:'earth-first-actions'},button('保存并继续','change',true),button('跳过这项','skip')));
    }else out.push(node('div',{class:'earth-first-actions'},button('对','confirm',true),button('改一下','edit'),button('跳过这项','skip')));
    out.push(node('div',{class:'earth-first-actions'},service.canUndo?button('撤销上次确认','undo',false,{class:'earth-first-link'}):null,button('先看地球','finish',false,{class:'earth-first-link'})));
    return out;
  }
  function drafts(v){
    const many=v.chapters.length>1,review=!many&&v.year&&v.counts.trips;
    const out=[node('p',{class:'earth-first-kicker'},v.chapters.length?'人生阶段草稿':'整理完成'),
      node('p',{class:'earth-muted'},v.chapters.length?'按照片时间分成了这几段。起个名字就算确认，也可以之后再起。':'照片还不够推断住过哪里，可以先看看去过的地方。')];
    if(v.chapters.length)out.push(node('div',{class:'first-drafts'},v.chapters.map(c=>button([node('strong',{},c.title),node('small',{},periodText(c.start,c.end)+(c.confirmed?' · 已确认':' · 推断'))],'name',false,{class:'earth-first-draft','data-chapter-id':c.id}))));
    out.push(node('div',{class:'earth-first-actions'},review?button(`生成 ${v.year} 年度回顾`,'year',true):null,button('去地球上看看','finish',!review&&!many)));
    if(service.canUndo)out.push(button('撤销上次确认','undo',false,{class:'earth-first-link'}));
    return out;
  }
  function render(){
    const v=service.view(),box=node('div',{class:'earth-first'});
    if(!v)return box;
    const step=mode==='reveal'?'reveal':v.pending?'question-'+v.answered:'drafts';box.dataset.step=step;
    box.append(...(step==='reveal'?reveal(v):v.pending?question(v):drafts(v)));
    if(error)box.append(node('p',{role:'alert',class:'earth-first-error'},error));
    for(const el of box.querySelectorAll('button,select'))el.disabled=busy;
    box.addEventListener('click',event=>{const b=event.target.closest('[data-first-action]');if(b)void act(b);});
    return box;
  }

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
