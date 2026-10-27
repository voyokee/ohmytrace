import {preparePhotoInput} from '../../platform/web-photo-capability.js';
import {geoNameProvider} from '../geocoding/provider.js';
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
  GPS_DATUM_NOT_WGS84:'GPS 坐标系不是 WGS84，未使用',GPS_SOURCE_CONFLICT:'EXIF 与 XMP 位置不一致，已用 EXIF',INVALID_XMP_TIME:'XMP 时间无效',THUMBNAIL_UNAVAILABLE:'未能生成缩略图，已保留元数据',THUMBNAIL_CAPACITY_LIMIT:'缩略图容量已满，未新增',THUMBNAIL_RESELECT_REQUIRED:'请重新选择原文件以补充缩略图'};
const MEDIA_NAME=/\.(jpe?g|heic|heif|png|webp|avif|dng|tiff?|cr2|cr3|nef|arw|orf|rw2|raf|mov|mp4|m4v)$/i,DIAGNOSTIC_LIST_LIMIT=200,CANDIDATE_PAGE=30;
const problem=a=>a.processingStatus!=='analyzed'||!a.coordinates||String(a.thumbnailStatus||'').startsWith('THUMBNAIL_')||a.possibleDuplicateAssetIds?.length;
// Folder picks include sidecars and OS metadata files; keep media in a stable order.
export function mediaFilesFrom(list){
  return Array.from(list).filter(f=>MEDIA_NAME.test(f.name)&&!f.name.startsWith('._')&&!/(^|\/)(__MACOSX|\.)/.test(f.webkitRelativePath||''))
    .sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name));
}
export function batchSummary(assets){
  const images=assets.filter(a=>a.processingStatus==='analyzed'),gps=images.filter(a=>a.coordinates).length;
  return {total:assets.length,gps,noGps:images.length-gps,deferred:assets.filter(a=>a.processingStatus==='deferred').length,
    failed:assets.filter(a=>['error','unsupported','oversize'].includes(a.processingStatus)).length,possibleDuplicates:assets.filter(a=>a.possibleDuplicateAssetIds?.length).length,noTime:images.filter(a=>!a.extractedTime).length};
}

export function mountPhotoUI({service,onCommitted=()=>{},onError=()=>{},onScanning=()=>{},download}) {
  const dialog=document.querySelector('#photo-dialog');let batch=null,review=null,assets=[],preview=null,busy=false,urls=[],focusedPreviewId=null,shown=CANDIDATE_PAGE,progressFrame=0,retain=false,gallery=false,galleryShown=12,restorePreview=null,storageStats=null,renderGeneration=0,inputController=null;
  const mobile=globalThis.matchMedia?.('(pointer:coarse)').matches||/Android|iPhone|iPad/i.test(globalThis.navigator?.userAgent||'');
  const folderSupported=!mobile&&'webkitdirectory' in HTMLInputElement.prototype;
  const selected=new Set(),release=()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls=[];};let work=Promise.resolve(),initialized=false;
  function message(error){const el=dialog.querySelector('[data-photo-error]');if(el)el.textContent=error.message;onError(error);}
  function run(action){work=work.then(async()=>{busy=true;try{await action();}catch(error){message(error);}finally{busy=false;}});return work;}
  const currentData=()=>service.repository.getDataset();
  async function loadBatch(id){batch=await service.manifest.getBatch(id);assets=await service.assetsFor(batch);review=batch.review||await service.createReview(id);if(review.retainThumbnails!==undefined)retain=review.retainThumbnails;preview=null;focusedPreviewId=null;shown=CANDIDATE_PAGE;selected.clear();render();}
  async function save(){preview=null;await service.saveReview(batch.id,review);render();}
  const count=c=>c.visits.reduce((n,v)=>n+v.assetIds.length,0);
  const saveBlob=(name,blob)=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function hydrate(generation){if(!service.thumbnails)return;for(const el of dialog.querySelectorAll('[data-photo-stored-image]')){try{const blob=await service.thumbnails.read(el.dataset.photoStoredImage);if(generation!==renderGeneration)return;if(blob){const url=URL.createObjectURL(blob);urls.push(url);const image=Object.assign(document.createElement('img'),{src:url,alt:'已保存在本机的照片缩略图',className:'photo-thumb',loading:'lazy'});el.replaceChildren(image);}else el.textContent='未保留缩略图；可重新选择原图补充。';}catch{if(generation===renderGeneration)el.textContent='缩略图读取失败，请从备份恢复或重新选择原图。';}}}
  function imageFor(id){const asset=assets.find(a=>a.assetId===id),file=service.scanner.fileFor(id);
    if(!file)return `<span class="hint" data-photo-stored-image="${esc(id)}">正在读取已保存的缩略图…</span>`;
    if(!asset?.dimensions||asset.dimensions.width*asset.dimensions.height>MEDIA_LIMITS.previewMaxPixels)return '<span class="hint">尺寸未知或超出预览预算，仅展示元数据。</span>';
    if(urls.length>=MEDIA_LIMITS.maxPreviewImages||focusedPreviewId&&id!==focusedPreviewId)return `<button class="btn sm" type="button" data-photo-preview-asset="${esc(id)}">预览这张照片</button>`;
    const url=URL.createObjectURL(file);urls.push(url);return `<img src="${url}" alt="本地照片预览" loading="lazy" class="photo-thumb" style="image-orientation:from-image">`;
  }
  function summaryHTML(){
    const s=batchSummary(assets),warn=s.noGps>=3&&s.noGps>s.gps;
    return `<div class="photo-summary" data-photo-summary><p><b>${s.total}</b> 个文件：有 GPS <b>${s.gps}</b> 张（上地图）· 无 GPS <b>${s.noGps}</b> 张（已过滤）${s.failed?` · 不支持/读取失败 <b>${s.failed}</b>`:''} · 疑似重复 ${s.possibleDuplicates}（保留两份，请审核） · 已识别地点 ${review.candidates.flatMap(c=>c.visits).filter(v=>v.geoName||v.placeId).length} · 候选旅行 ${review.candidates.length}${s.deferred?` · 视频/实况动态部分 <b>${s.deferred}</b>（暂不导入）`:''}</p>
      ${warn?`<p class="photo-warning" data-photo-gps-warning>这批照片${s.gps?'大多':'都'}没有位置信息。${mobile?'手机浏览器的相册选择器可能会出于隐私去掉照片里的 GPS（安卓相册选择器、iPhone 照片图库都可能如此）。可以试试：在电脑上选择原图文件夹；iPhone 改用「文件」App 选原图；安卓改用「文件管理」选择原图。':'可能是相机未开启定位，或照片经过导出/压缩去掉了位置。尽量选择相机原图。'}</p>`:''}</div>`;
  }
  function render(){
    release();const generation=++renderGeneration,data=currentData();
    dialog.innerHTML=`<div class="dlg-head"><h3>从相册恢复足迹</h3><button class="x" type="button" data-photo-close aria-label="关闭照片导入">×</button></div>
      <div class="dlg-body scroll"><p class="muted">支持 JPG、HEIC、PNG、WebP，一次最多 ${MEDIA_LIMITS.maxFiles.toLocaleString()} 张。在本机解析照片中实际存在的拍摄时间与 GPS；照片可能含拍摄位置。原图默认不上传、不保存。缺失的位置可能需要人工补充，系统相册选择器也可能移除 GPS。</p>
      <p class="hint" data-photo-step>${service.scanner.running?'2 / 4 · 分析':review?'3 / 4 · 审核（确认前不会改动地图）':batch?.status==='committed'||gallery?'4 / 4 · 已保存记忆，可在地球上查看':'1 / 4 · 选择照片，无需 CSV 或账号'}</p>
      <label class="btn primary">选择或追加照片<input type="file" data-photo-files multiple accept="image/*" hidden ${service.scanner.running?'disabled':''}></label>
      ${folderSupported?`<label class="btn">选择文件夹<input type="file" data-photo-folder webkitdirectory multiple hidden ${service.scanner.running?'disabled':''}></label>`:''}
      <label class="btn">导入照片 ZIP<input type="file" data-photo-zip accept=".zip,application/zip" hidden></label>
      <button class="btn" type="button" data-photo-cancel ${!service.scanner.running?'disabled':''}>取消扫描</button>
      <p role="status" data-photo-progress>${batch?`${batch.processed} / ${batch.total} · ${statusText[batch.status]||'待检查'} · 重复 ${batch.duplicateCount} · 解析失败/不支持 ${batch.failureCount}`:'读取拍摄时间、GPS、海拔与方向；不支持的文件只记录原因，不猜测信息。'}</p>
      ${batch?`<details><summary>本次已选择 ${batch.total} 个文件</summary><ul>${batch.filePlan.slice(0,50).map(f=>`<li>${esc(f.name)}</li>`).join('')}</ul>${batch.total>50?'<p class="hint">仅列出前 50 个；完整清单保存在本地批次中。</p>':''}</details>`:''}
      <label><input type="checkbox" data-photo-retain ${retain?'checked':''} ${service.scanner.running?'disabled':''}>确认时保留小尺寸照片缩略图（最长边 512 px，每张 ≤100 KB）</label>
      <p class="hint">缩略图会去除 EXIF/XMP。浏览器无法解码时仅保留元数据。浏览器网站存储可能被清理；请下载统一备份。${storageStats?`已用 ${(storageStats.bytes/1048576).toFixed(1)} / ${(storageStats.budgetBytes/1048576).toFixed(0)} MiB · ${storageStats.count} 张`:''}</p>
      ${review?summaryHTML():''}
      <div class="row-actions"><button class="btn" type="button" data-photo-gallery>查看已保存照片</button><button class="btn" type="button" data-photo-library-backup>下载统一备份 ZIP</button><label class="btn">检查并恢复统一备份<input type="file" data-photo-library-restore accept=".zip,application/zip" hidden></label><button class="btn" type="button" data-photo-gc>清理未引用缩略图</button></div>
      ${restorePreview?`<section data-photo-restore-preview><h4>恢复前预览</h4><p>备份时间：${esc(restorePreview.summary.createdAt)} · ${restorePreview.summary.places} 个地点 · ${restorePreview.summary.trips} 次旅行 · ${restorePreview.summary.memories} 条记忆 · ${restorePreview.summary.thumbnails} 张缩略图。</p><p class="hint">校验全部文件的 SHA-256；合并无冲突记录，保留已有本地内容。原图不在备份内。</p>${restorePreview.conflicts.length?`<p role="alert">${restorePreview.conflicts.length} 项内容与本地冲突，为保留本地修订，本次不会恢复。</p>`:'<button class="btn primary" type="button" data-photo-library-restore-confirm>确认恢复已校验备份</button>'}</section>`:''}
      ${gallery?`<section data-photo-gallery-list><h4>已保存的照片记忆</h4><div class="photo-memory-grid">${data.memories.filter(m=>m.kind==='photo'&&m.uri?.startsWith('media:')).slice(galleryShown-12,galleryShown).map(m=>`<figure><span data-photo-stored-image="${esc(m.uri.slice(6))}">正在读取缩略图…</span><figcaption>${esc(m.title)} · ${esc(m.start.value||'日期未知')}<br>${esc(m.placeIds.map(id=>data.places.find(p=>p.id===id)?.name).filter(Boolean).join(' / ')||'未定位记忆')}</figcaption></figure>`).join('')||'<p class="hint">还没有确认保存的照片记忆。</p>'}</div>${galleryShown>12?'<button class="btn" data-photo-gallery-previous>上一页照片</button>':''}${data.memories.filter(m=>m.kind==='photo').length>galleryShown?'<button class="btn" data-photo-gallery-more>下一页照片</button>':''}<button class="btn" data-photo-globe>在地球上查看</button></section>`:''}
      <div class="row-actions"><button class="btn" type="button" data-photo-backup>备份媒体索引</button><label class="btn">恢复媒体索引<input type="file" data-photo-restore accept=".json,application/json" hidden></label><button class="btn" type="button" data-photo-history>历史批次</button></div>
      <p class="hint">统一 ZIP 包含人生数据、媒体索引及已保留缩略图，不含原图，不会自动上传。下方旧媒体索引 JSON 仅含元数据与审核草稿，仍可独立恢复。</p>
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
        <ol>${c.visits.map(v=>`<li data-visit="${esc(v.id)}"><label class="life-field">地点<input data-photo-place value="${esc(v.placeName)}"></label><p class="hint">${v.observedStart||'日期未知'} — ${v.observedEnd||'日期未知'} · ${v.coordinates.latitude.toFixed(5)}, ${v.coordinates.longitude.toFixed(5)} · ${v.assetIds.length} 张；到达/离开时间未知</p>${v.geoName?`<p class="hint">地名来源：${esc(v.geoName.source)} · ${v.geoName.precision==='nearby-city'?'附近城市中心匹配，非城市边界':'概化行政区边界，需确认'}${v.geoName.distanceKm!=null?` · 距城市中心约 ${v.geoName.distanceKm.toFixed(1)} km`:''}</p>`:''}<button class="btn sm" type="button" data-photo-online-name="${esc(v.id)}">在线查询此地点（仅发送此坐标）</button>${imageFor(v.assetIds[0])}</li>`).join('')}</ol>
        <div class="row-actions"><button class="btn sm" type="button" data-photo-split ${c.visits.length<2?'disabled':''}>按地点拆分</button><button class="btn sm" type="button" data-photo-split-images ${count(c)<2?'disabled':''}>按照片拆分</button></div>
      </section>`).join('')}</div>
      ${review.candidates.length>shown?`<button class="btn" type="button" data-photo-more>显示更多候选（还有 ${review.candidates.length-shown} 组）</button>`:''}
      ${review.unlocatedAssetIds.length?`<p class="hint">无 GPS 的 ${review.unlocatedAssetIds.length} 张照片已过滤，不会上地图。</p><label><input type="checkbox" data-photo-unlocated ${review.includeUnlocated?'checked':''}>仍然把它们保存为未定位记忆</label>`:''}
      <details><summary>需要注意的文件（${assets.filter(problem).length}）</summary><div class="photo-diagnostics">${assets.filter(problem).slice(0,DIAGNOSTIC_LIST_LIMIT).map(a=>`<p>${esc(a.originalFile.name)}${a.format&&a.format!=='unknown'?` · ${esc(a.format.toUpperCase())}`:''} · ${a.diagnostics.map(d=>esc(diagnosticText[d]||d)).join(' / ')||'元数据已解析'}${a.possibleDuplicateAssetIds?.length?' · 疑似重复，未自动合并':''}${a.extractedTime?` · ${esc(a.extractedTime.raw)} ${esc(a.extractedTime.offsetRaw||'时区未知')}`:''} </p>`).join('')}${assets.filter(problem).length>DIAGNOSTIC_LIST_LIMIT?`<p class="hint">仅列出前 ${DIAGNOSTIC_LIST_LIMIT} 个。</p>`:''}</div></details>
      <section data-photo-dry-run>${preview?`<h4>确认前预览</h4><p>将新增 <b>${preview.summary.createPlaces}</b> 个地点、<b>${preview.summary.createVisits}</b> 条到访、<b>${preview.summary.createTrips}</b> 次旅行、<b>${preview.summary.createMemories}</b> 条照片记忆。</p><p>其中 ${preview.summary.unlocatedMemories} 条记忆没有位置；关联 ${preview.summary.chapterAssociations.length} 项人生阶段关系。已有旅行的手动字段与地点坐标保持原值。</p><details><summary>查看完整变更明细</summary><pre>${esc(JSON.stringify(preview.summary,null,2))}</pre></details><button class="btn primary" type="button" data-photo-commit>确认写入人生数据</button><p class="hint">本次确认会原子保存人生记录；照片位置间的连线为推测连接。</p>`:''}</section>`:''}
      <p role="alert" data-photo-error></p></div>`;
    void hydrate(generation);
  }
  async function open(){if(!initialized){await service.recover();initialized=true;}if(service.thumbnails)storageStats=await service.thumbnails.stats();if(!dialog.open)dialog.showModal();render();}
  document.querySelector('#btn-photos').addEventListener('click',()=>run(open));
  // Chrome/Firefox cannot decode HEIC; keep the parsed GPS/time and say why there is no picture.
  dialog.addEventListener('error',event=>{if(event.target.matches?.('img.photo-thumb'))event.target.replaceWith(Object.assign(document.createElement('span'),{className:'hint',textContent:'此浏览器无法显示这种格式的预览，时间和位置已读取。'}));},true);
  dialog.addEventListener('close',()=>{renderGeneration++;inputController?.abort();release();if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('cancel',()=>{if(service.scanner.running)service.scanner.cancel();});
  dialog.addEventListener('change',event=>{
    const target=event.target;
    if(target.hasAttribute('data-photo-files')||target.hasAttribute('data-photo-folder')||target.hasAttribute('data-photo-zip')){let files=target.hasAttribute('data-photo-folder')?mediaFilesFrom(target.files):Array.from(target.files);run(async()=>{
      inputController=new AbortController();const progress=dialog.querySelector('[data-photo-progress]');progress.textContent='正在本机检查照片 / 安全解包 ZIP…';dialog.querySelector('[data-photo-cancel]').disabled=false;files=await preparePhotoInput(files,{signal:inputController.signal,onProgress:n=>{progress.textContent=`已安全解包 ${n} 张照片`;}});inputController=null;if(!files.length)throw new Error('没有找到可导入的照片文件');
      preview=null;review=null;batch=null;render();
      let latest=null;const paint=()=>{progressFrame=0;if(!service.scanner.running)return;const el=dialog.querySelector('[data-photo-progress]');if(el&&latest)el.textContent=`正在读取 ${latest.processed} / ${latest.total} · 重复 ${latest.duplicateCount} · 失败 ${latest.failureCount}`;const cancel=dialog.querySelector('[data-photo-cancel]');if(cancel)cancel.disabled=false;};
      // Progress is painted at most once per frame; thousands of files must not mean thousands of layouts.
      onScanning(true);let scanning;
      try{scanning=service.scanner.scan(files,{resumeBatchId:dialog.dataset.resumeBatch||null,onProgress:p=>{latest=p;if(!progressFrame)progressFrame=requestAnimationFrame(paint);}});render();
        batch=await scanning;}
      finally{cancelAnimationFrame(progressFrame);progressFrame=0;onScanning(false);}
      delete dialog.dataset.resumeBatch;await loadBatch(batch.id);
    });return;}
    if(target.hasAttribute('data-photo-retain')){retain=target.checked;preview=null;if(review){review.retainThumbnails=retain;run(save);}return;}
    if(target.hasAttribute('data-photo-library-restore')){const file=target.files[0];if(file)run(async()=>{if(!service.backups)throw new Error('统一备份存储不可用');restorePreview=await service.backups.inspect(file);render();});return;}
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
    if(button.hasAttribute('data-photo-cancel')){inputController?.abort();service.scanner.cancel();return;}
    run(async()=>{
      const row=button.closest('[data-candidate]'),id=row?.dataset.candidate;
      if(button.hasAttribute('data-photo-globe')){dialog.close();return;}
      if(button.hasAttribute('data-photo-gallery')){gallery=!gallery;galleryShown=12;render();}
      if(button.hasAttribute('data-photo-gallery-previous')){galleryShown=Math.max(12,galleryShown-12);render();}
      if(button.hasAttribute('data-photo-gallery-more')){galleryShown+=12;render();}
      if(button.hasAttribute('data-photo-library-backup')){if(!service.backups)throw new Error('统一备份存储不可用');saveBlob('OhMyTrace-Backup.zip',await service.backups.create());}
      if(button.hasAttribute('data-photo-library-restore-confirm')){if(service.readOnly)throw new Error('演示模式不能恢复数据');await service.backups.restore(restorePreview);restorePreview=null;batch=null;review=null;preview=null;gallery=true;storageStats=await service.thumbnails.stats();await onCommitted({tripId:null});render();dialog.querySelector('[data-photo-progress]').textContent='统一备份已校验并恢复，照片记忆可刷新查看。';}
      if(button.hasAttribute('data-photo-gc')){const referenced=[...new Set([...currentData().memories.filter(m=>m.uri?.startsWith('media:')).map(m=>m.uri.slice(6)),...(await service.manifest.listBatches()).filter(b=>b.status!=='committed').flatMap(b=>b.assetIds)])];storageStats=await service.thumbnails.gc(referenced);render();}
      if(button.dataset.photoOnlineName){const visit=review.candidates.find(c=>c.id===id)?.visits.find(v=>v.id===button.dataset.photoOnlineName);if(!visit||!confirm('将这一个地点的 GPS 发送给 Nominatim / OpenStreetMap 查询名称？不发送照片；导入其他照片不会触发在线查询。'))return;const name=await geoNameProvider.reverse(visit.coordinates,{online:true,consent:true});if(name){editVisitName(review,id,visit.id,name.displayName);visit.geoName=name;await save();}}
      if(button.dataset.photoPreviewAsset){focusedPreviewId=button.dataset.photoPreviewAsset;render();}
      if(button.hasAttribute('data-photo-more')){shown+=CANDIDATE_PAGE;render();}
      if(button.hasAttribute('data-photo-exclude')){const c=review.candidates.find(c=>c.id===id);editCandidate(review,id,{excluded:!c.excluded});await save();}
      if(button.hasAttribute('data-photo-merge')){mergeCandidates(review,[...selected]);selected.clear();await save();}
      if(button.hasAttribute('data-photo-split')||button.hasAttribute('data-photo-split-images')){splitCandidate(review,id,{photos:button.hasAttribute('data-photo-split-images'),assets});await save();}
      if(button.hasAttribute('data-photo-preview')){review.retainThumbnails=retain;await service.saveReview(batch.id,review);preview=await service.preview(batch.id);render();}
      if(button.hasAttribute('data-photo-commit')){const result=await service.commit(batch.id,preview,{onThumbnailProgress:p=>{const el=dialog.querySelector('[data-photo-progress]');if(el)el.textContent=`正在保留缩略图 ${p.processed} / ${p.total}；完成后保存地图`;}});preview=null;await onCommitted(result);batch=await service.manifest.getBatch(batch.id);review=null;gallery=true;if(service.thumbnails)storageStats=await service.thumbnails.stats();render();dialog.querySelector('[data-photo-progress]').textContent=result.warning||`已保存 ${result.createdMemories} 条照片记忆；重复照片不会重复生成记录。`;}
      if(button.hasAttribute('data-photo-backup'))download('LifeAtlas-media-index.json',JSON.stringify(await service.manifest.backup(),null,2),'application/json');
      if(button.hasAttribute('data-photo-history')){const batches=await service.manifest.listBatches();dialog.querySelector('[data-photo-history-list]').innerHTML=batches.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(b=>`<div class="row-actions"><button class="btn" data-photo-batch="${esc(b.id)}">${esc(b.startedAt)} · ${b.processed}/${b.total} · ${esc(statusText[b.status]||'待检查')}</button>${['scanning','interrupted','cancelled'].includes(b.status)?`<button class="btn" data-photo-resume="${esc(b.id)}">重新选择原文件以续扫</button>`:''}</div>`).join('')||'<p class="hint">还没有导入批次。</p>';}
      if(button.dataset.photoBatch)await loadBatch(button.dataset.photoBatch);
      if(button.dataset.photoResume){dialog.dataset.resumeBatch=button.dataset.photoResume;dialog.querySelector('[data-photo-files]').click();}
    });
  });
  render();return {open};
}
