import {esc} from '../schema.js';
export function createPublishingPanel({publisher,getArtifact,isApproved}){
  const el=document.createElement('section');el.className='story-hosted';el.setAttribute('aria-label','在线分享');
  let publication=null,visibility='private',status='draft',message='',busy=false,controller=null,intent=null,items=[];
  const names={draft:'草稿',publishing:'正在发布',published:'已发布',failed:'失败，可重试',revoked:'已撤销'};
  function render(){
    const approved=isApproved();el.innerHTML=`<h4>在线分享 · ${names[status]||status}</h4>${publisher?`
    <label class="life-field">访问权限<select data-publish-visibility ${busy?'disabled':''}><option value="private">Private · 仅所有者登录可读</option><option value="unlisted">Unlisted · 持有链接的人可读</option><option value="public">Public · 明确公开</option></select></label>
    <p class="hint">发布前需完成上方隐私审核。Public 可被任何人访问；Unlisted 链接包含访问凭据，请只发给允许的人。撤销会拒绝后续读取，已经下载的内容无法召回。</p>
    <div class="row-actions"><button class="btn primary" data-publish ${!approved||busy?'disabled':''}>${publication?.status==='published'?'更新已发布故事':'发布故事'}</button><button class="btn" data-publish-refresh ${busy?'disabled':''}>刷新我的发布</button>${busy?'<button class="btn" data-publish-cancel>取消等待</button>':''}</div>
    ${publication?.url?`<p><a data-publication-url href="${esc(publication.url)}" target="_blank" rel="noopener noreferrer">打开故事链接</a> <button class="btn sm" data-publish-copy>复制链接</button></p>`:''}
    ${items.length?`<details ${publication?'':'open'}><summary>我的发布 · ${items.length}</summary>${items.map(p=>`<div class="story-publication"><span>${esc(p.title)} · ${esc(names[p.status]||p.status)} · ${esc(p.visibility)}</span> <button class="btn sm" data-publish-select="${esc(p.id)}" ${busy?'disabled':''}>查看状态</button> <button class="btn sm" data-publish-revoke="${esc(p.id)}" ${busy||p.status==='revoked'?'disabled':''}>撤销链接</button> <button class="btn sm" data-publish-delete="${esc(p.id)}" ${busy||p.deleted?'disabled':''}>删除云端作品</button></div>`).join('')}</details>`:''}`:'<p class="hint">此环境未配置在线发布。仍可导出 JSON 和静态 ZIP 分享包。</p>'}
    <p data-publish-status role="status">${esc(message)}</p>`;
    const select=el.querySelector('[data-publish-visibility]');if(select)select.value=visibility;
  }
  async function perform(run){busy=true;controller=new AbortController();status='publishing';message='正在处理。首次使用请在故事窗口完成登录。';render();
    try{await run(controller.signal);message='已与发布服务确认状态。';}
    catch(e){status='failed';message=e.name==='AbortError'?'已取消等待。已到达服务器的请求可能完成，请刷新我的发布确认；重试会复用请求编号。':e.message;}
    finally{busy=false;controller=null;render();}
  }
  el.addEventListener('change',e=>{if(e.target.matches('[data-publish-visibility]')){visibility=e.target.value;intent=null;}});
  el.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-publish-cancel')){controller?.abort();return;}
    if(b.hasAttribute('data-publish-copy')){try{await navigator.clipboard.writeText(publication.url);message='链接已复制';}catch{message='请长按故事链接复制';}render();return;}
    if(busy||!publisher)return;
    if(b.hasAttribute('data-publish')){
      if(!isApproved())return;const artifact=getArtifact();if(!artifact)return;
      const fingerprint=JSON.stringify({artifact,visibility});if(intent?.fingerprint!==fingerprint)intent={fingerprint,key:crypto.randomUUID()};
      await perform(async signal=>{const own=publication?.status==='published'&&publication.storyId===artifact.storyId;
        publication=own?await publisher.update(publication.id,artifact,{visibility,revision:publication.revision,idempotencyKey:intent.key,signal}):await publisher.publish(artifact,{visibility,idempotencyKey:intent.key,signal});
        status=publication.status;items=await publisher.listPublications({signal});intent=null;});return;
    }
    if(b.hasAttribute('data-publish-refresh'))await perform(async signal=>{items=await publisher.listPublications({signal});if(publication)publication=items.find(p=>p.id===publication.id)||null;status=publication?.status||'draft';});
    if(b.hasAttribute('data-publish-select')){publication=items.find(p=>p.id===b.dataset.publishSelect);visibility=publication.visibility;status=publication.status;message=publication.storyId===getArtifact()?.storyId?'此发布关联当前草稿。':'这是另一份故事。可打开、撤销或删除；发布当前草稿会创建新链接。';render();}
    for(const [attr,method] of [['data-publish-revoke','unpublish'],['data-publish-delete','delete']])if(b.hasAttribute(attr))await perform(async signal=>{const id=b.getAttribute(attr),result=await publisher[method](id,{signal});if(publication?.id===id)publication=result;items=await publisher.listPublications({signal});status=publication?.status||'draft';});
  });
  render();return {element:el,refresh:render,cancel(){controller?.abort();}};
}
