const date=d=>d.precision==='ongoing'?'现在':d.precision==='unknown'?'时间待确认':d.value.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1 年 $2 月 $3 日').replace(/^(\d{4})-(\d{2})$/,'$1 年 $2 月').replace(/^(\d{4})$/,'$1 年');
const node=(tag,text,attrs={})=>{const el=document.createElement(tag);if(text)el.textContent=text;for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
export function mountFirstUse({service,onOpenChapter,onShareYear,onIntro=null,reducedMotion=false}){
 const dialog=node('dialog','',{id:'first-use-dialog',class:'dialog glass','aria-label':'确认你的人生阶段'});document.body.append(dialog);
 let mode='reveal',busy=false,changing=false,error='',timer=null,generation=0;
 const button=(text,action,primary=false)=>node('button',text,{'data-first-action':action,type:'button',class:primary?'btn primary':'btn'});
 const stop=()=>{clearTimeout(timer);timer=null;generation++;};
 function render(){
  const v=service.view();if(!v)return;dialog.replaceChildren();const head=node('div','',{class:'dlg-head'});head.append(node('h3',mode==='reveal'?'这是你的地球':v.pending?'轻确认':'人生阶段草稿'),button('先看地球','finish'));dialog.append(head);const body=node('div','',{class:'dlg-body scroll'});
  if(mode==='reveal'){
   body.append(node('p',`${v.counts.cities} 座城市 · ${v.counts.trips} 次旅行${v.counts.countries?' · '+v.counts.countries+' 个国家或地区':''}`,{class:'first-counts'}),node('p','根据照片地点和时间整理；这些推断都可以修改。',{class:'hint'}));
   if(onIntro&&v.counts.cities)body.append(button('回放我的足迹','intro'));
   body.append(button(v.pending?'开始轻确认 · 最多 3 问':'看看阶段草稿','questions',true));
  }else if(v.pending){
   const q=v.question;body.append(node('p',`问题 ${v.answered+1} / ${v.total}`,{class:'first-progress'}),node('h2',q.kind==='home'?`你现在住在${q.place}，对吗？`:`${date(q.start)}到${date(q.end)}，你住在${q.place}，对吗？`),node('p',`${q.photos} 张照片 · ${q.days} 个拍照日。这是照片观测支持的时间范围，实际搬家时间仍待确认。`,{class:'hint'}));
   if(changing){const label=node('label','这段经历更像什么？'),select=node('select','',{'data-first-type':'', 'aria-label':'这段经历的类型'});for(const[value,text]of Object.entries({home:'现在居住',past:'曾经居住',travel:'旅行','pass-through':'路过',transit:'转机'})){const o=node('option',text,{value});if(value===q.kind)o.selected=true;select.append(o);}label.append(select);body.append(label,button('保存并继续','change',true));}
   else body.append(button('对','confirm',true),button('改一下','edit'));
   body.append(button('跳过这项','skip'));if(service.canUndo)body.append(button('撤销上次确认','undo'));
  }else{
   body.append(node('p',v.chapters.length?'阶段草稿已按已有照片时间生成，你只需给它们起名字。':'已整理到地图。照片还不足以推断居住阶段，可先回顾去过的地方。'));
   const list=node('div','',{class:'first-drafts'});for(const c of v.chapters){const b=button(c.title+' · '+(c.confirmed?'人工确认':'推断')+' · '+date(c.start)+'—'+date(c.end),'name');b.dataset.chapterId=c.id;list.append(b);}body.append(list);
   if(service.canUndo)body.append(button('撤销上次确认','undo'));
   if(v.chapters.length>1)body.append(node('p','先给一段人生起个名字，之后可以逐段回放。',{class:'hint'}));else if(v.year)body.append(button(`生成 ${v.year} 年度回顾`,'year',true));
   body.append(button('去地球上看看','finish',!v.year));
  }
  if(error)body.append(node('p',error,{role:'alert'}));dialog.append(body);for(const b of dialog.querySelectorAll('button,select'))b.disabled=busy;
 }
 async function finish(){stop();await service.skip();await service.finish();dialog.close();}
 async function intro(){stop();if(!onIntro){mode='questions';render();return;}dialog.close();await onIntro(()=>{mode='questions';changing=false;render();if(!dialog.open)dialog.showModal();});}
 dialog.addEventListener('click',async e=>{const b=e.target.closest('[data-first-action]');if(!b||busy)return;stop();const action=b.dataset.firstAction;busy=true;error='';
  try{if(action==='finish'){await finish();return;}if(action==='intro'){await intro();return;}if(action==='questions'){mode='questions';changing=false;}
   if(action==='edit')changing=true;
   if(['confirm','change','skip'].includes(action)){const value=dialog.querySelector('[data-first-type]')?.value;render();await service.answer(action,value);mode='questions';changing=false;}
   if(action==='undo')await service.undo();
   if(action==='name'){await service.finish();dialog.close();onOpenChapter(b.dataset.chapterId);return;}
   if(action==='year'){await service.finish();dialog.close();onShareYear(service.view().year);return;}
  }catch(e){error=e.message;}finally{busy=false;if(dialog.open)render();}
 });
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)void finish().catch(e=>{error=e.message;render();});});
 return {open({resume=false}={}){const v=service.view();if(!v||v.finished)return false;stop();mode=resume&&v.answered?'questions':'reveal';changing=false;error='';render();if(!dialog.open)dialog.showModal();if(mode==='reveal'&&!reducedMotion&&onIntro&&v.counts.cities){const ticket=generation;timer=setTimeout(()=>{if(ticket===generation&&dialog.open)void intro().catch(e=>{error=e.message;if(!dialog.open)dialog.showModal();render();});},1200);}return true;},get isOpen(){return dialog.open;},dispose(){stop();dialog.remove();}};
}
