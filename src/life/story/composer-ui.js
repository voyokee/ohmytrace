import {tripCountsAsTravel} from '../travel-policy.js';
import {composeStory,setStoryMemories,storyYears} from './compose.js';
import {projectShare} from './share.js';
import {esc,periodText,memoryInStory} from './schema.js';
import {storyThumbnail} from './thumbnail.js';
import {createPublishingPanel} from './publishing/panel.js';

const sceneNames={globe:'开场',chapter:'人生阶段',trip:'旅行概览',place:'地点飞入',memory:'记忆时刻',closing:'结束'};
export function mountStoryComposer({getDataset,getScope=()=>({type:'all'}),onPreview,onExportPackage,saveBlob,publisher=null}){
  const dialog=document.createElement('dialog');dialog.id='story-composer';dialog.className='dialog glass';dialog.setAttribute('aria-label','编辑与分享回放');document.body.append(dialog);
  let story=null,images={},review=null,approved=false,source='all',busy=false,simple=true,origin=null,shared=null,custom=null,sourceScope=null,originScope=null;
  const publishing=createPublishingPanel({publisher,getArtifact:()=>review,isApproved:()=>approved&&!!review});
  const data=()=>getDataset();
  const availableMemories=()=>{const d=data();return d.memories.filter(m=>memoryInStory(story,d,m));};
  function dirty(){review=null;approved=false;publishing.refresh();}
  function editText(el){
    if(el.hasAttribute('data-story-field'))story[el.dataset.storyField]=el.value;
    else if(el.hasAttribute('data-story-scene-field'))story.orderedScenes[+el.closest('[data-story-scene]').dataset.storyScene][el.dataset.storySceneField]=el.value;
    else if(el.hasAttribute('data-story-place-label')){const id=el.dataset.storyPlaceLabel;if(el.value.trim())story.privacySettings.placeLabels[id]=el.value.trim();else delete story.privacySettings.placeLabels[id];}
    else return false;
    dirty();dialog.querySelector('[data-story-review-panel]')?.replaceChildren();
    for(const button of dialog.querySelectorAll('[data-story-json],[data-story-package]'))button.disabled=true;
    return true;
  }
  function error(e){const el=dialog.querySelector('[data-story-error]');if(el)el.textContent=e.message;}
  function render(){
    if(simple&&story){renderSimple();return;}
    const d=data(),years=storyYears(d);
    const placeIds=new Set(story?[...d.chapters.filter(c=>story.selectedChapterIds.includes(c.id)).flatMap(c=>c.homeAnchors),...d.visits.filter(v=>story.selectedTripIds.includes(v.tripId)).map(v=>v.placeId),...d.memories.filter(m=>story.includedMemories.includes(m.id)).flatMap(m=>m.placeIds)]:[]);
    // Re-rendering replaces the markup; keep the optional scene list as the visitor left it.
    const scenesOpen=dialog.querySelector('[data-story-scene-list]')?.open?' open':'';
    dialog.innerHTML=`<div class="dlg-head"><h3>编辑与分享</h3><button class="x" data-story-composer-close aria-label="关闭故事编辑">×</button></div><div class="dlg-body scroll">
      <p class="hint">回放只使用你已记录的足迹，不会编造经历。分享前请在下方确认隐私范围。</p>
      <div class="story-source"><label class="life-field">回放范围<select data-story-source><option value="all">全部足迹</option>
        ${d.chapters.filter(c=>!c.hidden).map(c=>`<option value="chapter:${esc(c.id)}">人生阶段 · ${esc(c.title)}</option>`).join('')}
        ${['place','residence'].includes(scope().type)?`<option value="${esc(source)}">当前记录</option>`:''}
        ${years.map(y=>`<option value="year:${y}">${y} 年</option>`).join('')}
        ${d.trips.filter(t=>tripCountsAsTravel(d,t)).map(t=>`<option value="trip:${esc(t.id)}">旅行 · ${esc(t.title)}</option>`).join('')}</select></label><button class="btn" data-story-generate>按此范围重新生成</button></div>
      ${story?`<label class="life-field">标题<input data-story-field="title" value="${esc(story.title)}" maxlength="200"></label>
      <label class="life-field">说明<textarea data-story-field="description" maxlength="4000" rows="2">${esc(story.description)}</textarea></label>
      <label class="life-field">视觉主题<select data-story-field="visualTheme">${Object.entries({atlas:'金色足迹',night:'夜景灯火',paper:'素笺叙事'}).map(([v,t])=>`<option value="${v}" ${story.visualTheme===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <details data-story-scene-list${scenesOpen}><summary>调整每一段 · ${story.orderedScenes.length}</summary><ol class="story-scenes">${story.orderedScenes.map((s,i)=>`<li data-story-scene="${i}"><div class="story-scene-heading"><span>${i+1} · ${sceneNames[s.kind]}</span><span><button class="btn sm" data-story-move="-1" ${i===0?'disabled':''} aria-label="上移镜头">↑</button><button class="btn sm" data-story-move="1" ${i===story.orderedScenes.length-1?'disabled':''} aria-label="下移镜头">↓</button><button class="btn sm" data-story-remove>移除</button></span></div>
        <label class="life-field">标题<input data-story-scene-field="title" maxlength="200" value="${esc(s.title)}"></label><label class="life-field">说明<textarea data-story-scene-field="description" maxlength="4000" rows="1">${esc(s.description)}</textarea></label><small>${esc(periodText(s))}</small></li>`).join('')}</ol></details>
      <fieldset class="story-privacy"><legend>分享范围与隐私</legend>
      <label class="life-field">地点精度<select data-story-policy="locationMode"><option value="city" ${story.privacySettings.locationMode==='city'?'selected':''}>区域模糊：0.1° 网格（纬向约 11 km）</option><option value="hidden" ${story.privacySettings.locationMode==='hidden'?'selected':''}>隐藏全部坐标</option><option value="precise" ${story.privacySettings.locationMode==='precise'?'selected':''}>公开精确坐标（包括所选住宅）</option></select></label>
      <p class="hint">区域模糊不是行政城市边界。住宅默认改名为“居住区域”。公开名称可逐项修改，避免名称泄露门牌。原始路径、EXIF 和设备证据始终排除。</p>
      <label><input type="checkbox" data-story-policy="includeNotes" ${story.privacySettings.includeNotes?'checked':''}>包含所选旅行的原始备注 / 已选文字记忆</label><br>
      <label><input type="checkbox" data-story-policy="includePhotos" ${story.privacySettings.includePhotos?'checked':''}>允许包含下面逐张选择的照片</label>
      <details><summary>逐项审查旅行</summary><div class="life-options">${d.trips.filter(t=>story.selectedTripIds.includes(t.id)).map(t=>`<label><input type="checkbox" data-story-trip="${esc(t.id)}" ${story.privacySettings.excludedTripIds.includes(t.id)?'':'checked'}>${esc(t.title)}</label>`).join('')}</div></details>
      <details><summary>逐项审查地点</summary><div class="life-options">${d.places.filter(p=>placeIds.has(p.id)).map(p=>`<div><label><input type="checkbox" data-story-hide-place="${esc(p.id)}" ${story.privacySettings.hiddenPlaceIds.includes(p.id)?'checked':''}>隐藏此地点坐标 · ${esc(p.name)}</label><label class="life-field">公开名称<input data-story-place-label="${esc(p.id)}" maxlength="200" value="${esc(story.privacySettings.placeLabels[p.id]??'')}" placeholder="留空使用隐私规则生成的名称"></label></div>`).join('')}</div></details>
      <details><summary>逐张选择记忆（默认全部排除）</summary><div class="life-options">${availableMemories().map(m=>`<div><label><input type="checkbox" data-story-memory="${esc(m.id)}" ${story.includedMemories.includes(m.id)?'checked':''}>${esc(m.title||'未命名记忆')} · ${esc(m.kind)}</label>${m.kind==='photo'&&story.includedMemories.includes(m.id)?`<label class="btn sm">${images[m.id]?'重新选择已授权图片':'选择获准分享的图片'}<input type="file" accept="image/jpeg,image/png,image/webp" data-story-image="${esc(m.id)}" hidden></label><small>${images[m.id]?'已生成去除 EXIF 的缩略图':'不选择文件时仅分享记忆文字和地点，不包含照片'}</small>`:''}</div>`).join('')||'<p class="hint">没有照片也能完整生成人生故事。</p>'}</div></details>
      </fieldset>
      <div class="row-actions"><button class="btn" data-story-review>审查最终分享内容</button><button class="btn primary" data-story-preview>预览最终回放</button></div>
      <section data-story-review-panel>${review?`<h4>这份作品将包含</h4><p>${review.chapters.length} 个人生阶段 · ${review.trips.length} 次旅行 · ${review.places.length} 个地点 · ${review.memories.length} 条记忆 · ${review.memories.filter(m=>m.image).length} 张缩略图</p><p class="hint">${review.privacySettings.includeNotes?'包含所选记录的原始备注。':'不含原始备注。'}${review.privacySettings.locationMode==='precise'?'公开所选地点精确坐标。':'未公开精确坐标。'} 下面是实际导出内容。</p><details><summary>检查作品内容</summary><pre>${esc(JSON.stringify(review,null,2))}</pre></details><label><input type="checkbox" data-story-approve ${approved?'checked':''}>我已逐项检查，确认这些内容可公开</label>`:''}</section>
      <div class="row-actions"><button class="btn" data-story-json ${!approved?'disabled':''}>导出分享文件</button><button class="btn" data-story-package ${!approved||busy?'disabled':''}>导出静态分享包</button></div>
      <p class="hint">分享包需部署到静态网站，在线发布只上传经审核的作品。修改任意内容后须重新审查。编辑草稿仅在本页保留。每份作品最多 64 张缩略图（最长边 768 像素、每张 256 KiB），分享文件上限 24 MiB。</p>`:''}<p data-story-progress role="status"></p><p data-story-error role="alert"></p></div>`;
    dialog.querySelector('[data-story-source]').value=source;
    if(story){dialog.querySelector('.dlg-body').append(publishing.element);publishing.refresh();}
  }
  // Default share sheet: pick a period, then one button. Privacy uses the safe
  // defaults (blurred places, no notes or photos); everything else is under 更多设置.
  function ranges(){
    const d=data(),years=new Set(storyYears(d)),now=new Date().getFullYear(),out=[];
    for(const [kind,key,label]of [['place','places','这座城市'],['residence','residences','这段居住'],['chapter','chapters','这个阶段']])if(origin?.startsWith(kind+':')&&d[key].some(e=>kind+':'+e.id===origin&&!e.hidden))out.push([origin,label+(sourceScope?.year?' · '+sourceScope.year+' 年':'')]);
    if(origin?.startsWith('trip:')){const t=d.trips.find(t=>'trip:'+t.id===origin);if(t)out.push([origin,'这次旅行']);}
    if(years.has(now))out.push([`year:${now}`,'今年']);if(years.has(now-1))out.push([`year:${now-1}`,'去年']);
    if(origin?.startsWith('year:')&&!out.some(([value])=>value===origin))out.push([origin,`${origin.slice(5)} 年`]);
    out.push(['all','全部'],['custom','自定义']);return out;
  }
  function renderSimple(){
    const places=new Set(story.orderedScenes.filter(sc=>sc.placeId).map(sc=>sc.placeId)).size,trips=story.selectedTripIds.length,empty=!trips&&!places;
    const month=new Date().toISOString().slice(0,7);
    dialog.innerHTML=`<div class="dlg-head"><h3>分享</h3><button class="x" data-story-composer-close aria-label="关闭分享">×</button></div><div class="dlg-body share-simple">
      <p class="share-label">分享哪段时间</p>
      <div class="share-ranges" role="group" aria-label="分享时间">${ranges().map(([value,label])=>`<button class="share-range${(value==='custom'?custom:source===value&&!custom)?' on':''}" data-share-range="${esc(value)}" aria-pressed="${(value==='custom'?!!custom:source===value&&!custom)}">${label}</button>`).join('')}</div>
      ${custom?`<div class="share-custom"><input type="month" data-share-from value="${esc(custom.from)}" max="${month}" aria-label="开始月份"><span>到</span><input type="month" data-share-to value="${esc(custom.to)}" max="${month}" aria-label="结束月份"></div>`:''}
      <p class="share-summary">${empty?'这段时间没有足迹':`${trips} 次旅行 · ${places} 个地方`}</p>
      ${shared?.url?`<div class="share-link"><a href="${esc(shared.url)}" target="_blank" rel="noopener noreferrer" data-share-url>${esc(shared.url)}</a><button class="btn" data-share-copy>复制链接</button></div>`:''}
      <button class="btn primary share-main" data-share-go ${empty||busy?'disabled':''}>${busy?'正在生成…':shared?'重新分享':'分享'}</button>
      <button class="btn share-secondary" data-story-preview ${empty?'disabled':''}>先预览</button>
      <p class="share-note">地点只精确到约 10 公里，不含照片和备注。</p>
      <button class="share-more" data-share-more>更多设置</button>
      <p data-story-progress role="status"></p><p data-story-error role="alert"></p></div>`;
  }
  async function shareNow(){
    review=projectShare(data(),story,{images});approved=true;if(!review.orderedScenes.length)throw new Error('这段时间没有可分享的足迹');
    busy=true;render();
    try{
      if(publisher){shared=await publisher.publish(review,{visibility:'unlisted',idempotencyKey:crypto.randomUUID()});return;}
      const file=new File([JSON.stringify(review)],`${story.title||'足迹'}.story.json`,{type:'application/json'});
      if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:story.title});shared={file:true};return;}
      const saved=await saveBlob(file.name,file);if(saved?.saved!==false)shared={file:true};
    }finally{busy=false;render();if(shared?.file){const el=dialog.querySelector('[data-story-progress]');if(el)el.textContent='分享文件已生成，可以发给朋友用足迹分享页打开。';}}
  }
  function scope(){if(sourceScope)return structuredClone(sourceScope);const [type,...rest]=source.split(':');return type==='year'?{type,year:Number(rest.join(':'))}:type==='range'?{type,start:rest[0],end:rest[1]}:type==='all'?{type}:{type,id:rest.join(':')};}
  function generate(){const s=scope(),entity=s.type==='chapter'?data().chapters.find(c=>c.id===s.id):s.type==='trip'?data().trips.find(t=>t.id===s.id):s.type==='place'?data().places.find(p=>p.id===s.id):s.type==='residence'?data().residences.find(r=>r.id===s.id):null;story=composeStory(data(),{scope:s,title:entity?(entity.title||entity.name):s.type==='year'?`${s.year} 年`:s.type==='range'?`${s.start} 至 ${s.end}`:'OnceHere 足迹回顾'});images={};dirty();render();}
  dialog.addEventListener('input',e=>editText(e.target));
  dialog.addEventListener('change',e=>{const el=e.target;if(!el.matches('[data-share-from],[data-share-to]'))return;
    custom[el.hasAttribute('data-share-from')?'from':'to']=el.value;
    try{if(custom.from&&custom.to){sourceScope=null;source=`range:${custom.from}:${custom.to}`;shared=null;generate();}}catch(err){error(err);}},true);
  dialog.addEventListener('change',async e=>{
    const el=e.target;if(publishing.element.contains(el))return;try{
      if(el.hasAttribute('data-story-source')){sourceScope=null;source=el.value;return;}
      if(editText(el))return;
      if(el.hasAttribute('data-story-policy'))story.privacySettings[el.dataset.storyPolicy]=el.type==='checkbox'?el.checked:el.value;
      if(el.hasAttribute('data-story-trip')){const id=el.dataset.storyTrip;story.privacySettings.excludedTripIds=el.checked?story.privacySettings.excludedTripIds.filter(x=>x!==id):[...story.privacySettings.excludedTripIds,id];}
      if(el.hasAttribute('data-story-hide-place')){const id=el.dataset.storyHidePlace;story.privacySettings.hiddenPlaceIds=el.checked?[...story.privacySettings.hiddenPlaceIds,id]:story.privacySettings.hiddenPlaceIds.filter(x=>x!==id);}
      if(el.hasAttribute('data-story-memory')){const id=el.dataset.storyMemory;story=setStoryMemories(story,data(),el.checked?[...story.includedMemories,id]:story.includedMemories.filter(x=>x!==id));}
      if(el.hasAttribute('data-story-image')&&el.files[0])images[el.dataset.storyImage]=await storyThumbnail(el.files[0]);
      if(el.hasAttribute('data-story-approve')){approved=el.checked;render();return;}
      dirty();render();
    }catch(e){error(e);}
  });
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;try{
      if(b.hasAttribute('data-story-composer-close')){dialog.close();return;}
      if(b.hasAttribute('data-share-range')){const value=b.dataset.shareRange;shared=null;sourceScope=value===origin?structuredClone(originScope):null;
        if(value==='custom'){const month=new Date().toISOString().slice(0,7);custom=custom||{from:`${new Date().getFullYear()}-01`,to:month};source=`range:${custom.from}:${custom.to}`;}else{custom=null;source=value;}
        generate();return;}
      if(b.hasAttribute('data-share-go')){await shareNow();return;}
      if(b.hasAttribute('data-share-copy')){try{await navigator.clipboard.writeText(shared.url);b.textContent='已复制';}catch{b.textContent='请长按链接复制';}return;}
      if(b.hasAttribute('data-share-more')){simple=false;render();return;}
      if(b.hasAttribute('data-story-generate')){generate();return;}
      const index=Number(b.closest('[data-story-scene]')?.dataset.storyScene);
      if(b.hasAttribute('data-story-move')){const target=index+Number(b.dataset.storyMove);[story.orderedScenes[index],story.orderedScenes[target]]=[story.orderedScenes[target],story.orderedScenes[index]];dirty();render();return;}
      if(b.hasAttribute('data-story-remove')){story.orderedScenes.splice(index,1);dirty();render();return;}
      if(b.hasAttribute('data-story-review')){review=projectShare(data(),story,{images});approved=false;render();return;}
      if(b.hasAttribute('data-story-preview')){const a=projectShare(data(),story,{images});if(!a.orderedScenes.length)throw new Error('至少保留一个镜头');dialog.close();await onPreview(a);return;}
      if(b.hasAttribute('data-story-json')&&approved&&review)await saveBlob('OnceHere-story.json',new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));
      if(b.hasAttribute('data-story-package')&&approved&&review){busy=true;await onExportPackage(review,message=>{dialog.querySelector('[data-story-progress]').textContent=message;});busy=false;}
    }catch(e){busy=false;error(e);}
  });
  return {
    // Quick replay composes with the same defaults so "编辑与分享" resumes exactly what was played.
    prepare(value){choose(value);custom=null;generate();return structuredClone(story);},
    open({resume=false,source:requested}={}){document.querySelector('#life-dialog')?.close();simple=true;shared=null;custom=null;if(!resume){choose(requested||getScope());generate();}else render();dialog.showModal();}};
  function choose(value){sourceScope=typeof value==='object'?structuredClone(value):null;source=typeof value==='string'?value:value.type==='year'?`year:${value.year}`:value.type==='range'?`range:${value.start}:${value.end}`:value.type==='all'?'all':`${value.type}:${value.id}`;origin=source;originScope=structuredClone(sourceScope);}
}
