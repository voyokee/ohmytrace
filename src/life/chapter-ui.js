import {upsertChapter,deleteChapter,partialDate} from './schema.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateText=d=>d.precision==='unknown'?'':d.precision==='ongoing'?'至今':d.value;
const period=c=>`${dateText(c.start)||'开始未知'} – ${dateText(c.end)||'结束未知'}`;

export function mountChapterUI({repository,adapter,onScope,onError,onBackup,onRestore,status}) {
  const dialog=document.querySelector('#life-dialog'),strip=document.querySelector('#chapter-filter');
  let editing=null,busy=false;
  const data=()=>repository.getDataset();
  const current=()=>adapter.scope.type==='chapter'?adapter.scope.id:null;
  function renderStrip() {
    const d=data();strip.replaceChildren();
    document.querySelector('#timeline').classList.toggle('has-chapters',d.chapters.length>0);
    strip.hidden=!d.chapters.length;
    if(!d.chapters.length)return;
    strip.innerHTML=`<button class="year-option${!current()?' on':''}" data-life-scope="" aria-pressed="${!current()}">全部阶段</button>`+
      d.chapters.map(c=>`<button class="year-option${current()===c.id?' on':''}" data-life-scope="${esc(c.id)}" aria-pressed="${current()===c.id}" title="${esc(period(c))}">${esc(c.title)}</button>`).join('')+
      '<button class="year-option" data-life-manage>管理阶段 ＋</button>';
  }
  function render() {
    const d=data(),chapter=d.chapters.find(c=>c.id===editing),demo=d.meta.origin==='demo';
    dialog.innerHTML=`<div class="dlg-head"><h3>Life Atlas · 人生阶段</h3><button class="x" data-life-close aria-label="关闭人生阶段">×</button></div>
      <div class="dlg-body scroll"><p class="muted">${esc(status())}</p>
      <div class="row-actions"><button class="btn" data-life-backup>JSON 备份</button><label class="btn">恢复 JSON<input type="file" data-life-restore accept=".json,application/json" hidden></label></div>
      <p class="hint">阶段可以重叠，同一次旅行可以属于多个阶段。先导入 CSV，再组织你的人生阶段。</p>
      <div class="life-chapters">${d.chapters.map(c=>`<div class="life-chapter"><button class="mini" data-life-view="${esc(c.id)}"><strong>${esc(c.title)}</strong><span>${esc(period(c))} · ${c.relatedTripIds.length} 次旅行</span></button><button class="btn sm" data-life-edit="${esc(c.id)}">编辑</button><button class="btn sm danger" data-life-delete="${esc(c.id)}">删除</button></div>`).join('')||'<p class="muted">还没有人生阶段。</p>'}</div>
      <form id="chapter-form"><h4>${chapter?'编辑阶段':'新建阶段'}</h4>
      <fieldset ${demo?'disabled':''}>
      <label class="life-field">标题<input name="title" required maxlength="160" value="${esc(chapter?.title)}" placeholder="例如：大学本科"></label>
      <label class="life-field">类型<select name="type">${Object.entries({study:'学习',work:'工作',life:'生活',travel:'旅行',other:'其他',...(chapter&&!['study','work','life','travel','other'].includes(chapter.type)?{[chapter.type]:chapter.type}:{})}).map(([key,label])=>`<option value="${esc(key)}" ${key===(chapter?.type||'study')?'selected':''}>${esc(label)}</option>`).join('')}</select></label>
      <div class="life-dates"><label class="life-field">开始<input name="start" value="${esc(chapter?dateText(chapter.start):'')}" placeholder="YYYY / YYYY-MM / YYYY-MM-DD"></label>
      <label class="life-field">结束<input name="end" value="${esc(chapter?dateText(chapter.end):'')}" placeholder="留空表示未知；至今表示持续中"></label></div>
      <p class="hint">支持年、月、日精度。留空表示未知，不会补成精确日期。</p>
      <details ${chapter?.homeAnchors.length?'open':''}><summary>关联常驻 / 阶段地点（${d.places.length}）</summary><div class="life-options">${d.places.map(p=>`<label><input type="checkbox" name="homeAnchors" value="${esc(p.id)}" ${chapter?.homeAnchors.includes(p.id)?'checked':''}>${esc(p.name)}${p.coordinates?` <small>${p.coordinates.latitude}, ${p.coordinates.longitude}</small>`:' · 坐标未知'}</label>`).join('')}</div></details>
      <details open><summary>关联旅行（${d.trips.length}）</summary><div class="life-options">${d.trips.map(t=>`<label><input type="checkbox" name="relatedTripIds" value="${esc(t.id)}" ${chapter?.relatedTripIds.includes(t.id)?'checked':''}>${esc(t.title)} <small>${esc(period(t))}</small></label>`).join('')||'<p class="hint">没有旅行也可以建立居住或学习阶段。</p>'}</div></details>
      <div class="row-actions"><button class="btn primary" type="submit">保存阶段</button><button class="btn" type="button" data-life-new>新建阶段</button></div>
      </fieldset>${demo?'<p class="hint">当前为虚构演示。导入你的 CSV 或在数据管理中清空示例后，即可保存人生阶段。</p>':''}
      <p id="chapter-error" role="alert"></p></form></div>`;
  }
  function open(){editing=null;render();dialog.showModal();}
  async function run(action) {
    if(busy)return;busy=true;
    try{await action();}catch(error){const el=dialog.querySelector('#chapter-error');if(el)el.textContent=error.message;onError(error);}
    finally{busy=false;}
  }
  document.querySelector('#btn-life').addEventListener('click',open);
  strip.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-life-manage'))open();else if(b.hasAttribute('data-life-scope'))onScope(b.dataset.lifeScope||null);
  });
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-life-close'))dialog.close();
    if(b.hasAttribute('data-life-new')){editing=null;render();}
    if(b.dataset.lifeEdit){editing=b.dataset.lifeEdit;render();}
    if(b.dataset.lifeView){dialog.close();onScope(b.dataset.lifeView);}
    if(b.hasAttribute('data-life-backup'))onBackup();
    if(b.dataset.lifeDelete&&confirm('删除这个人生阶段？旅行、地点和资料会保留。'))run(async()=>{await repository.update(d=>deleteChapter(d,b.dataset.lifeDelete));editing=null;render();});
  });
  dialog.addEventListener('submit',e=>{
    e.preventDefault();const form=e.target,values=new FormData(form);
    run(async()=>{
      if(data().meta.origin==='demo')throw new Error('请先导入真实 CSV');
      const input={...(editing?{id:editing}:{}),title:values.get('title'),type:values.get('type'),start:partialDate(values.get('start')),end:partialDate(values.get('end'),{end:true}),homeAnchors:values.getAll('homeAnchors'),relatedTripIds:values.getAll('relatedTripIds')};
      await repository.update(d=>upsertChapter(d,input));editing=null;render();
    });
  });
  dialog.addEventListener('change',e=>{
    if(e.target.hasAttribute('data-life-restore')&&e.target.files[0])run(async()=>{await onRestore(e.target.files[0]);editing=null;render();});
  });
  repository.subscribe(()=>renderStrip());adapter.subscribe(()=>renderStrip());renderStrip();
  return {open,renderStrip};
}
