import {preparePhotoInput} from '../../platform/web-photo-capability.js';
import {clone} from '../schema.js';
import {editCandidate,editVisitName,mergeCandidates,splitCandidate} from './reconstruction.js';
import {MEDIA_LIMITS} from './config.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasonText={
  'daily-photos-within-residence':'已知居住时段内的日常照片','possible-away-visit':'可能的离家到访',
  'single-photo-boundaries-unknown':'只有一张照片，旅行起止未知','photo-coverage-not-complete-trip':'照片仅覆盖部分时间，旅行起止未知',
  'manual-merge':'用户合并','manual-split':'用户拆分','daily-photos-near-inferred-home':'在照片最常出现的城市附近，按日常照片处理（推测，可改为旅行）'};
const statusText={scanning:'正在扫描',review:'待审核',prepared:'待完成确认',committed:'已保存',cancelled:'已取消',interrupted:'已中断，可继续'};
const diagnosticText={NO_GPS:'无 GPS',NO_CAPTURE_TIME:'无拍摄时间',UNSUPPORTED_FORMAT:'暂不支持此格式',FILE_SIZE_LIMIT:'超过单文件 1 GiB 限制',INVALID_GPS:'GPS 元数据无效',INVALID_CAPTURE_TIME:'拍摄时间无效',
  VIDEO_DEFERRED:'视频暂不导入',LIVE_PHOTO_COMPANION:'实况照片的视频部分，已用静态照片',RAW_METADATA_UNSUPPORTED:'此 RAW 格式暂不读取元数据',GPS_NULL_ISLAND:'GPS 为 0,0（无效定位）',
  GPS_DATUM_NOT_WGS84:'GPS 坐标系不是 WGS84，未使用',GPS_SOURCE_CONFLICT:'EXIF 与 XMP 位置不一致，已用 EXIF',INVALID_XMP_TIME:'XMP 时间无效'};
const MEDIA_NAME=/\.(jpe?g|heic|heif|png|webp|avif|dng|tiff?|cr2|cr3|nef|arw|orf|rw2|raf|mov|mp4|m4v)$/i,DIAGNOSTIC_LIST_LIMIT=200,CANDIDATE_PAGE=30;
const problem=a=>a.processingStatus!=='analyzed'||!a.coordinates;
// Folder picks include sidecars and OS metadata files; keep media in a stable order.
export function mediaFilesFrom(list){
  return Array.from(list).filter(f=>MEDIA_NAME.test(f.name)&&!f.name.startsWith('._')&&!/(^|\/)(__MACOSX|\.)/.test(f.webkitRelativePath||''))
    .sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name));
}
export function batchSummary(assets){
  const images=assets.filter(a=>a.processingStatus==='analyzed'),gps=images.filter(a=>a.coordinates).length;
  return {total:assets.length,gps,noGps:images.length-gps,deferred:assets.filter(a=>a.processingStatus==='deferred').length,
    failed:assets.filter(a=>['error','unsupported','oversize'].includes(a.processingStatus)).length,noTime:images.filter(a=>!a.extractedTime).length};
}

export function mountPhotoUI({service,onCommitted=()=>{},onError=()=>{},onScanning=()=>{},download}) {
  const dialog=document.querySelector('#photo-dialog');let batch=null,review=null,assets=[],preview=null,busy=false,urls=[],focusedPreviewId=null,shown=CANDIDATE_PAGE,progressFrame=0;
  const mobile=globalThis.matchMedia?.('(pointer:coarse)').matches||/Android|iPhone|iPad/i.test(globalThis.navigator?.userAgent||'');
  const folderSupported=!mobile&&'webkitdirectory' in HTMLInputElement.prototype;
  const selected=new Set(),release=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};let work=Promise.resolve(),initialized=false;
  function message(error){const el=dialog.querySelector('[data-photo-error]');if(el)el.textContent=error.message;onError(error);}
  function run(action){work=work.then(async()=>{busy=true;try{await action();}catch(error){message(error);}finally{busy=false;}});return work;}
  const currentData=()=>service.repository.getDataset();
  async function loadBatch(id){batch=await service.manifest.getBatch(id);assets=await service.assetsFor(batch);review=batch.review||await service.createReview(id);preview=null;focusedPreviewId=null;shown=CANDIDATE_PAGE;selected.clear();render();}
  async function save(){preview=null;await service.saveReview(batch.id,review);render();}
  const count=c=>c.visits.reduce((n,v)=>n+v.assetIds.length,0);
  function imageFor(id){const asset=assets.find(a=>a.assetId===id),file=service.scanner.fileFor(id);
    if(!file)return '<span class="hint">原文件未在本次页面选择，重新选择后可预览。</span>';
    if(!asset?.dimensions||asset.dimensions.width*asset.dimensions.height>MEDIA_LIMITS.previewMaxPixels)return '<span class="hint">尺寸未知或超出预览预算，仅展示元数据。</span>';
    if(urls.length>=MEDIA_LIMITS.maxPreviewImages||focusedPreviewId&&id!==focusedPreviewId)return `<button class="btn sm" type="button" data-photo-preview-asset="${esc(id)}">预览这张照片</button>`;
    const url=URL.createObjectURL(file);urls.push(url);return `<img src="${url}" alt="本地照片预览" loading="lazy" class="photo-thumb" style="image-orientation:from-image">`;
  }
  function summaryHTML(){
    const s=batchSummary(assets),warn=s.noGps>=3&&s.noGps>s.gps;
    return `<div class="photo-summary" data-photo-summary><p><b>${s.total}</b> 个文件：有 GPS <b>${s.gps}</b> 张（上地图）· 无 GPS <b>${s.noGps}</b> 张（已过滤）${s.failed?` · 不支持/读取失败 <b>${s.failed}</b>`:''}${s.deferred?` · 视频/实况动态部分 <b>${s.deferred}</b>（暂不导入）`:''}</p>
      ${warn?`<p class="photo-warning" data-photo-gps-warning>这批照片${s.gps?'大多':'都'}没有位置信息。${mobile?'手机浏览器的相册选择器常会出于隐私去掉照片里的 GPS（安卓相册选择器、iPhone 照片图库都可能如此）。可以试试：在电脑上选择原图文件夹；iPhone 改用「文件」App 选原图；安卓改用「文件管理」选择原图。':'可能是相机未开启定位，或照片经过导出/压缩去掉了位置。尽量选择相机原图。'}</p>`:''}</div>`;
  }
  function render(){
    release();const data=currentData();
    dialog.innerHTML=`<div class="dlg-head"><h3>从相册恢复足迹</h3><button class="x" type="button" data-photo-close aria-label="关闭照片导入">×</button></div>
      <div class="dlg-body scroll"><p class="muted">支持 JPG、HEIC、PNG、WebP，一次最多 ${MEDIA_LIMITS.maxFiles.toLocaleString()} 张。只在本机读取每张照片开头的拍摄时间和 GPS，原图不上传、不保存。有 GPS 的照片自动归入地点和旅行；没有 GPS 的会被过滤，并告诉你数量。</p>
      <label class="btn primary">选择或追加照片<input type="file" data-photo-files multiple accept="image/*,.jpg,.jpeg,.heic,.heif,.png,.webp,.dng,.zip" hidden ${service.scanner.running?'disabled':''}></label>
      ${folderSupported?`<label class="btn">选择文件夹<input type="file" data-photo-folder webkitdirectory multiple hidden ${service.scanner.running?'disabled':''}></label>`:''}
      <label class="btn">导入照片 ZIP<input type="file" data-photo-zip accept=".zip,application/zip" hidden></label>
      <button class="btn" type="button" data-photo-cancel ${!service.scanner.running?'disabled':''}>取消扫描</button>
      <p role="status" data-photo-progress>${batch?`${batch.processed} / ${batch.total} · ${statusText[batch.status]||'待检查'} · 重复 ${batch.duplicateCount} · 解析失败/不支持 ${batch.failureCount}`:'读取拍摄时间、GPS、海拔与方向；不支持的文件只记录原因，不猜测信息。'}</p>
      ${review?summaryHTML():''}
      <div class="row-actions"><button class="btn" type="button" data-photo-backup>备份媒体索引</button><label class="btn">恢复媒体索引<input type="file" data-photo-restore accept=".json,application/json" hidden></label><button class="btn" type="button" data-photo-history>历史批次</button></div>
      <p class="hint">人生数据 JSON 不含媒体索引和原图。媒体索引备份仅含元数据与审核草稿；请同时保留人生 JSON 备份及原始照片。</p>
      <div data-photo-history-list></div>
      ${review?`<p class="hint">${review.timeOrderBasis==='local-order-uncertain'?'部分拍摄时间没有时区：按相机日期分组，先后可能不确定。':'按照片记录的时区排序。'} 地点名称可直接修改；地点之间只是推测连接，交通方式未知。</p>
      <div class="row-actions"><button class="btn" type="button" data-photo-merge>合并选中候选</button><button class="btn primary" type="button" data-photo-preview>预览变更 / Dry Run</button></div>
      <div class="photo-candidates">${review.candidates.slice(0,shown).map(c=>`<section class="photo-candidate${c.excluded?' excluded':''}" data-candidate="${esc(c.id)}">
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
      ${review.candidates.length>shown?`<button class="btn" type="button" data-photo-more>显示更多候选（还有 ${review.candidates.length-shown} 组）</button>`:''}
      ${review.unlocatedAssetIds.length?`<p class="hint">无 GPS 的 ${review.unlocatedAssetIds.length} 张照片已过滤，不会上地图。</p><label><input type="checkbox" data-photo-unlocated ${review.includeUnlocated?'checked':''}>仍然把它们保存为未定位记忆</label>`:''}
      <details><summary>需要注意的文件（${assets.filter(problem).length}）</summary><div class="photo-diagnostics">${assets.filter(problem).slice(0,DIAGNOSTIC_LIST_LIMIT).map(a=>`<p>${esc(a.originalFile.name)}${a.format&&a.format!=='unknown'?` · ${esc(a.format.toUpperCase())}`:''} · ${a.diagnostics.map(d=>esc(diagnosticText[d]||d)).join(' / ')||'元数据已解析'}${a.extractedTime?` · ${esc(a.extractedTime.raw)} ${esc(a.extractedTime.offsetRaw||'时区未知')}`:''} </p>`).join('')}${assets.filter(problem).length>DIAGNOSTIC_LIST_LIMIT?`<p class="hint">仅列出前 ${DIAGNOSTIC_LIST_LIMIT} 个。</p>`:''}</div></details>
      <section data-photo-dry-run>${preview?`<h4>确认前预览</h4><p>将新增 <b>${preview.summary.createPlaces}</b> 个地点、<b>${preview.summary.createVisits}</b> 条到访、<b>${preview.summary.createTrips}</b> 次旅行、<b>${preview.summary.createMemories}</b> 条照片记忆。</p><p>其中 ${preview.summary.unlocatedMemories} 条记忆没有位置；关联 ${preview.summary.chapterAssociations.length} 项人生阶段关系。已有旅行的手动字段与地点坐标保持原值。</p><details><summary>查看完整变更明细</summary><pre>${esc(JSON.stringify(preview.summary,null,2))}</pre></details><button class="btn primary" type="button" data-photo-commit>确认写入人生数据</button><p class="hint">本次确认会原子保存人生记录；照片位置间的连线为推测连接。</p>`:''}</section>`:''}
      <p role="alert" data-photo-error></p></div>`;
  }
  async function open(){if(!initialized){await service.recover();initialized=true;}if(!dialog.open)dialog.showModal();if(!batch)render();}
  document.querySelector('#btn-photos').addEventListener('click',()=>run(open));
  // Chrome/Firefox cannot decode HEIC; keep the parsed GPS/time and say why there is no picture.
  dialog.addEventListener('error',event=>{if(event.target.matches?.('img.photo-thumb'))event.target.replaceWith(Object.assign(document.createElement('span'),{className:'hint',textContent:'此浏览器无法显示这种格式的预览，时间和位置已读取。'}));},true);
  dialog.addEventListener('close',()=>{release();if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('cancel',()=>{if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('change',event=>{
    const target=event.target;
    if(target.hasAttribute('data-photo-files')||target.hasAttribute('data-photo-folder')||target.hasAttribute('data-photo-zip')){let files=target.hasAttribute('data-photo-folder')?mediaFilesFrom(target.files):Array.from(target.files);run(async()=>{
      files=await preparePhotoInput(files);if(!files.length)throw new Error('没有找到可导入的照片文件');
      preview=null;review=null;batch=null;render();
      let latest=null;const paint=()=>{progressFrame=0;if(!service.scanner.running)return;const el=dialog.querySelector('[data-photo-progress]');if(el&&latest)el.textContent=`正在读取 ${latest.processed} / ${latest.total} · 重复 ${latest.duplicateCount} · 失败 ${latest.failureCount}`;const cancel=dialog.querySelector('[data-photo-cancel]');if(cancel)cancel.disabled=false;};
      // Progress is painted at most once per frame; thousands of files must not mean thousands of layouts.
      onScanning(true);let scanning;
      try{scanning=service.scanner.scan(files,{resumeBatchId:dialog.dataset.resumeBatch||null,onProgress:p=>{latest=p;if(!progressFrame)progressFrame=requestAnimationFrame(paint);}});render();
        batch=await scanning;}
      finally{cancelAnimationFrame(progressFrame);progressFrame=0;onScanning(false);}
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
      if(button.dataset.photoPreviewAsset){focusedPreviewId=button.dataset.photoPreviewAsset;render();}
      if(button.hasAttribute('data-photo-more')){shown+=CANDIDATE_PAGE;render();}
      if(button.hasAttribute('data-photo-exclude')){const c=review.candidates.find(c=>c.id===id);editCandidate(review,id,{excluded:!c.excluded});await save();}
      if(button.hasAttribute('data-photo-merge')){mergeCandidates(review,[...selected]);selected.clear();await save();}
      if(button.hasAttribute('data-photo-split')||button.hasAttribute('data-photo-split-images')){splitCandidate(review,id,{photos:button.hasAttribute('data-photo-split-images'),assets});await save();}
      if(button.hasAttribute('data-photo-preview')){await service.saveReview(batch.id,review);preview=await service.preview(batch.id);render();}
      if(button.hasAttribute('data-photo-commit')){const result=await service.commit(batch.id,preview);preview=null;await onCommitted(result);batch=await service.manifest.getBatch(batch.id);review=null;render();dialog.querySelector('[data-photo-progress]').textContent=result.warning||`已保存 ${result.createdMemories} 条照片记忆；重复照片不会重复生成记录。`;}
      if(button.hasAttribute('data-photo-backup'))download('LifeAtlas-media-index.json',JSON.stringify(await service.manifest.backup(),null,2),'application/json');
      if(button.hasAttribute('data-photo-history')){const batches=await service.manifest.listBatches();dialog.querySelector('[data-photo-history-list]').innerHTML=batches.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(b=>`<div class="row-actions"><button class="btn" data-photo-batch="${esc(b.id)}">${esc(b.startedAt)} · ${b.processed}/${b.total} · ${esc(statusText[b.status]||'待检查')}</button>${['scanning','interrupted','cancelled'].includes(b.status)?`<button class="btn" data-photo-resume="${esc(b.id)}">重新选择原文件以续扫</button>`:''}</div>`).join('')||'<p class="hint">还没有导入批次。</p>';}
      if(button.dataset.photoBatch)await loadBatch(button.dataset.photoBatch);
      if(button.dataset.photoResume){dialog.dataset.resumeBatch=button.dataset.photoResume;dialog.querySelector('[data-photo-files]').click();}
    });
  });
  render();return {open};
}
