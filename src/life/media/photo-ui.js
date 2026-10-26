import {clone} from '../schema.js';
import {editCandidate,editVisitName,mergeCandidates,splitCandidate} from './reconstruction.js';
import {MEDIA_LIMITS} from './config.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasonText={
  'daily-photos-within-residence':'已知居住时段内的日常照片','possible-away-visit':'可能的离家到访',
  'single-photo-boundaries-unknown':'只有一张照片，旅行起止未知','photo-coverage-not-complete-trip':'照片仅覆盖部分时间，旅行起止未知',
  'manual-merge':'用户合并','manual-split':'用户拆分'};
const diagnosticText={NO_GPS:'无 GPS',NO_CAPTURE_TIME:'无拍摄时间',UNSUPPORTED_FORMAT:'暂不支持此格式（含 HEIC/HEIF）',FILE_SIZE_LIMIT:'超过单文件 64 MiB 限制',INVALID_GPS:'GPS 元数据无效',INVALID_CAPTURE_TIME:'拍摄时间无效'};

export function mountPhotoUI({service,onCommitted=()=>{},onError=()=>{},download}) {
  const dialog=document.querySelector('#photo-dialog');let batch=null,review=null,assets=[],preview=null,busy=false,urls=[];
  const selected=new Set(),release=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};
  function message(error){const el=dialog.querySelector('[data-photo-error]');if(el)el.textContent=error.message;onError(error);}
  async function run(action){if(busy)return;busy=true;try{await action();}catch(error){message(error);}finally{busy=false;}}
  const currentData=()=>service.repository.getDataset();
  async function loadBatch(id){batch=await service.manifest.getBatch(id);assets=await service.assetsFor(batch);review=batch.review||await service.createReview(id);preview=null;selected.clear();render();}
  async function save(){preview=null;await service.saveReview(batch.id,review);render();}
  const count=c=>c.visits.reduce((n,v)=>n+v.assetIds.length,0);
  function imageFor(id){const asset=assets.find(a=>a.assetId===id),file=service.scanner.fileFor(id);
    if(!file)return '<span class="hint">原文件未在本次页面选择，重新选择后可预览。</span>';
    if(!asset?.dimensions||asset.dimensions.width*asset.dimensions.height>MEDIA_LIMITS.previewMaxPixels)return '<span class="hint">尺寸未知或超出预览预算，仅展示元数据。</span>';
    const url=URL.createObjectURL(file);urls.push(url);return `<img src="${url}" alt="本地照片预览" loading="lazy" class="photo-thumb" style="image-orientation:from-image">`;
  }
  function render(){
    release();const data=currentData();
    dialog.innerHTML=`<div class="dlg-head"><h3>照片历史 · 本地重建</h3><button class="x" type="button" data-photo-close aria-label="关闭照片导入">×</button></div>
      <div class="dlg-body scroll"><p class="muted">只处理你本次选择的文件，原图不上传、不保存。关闭或刷新后需重新选择原文件才能预览。</p>
      <label class="btn primary">选择照片<input type="file" data-photo-files multiple accept="image/jpeg,.jpg,.jpeg,.heic,.heif,.png,.webp" hidden ${service.scanner.running?'disabled':''}></label>
      <button class="btn" type="button" data-photo-cancel ${!service.scanner.running?'disabled':''}>取消扫描</button>
      <p role="status" data-photo-progress>${batch?`${batch.processed} / ${batch.total} · ${batch.status} · 重复 ${batch.duplicateCount} · 解析失败/不支持 ${batch.failureCount}`:'JPEG 支持 EXIF 时间、GPS、海拔与方向；其他格式保留诊断，不猜测信息。'}</p>
      <div class="row-actions"><button class="btn" type="button" data-photo-backup>备份媒体索引</button><label class="btn">恢复媒体索引<input type="file" data-photo-restore accept=".json,application/json" hidden></label><button class="btn" type="button" data-photo-history>历史批次</button></div>
      <p class="hint">人生数据 JSON 不含媒体索引和原图。媒体索引备份仅含元数据与审核草稿；请同时保留人生 JSON 备份及原始照片。</p>
      <div data-photo-history-list></div>
      ${review?`<p class="hint">${review.timeOrderBasis==='local-order-uncertain'?'部分拍摄时间没有时区：按相机日期提出候选，先后与跨区间隔可能不确定。':'按 EXIF 明确偏移换算的时刻排序。'} 城市名只复用已有地点；其余地点显示 GPS，需你确认名称。地点之间仅是推测连接，交通方式未知。</p>
      <div class="row-actions"><button class="btn" type="button" data-photo-merge>合并选中候选</button><button class="btn primary" type="button" data-photo-preview>预览变更 / Dry Run</button></div>
      <div class="photo-candidates">${review.candidates.map(c=>`<section class="photo-candidate${c.excluded?' excluded':''}" data-candidate="${esc(c.id)}">
        <div class="photo-candidate-head"><label><input type="checkbox" data-photo-select ${selected.has(c.id)?'checked':''}> 合并选择</label><button class="btn sm" type="button" data-photo-exclude>${c.excluded?'恢复候选':'排除此候选'}</button></div>
        <label class="life-field">旅行标题<input data-photo-field="title" value="${esc(c.title)}"></label>
        <p class="hint">${count(c)} 张照片 · ${c.reasons.map(r=>esc(reasonText[r]||r)).join('；')}</p>
        <label class="life-field">处理方式<select data-photo-field="action"><option value="create" ${c.action==='create'?'selected':''}>创建照片旅行</option><option value="link" ${c.action==='link'?'selected':''}>关联已有旅行（保留原有内容）</option><option value="memory" ${c.action==='memory'?'selected':''}>仅保存照片记忆（日常照片）</option></select></label>
        ${c.action==='link'?`<label class="life-field">已有旅行<select data-photo-field="relatedTripId"><option value="">请选择</option>${data.trips.map(t=>`<option value="${esc(t.id)}" ${t.id===c.relatedTripId?'selected':''}>${esc(t.title)}${c.matches.some(m=>m.tripId===t.id)?' · 时间与地点相符':''}</option>`).join('')}</select></label>`:''}
        <details><summary>已知的旅行起止（可留空为未知）</summary><div class="life-dates"><label class="life-field">实际开始<input data-photo-field="start" value="${esc(c.start)}" placeholder="未知；或 YYYY-MM-DD"></label><label class="life-field">实际结束<input data-photo-field="end" value="${esc(c.end)}" placeholder="未知；或 YYYY-MM-DD"></label></div></details>
        <details><summary>关联人生阶段（可选多个）</summary><div class="life-options">${data.chapters.map(ch=>`<label><input type="checkbox" data-photo-chapter value="${esc(ch.id)}" ${c.chapterIds.includes(ch.id)?'checked':''}>${esc(ch.title)}</label>`).join('')||'<p class="hint">可稍后在「章」中关联。</p>'}</div></details>
        <ol>${c.visits.map(v=>`<li data-visit="${esc(v.id)}"><label class="life-field">地点<input data-photo-place value="${esc(v.placeName)}"></label><p class="hint">${v.observedStart||'日期未知'} — ${v.observedEnd||'日期未知'} · ${v.coordinates.latitude.toFixed(5)}, ${v.coordinates.longitude.toFixed(5)} · ${v.assetIds.length} 张；到达/离开时间未知</p>${imageFor(v.assetIds[0])}</li>`).join('')}</ol>
        <div class="row-actions"><button class="btn sm" type="button" data-photo-split ${c.visits.length<2?'disabled':''}>按地点拆分</button><button class="btn sm" type="button" data-photo-split-images ${count(c)<2?'disabled':''}>按照片拆分</button></div>
      </section>`).join('')}</div>
      <label><input type="checkbox" data-photo-unlocated ${review.includeUnlocated?'checked':''}>保存 ${review.unlocatedAssetIds.length} 张无 GPS 照片为未定位记忆（不会上地图）</label>
      <details><summary>文件诊断（${assets.length}）</summary><div class="photo-diagnostics">${assets.map(a=>`<p>${esc(a.originalFile.name)} · ${a.diagnostics.map(d=>esc(diagnosticText[d]||d)).join(' / ')||'EXIF 已解析'}${a.extractedTime?` · ${esc(a.extractedTime.raw)} ${esc(a.extractedTime.offsetRaw||'时区未知')}`:''} · 方向 ${a.orientation??'未知'}</p>`).join('')}</div></details>
      <section data-photo-dry-run>${preview?`<h4>确认前预览</h4><pre>${esc(JSON.stringify(preview.summary,null,2))}</pre><button class="btn primary" type="button" data-photo-commit>确认写入人生数据</button><p class="hint">本次确认会原子保存人生记录；照片位置间的连线为推测连接。</p>`:''}</section>`:''}
      <p role="alert" data-photo-error></p></div>`;
  }
  async function open(){if(!dialog.open)dialog.showModal();if(!batch)render();}
  document.querySelector('#btn-photos').addEventListener('click',()=>run(open));
  dialog.addEventListener('close',()=>{release();if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('cancel',()=>{if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('change',event=>{
    const target=event.target;
    if(target.hasAttribute('data-photo-files')){const files=Array.from(target.files);run(async()=>{
      preview=null;review=null;batch=null;render();
      batch=await service.scanner.scan(files,{resumeBatchId:dialog.dataset.resumeBatch||null,onProgress:p=>{const el=dialog.querySelector('[data-photo-progress]');if(el)el.textContent=`${p.processed} / ${p.total} · 重复 ${p.duplicateCount} · 失败 ${p.failureCount}`;const cancel=dialog.querySelector('[data-photo-cancel]');if(cancel)cancel.disabled=false;}});
      delete dialog.dataset.resumeBatch;await loadBatch(batch.id);
    });return;}
    if(target.hasAttribute('data-photo-restore')){const file=target.files[0];if(file)run(async()=>{const input=JSON.parse(await file.text());if(!confirm('用此媒体索引替换当前媒体索引？人生数据与原图不会被此操作替换。'))return;await service.restoreManifest(input);batch=null;review=null;preview=null;render();});return;}
    if(!review)return;
    const row=target.closest('[data-candidate]'),id=row?.dataset.candidate;
    if(target.hasAttribute('data-photo-select')){target.checked?selected.add(id):selected.delete(id);return;}
    if(target.hasAttribute('data-photo-unlocated')){review.includeUnlocated=target.checked;run(save);return;}
    if(target.dataset.photoField){editCandidate(review,id,{[target.dataset.photoField]:target.value});run(save);}
    if(target.hasAttribute('data-photo-chapter')){const c=review.candidates.find(c=>c.id===id);editCandidate(review,id,{chapterIds:target.checked?[...new Set([...c.chapterIds,target.value])]:c.chapterIds.filter(x=>x!==target.value)});run(save);}
    if(target.hasAttribute('data-photo-place')){editVisitName(review,id,target.closest('[data-visit]').dataset.visit,target.value);run(save);}
  });
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-photo-close')){dialog.close();return;}
    if(button.hasAttribute('data-photo-cancel')){service.scanner.cancel();return;}
    run(async()=>{
      const row=button.closest('[data-candidate]'),id=row?.dataset.candidate;
      if(button.hasAttribute('data-photo-exclude')){const c=review.candidates.find(c=>c.id===id);editCandidate(review,id,{excluded:!c.excluded});await save();}
      if(button.hasAttribute('data-photo-merge')){mergeCandidates(review,[...selected]);selected.clear();await save();}
      if(button.hasAttribute('data-photo-split')||button.hasAttribute('data-photo-split-images')){splitCandidate(review,id,{photos:button.hasAttribute('data-photo-split-images'),assets});await save();}
      if(button.hasAttribute('data-photo-preview')){await service.saveReview(batch.id,review);preview=await service.preview(batch.id);render();}
      if(button.hasAttribute('data-photo-commit')){const result=await service.commit(batch.id,preview);preview=null;await onCommitted(result);batch=await service.manifest.getBatch(batch.id);review=null;render();dialog.querySelector('[data-photo-progress]').textContent=result.warning||`已保存 ${result.createdMemories} 条照片记忆；重复照片不会重复生成记录。`;}
      if(button.hasAttribute('data-photo-backup'))download('LifeAtlas-media-index.json',JSON.stringify(await service.manifest.backup(),null,2),'application/json');
      if(button.hasAttribute('data-photo-history')){const batches=await service.manifest.listBatches();dialog.querySelector('[data-photo-history-list]').innerHTML=batches.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(b=>`<div class="row-actions"><button class="btn" data-photo-batch="${esc(b.id)}">${esc(b.startedAt)} · ${b.processed}/${b.total} · ${esc(b.status)}</button>${['scanning','interrupted','cancelled'].includes(b.status)?`<button class="btn" data-photo-resume="${esc(b.id)}">重新选择原文件以续扫</button>`:''}</div>`).join('')||'<p class="hint">还没有导入批次。</p>';}
      if(button.dataset.photoBatch)await loadBatch(button.dataset.photoBatch);
      if(button.dataset.photoResume){dialog.dataset.resumeBatch=button.dataset.photoResume;dialog.querySelector('[data-photo-files]').click();}
    });
  });
  render();return {open};
}
