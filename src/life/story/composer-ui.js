import {composeStory,setStoryMemories} from './compose.js';
import {projectShare} from './share.js';
import {esc,periodText} from './schema.js';
import {storyThumbnail} from './thumbnail.js';

const sceneNames={globe:'全球概览',chapter:'人生阶段',trip:'旅行概览',place:'地点飞入',memory:'记忆时刻',closing:'结束'};
export function mountStoryComposer({getDataset,getScope=()=>({type:'all'}),onPreview,onExportPackage,saveBlob}){
  const dialog=document.createElement('dialog');dialog.id='story-composer';dialog.className='dialog glass';dialog.setAttribute('aria-label','生成人生故事');document.body.append(dialog);
  let story=null,images={},review=null,approved=false,source='all',busy=false;
  const data=()=>getDataset();
  const availableMemories=()=>{const d=data();return d.memories.filter(m=>m.tripIds.some(id=>story.selectedTripIds.includes(id))||d.chapters.some(c=>story.selectedChapterIds.includes(c.id)&&c.memoryIds.includes(m.id)));};
  function dirty(){review=null;approved=false;}
  function error(e){const el=dialog.querySelector('[data-story-error]');if(el)el.textContent=e.message;}
  function render(){
    const d=data(),years=[...new Set(d.trips.flatMap(t=>t.start.value?[+t.start.value.slice(0,4)]:[]))].sort((a,b)=>a-b);
    const placeIds=new Set(story?[...d.chapters.filter(c=>story.selectedChapterIds.includes(c.id)).flatMap(c=>c.homeAnchors),...d.visits.filter(v=>story.selectedTripIds.includes(v.tripId)).map(v=>v.placeId),...d.memories.filter(m=>story.includedMemories.includes(m.id)).flatMap(m=>m.placeIds)]:[]);
    dialog.innerHTML=`<div class="dlg-head"><h3>生成人生故事</h3><button class="x" data-story-composer-close aria-label="关闭故事编辑">×</button></div><div class="dlg-body scroll">
      <p class="hint">确定性地组织已有记录，不添加未经记录的经历。作品预览和分享均使用下方隐私范围。</p>
      <div class="story-source"><label class="life-field">故事范围<select data-story-source><option value="all">完整人生（全部现有记录）</option>
        ${d.chapters.map(c=>`<option value="chapter:${esc(c.id)}">人生阶段 · ${esc(c.title)}</option>`).join('')}
        ${years.map(y=>`<option value="year:${y}">${y} 年</option>`).join('')}
        ${d.trips.map(t=>`<option value="trip:${esc(t.id)}">旅行 · ${esc(t.title)}</option>`).join('')}</select></label><button class="btn" data-story-generate>生成镜头</button></div>
      ${story?`<label class="life-field">故事标题<input data-story-field="title" value="${esc(story.title)}" maxlength="200"></label>
      <label class="life-field">故事说明<textarea data-story-field="description" maxlength="4000" rows="2">${esc(story.description)}</textarea></label>
      <label class="life-field">视觉主题<select data-story-field="visualTheme">${Object.entries({atlas:'金色足迹',night:'夜景灯火',paper:'素笺叙事'}).map(([v,t])=>`<option value="${v}" ${story.visualTheme===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <details open><summary>镜头顺序 · ${story.orderedScenes.length}</summary><ol class="story-scenes">${story.orderedScenes.map((s,i)=>`<li data-story-scene="${i}"><div class="story-scene-heading"><span>${i+1} · ${sceneNames[s.kind]}</span><span><button class="btn sm" data-story-move="-1" ${i===0?'disabled':''} aria-label="上移镜头">↑</button><button class="btn sm" data-story-move="1" ${i===story.orderedScenes.length-1?'disabled':''} aria-label="下移镜头">↓</button><button class="btn sm" data-story-remove>移除</button></span></div>
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
      <section data-story-review-panel>${review?`<h4>这份作品将包含</h4><p>${review.chapters.length} 个人生阶段 · ${review.trips.length} 次旅行 · ${review.places.length} 个地点 · ${review.memories.length} 条记忆 · ${review.memories.filter(m=>m.image).length} 张缩略图</p><p class="hint">${review.privacySettings.includeNotes?'包含所选记录的原始备注。':'不含原始备注。'}${review.privacySettings.locationMode==='precise'?'公开所选地点精确坐标。':'未公开精确坐标。'} 下面是实际导出内容。</p><details><summary>检查作品 JSON</summary><pre>${esc(JSON.stringify(review,null,2))}</pre></details><label><input type="checkbox" data-story-approve ${approved?'checked':''}>我已逐项检查，确认这些内容可公开</label>`:''}</section>
      <div class="row-actions"><button class="btn" data-story-json ${!approved?'disabled':''}>导出 Story JSON</button><button class="btn" data-story-package ${!approved||busy?'disabled':''}>导出静态分享包</button></div>
      <p class="hint">分享包需部署到静态网站，无自动上传或云端一键分享。修改任意内容后须重新审查。编辑草稿仅在本页保留。</p>`:''}<p data-story-progress role="status"></p><p data-story-error role="alert"></p></div>`;
    dialog.querySelector('[data-story-source]').value=source;
  }
  function scope(){const [type,...rest]=source.split(':');return type==='year'?{type,year:Number(rest.join(':'))}:type==='all'?{type}:{type,id:rest.join(':')};}
  function generate(){const s=scope(),entity=s.type==='chapter'?data().chapters.find(c=>c.id===s.id):s.type==='trip'?data().trips.find(t=>t.id===s.id):null;story=composeStory(data(),{scope:s,title:entity?`${entity.title} · 人生故事`:s.type==='year'?`${s.year} 年的足迹`:'我的人生故事'});images={};dirty();render();}
  dialog.addEventListener('change',async e=>{
    const el=e.target;try{
      if(el.hasAttribute('data-story-source')){source=el.value;return;}
      if(el.hasAttribute('data-story-field'))story[el.dataset.storyField]=el.value;
      if(el.hasAttribute('data-story-scene-field'))story.orderedScenes[+el.closest('[data-story-scene]').dataset.storyScene][el.dataset.storySceneField]=el.value;
      if(el.hasAttribute('data-story-policy'))story.privacySettings[el.dataset.storyPolicy]=el.type==='checkbox'?el.checked:el.value;
      if(el.hasAttribute('data-story-trip')){const id=el.dataset.storyTrip;story.privacySettings.excludedTripIds=el.checked?story.privacySettings.excludedTripIds.filter(x=>x!==id):[...story.privacySettings.excludedTripIds,id];}
      if(el.hasAttribute('data-story-hide-place')){const id=el.dataset.storyHidePlace;story.privacySettings.hiddenPlaceIds=el.checked?[...story.privacySettings.hiddenPlaceIds,id]:story.privacySettings.hiddenPlaceIds.filter(x=>x!==id);}
      if(el.hasAttribute('data-story-place-label')){const id=el.dataset.storyPlaceLabel;if(el.value.trim())story.privacySettings.placeLabels[id]=el.value.trim();else delete story.privacySettings.placeLabels[id];}
      if(el.hasAttribute('data-story-memory')){const id=el.dataset.storyMemory;story=setStoryMemories(story,data(),el.checked?[...story.includedMemories,id]:story.includedMemories.filter(x=>x!==id));}
      if(el.hasAttribute('data-story-image')&&el.files[0])images[el.dataset.storyImage]=await storyThumbnail(el.files[0]);
      if(el.hasAttribute('data-story-approve')){approved=el.checked;render();return;}
      dirty();render();
    }catch(e){error(e);}
  });
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;try{
      if(b.hasAttribute('data-story-composer-close')){dialog.close();return;}
      if(b.hasAttribute('data-story-generate')){generate();return;}
      const index=Number(b.closest('[data-story-scene]')?.dataset.storyScene);
      if(b.hasAttribute('data-story-move')){const target=index+Number(b.dataset.storyMove);[story.orderedScenes[index],story.orderedScenes[target]]=[story.orderedScenes[target],story.orderedScenes[index]];dirty();render();return;}
      if(b.hasAttribute('data-story-remove')){story.orderedScenes.splice(index,1);dirty();render();return;}
      if(b.hasAttribute('data-story-review')){review=projectShare(data(),story,{images});approved=false;render();return;}
      if(b.hasAttribute('data-story-preview')){const a=projectShare(data(),story,{images});if(!a.orderedScenes.length)throw new Error('至少保留一个镜头');dialog.close();await onPreview(a);return;}
      if(b.hasAttribute('data-story-json')&&approved&&review)saveBlob('LifeStory.json',new Blob([JSON.stringify(review,null,2)],{type:'application/json'}));
      if(b.hasAttribute('data-story-package')&&approved&&review){busy=true;await onExportPackage(review,message=>{dialog.querySelector('[data-story-progress]').textContent=message;});busy=false;}
    }catch(e){busy=false;error(e);}
  });
  return {open({resume=false}={}){document.querySelector('#life-dialog')?.close();if(!resume){const s=getScope();source=s.type==='chapter'?`chapter:${s.id}`:s.type==='year'?`year:${s.year}`:s.type==='trip'?`trip:${s.id}`:'all';generate();}else render();dialog.showModal();}};
}
