import {parseArtifact} from './share.js';

export function mountStandaloneViewer({onLoad,onStop}){
  const panel=document.createElement('section');panel.id='story-loader';panel.className='glass';
  panel.innerHTML='<h2>观看人生故事</h2><p>作品只读，无需登录、CSV 或个人数据库。可加载 Story JSON，或观看虚构示例。</p><label class="btn primary">选择 Story JSON<input data-story-file type="file" accept="application/json,.json" hidden></label> <button class="btn" data-story-demo>体验虚构示例</button><p data-story-load-status role="status"></p><p data-story-load-error role="alert"></p>';
  document.body.append(panel);
  const message=value=>{panel.querySelector('[data-story-load-status]').textContent=value;};
  const error=value=>{panel.querySelector('[data-story-load-error]').textContent=value;};
  async function load(input){const artifact=parseArtifact(input);onStop();document.querySelector('#brand h1').textContent=artifact.title;await onLoad(artifact);message('作品已载入');error('');}
  panel.addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>24*1024*1024)throw new Error('作品超过 24 MiB 限制');await load(await file.text());}catch(e){error(e.message);}finally{e.target.value='';}});
  panel.addEventListener('click',async e=>{if(!e.target.closest('[data-story-demo]'))return;try{const r=await fetch('./src/life/story/demo.story.json');if(!r.ok)throw new Error('示例暂不可用');await load(await r.text());}catch(e){error(e.message);}});
  // No URL-supplied data path, database key or debug bridge. A deployed package
  // always reads its own fixed, minimal story.json, with an optional SHA-256.
  (async()=>{
    try{
      const response=await fetch('./story.json',{signal:AbortSignal.timeout(5000),cache:'no-store'});
      if(!response.ok){message('此页面未附带作品，请选择 Story JSON。');return;}
      if(Number(response.headers.get('content-length'))>24*1024*1024)throw new Error('作品过大');
      const raw=await response.text();
      const digest=await fetch('./story.sha256',{signal:AbortSignal.timeout(5000),cache:'no-store'});
      if(digest.ok){const expected=(await digest.text()).trim(),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(expected!==actual)throw new Error('分享作品校验失败，文件可能不完整');}
      await load(raw);
      panel.querySelector('[data-story-demo]').hidden=true;
    }catch(e){error('作品加载失败：'+e.message+'。仍可选择本地 Story JSON。');}
  })();
  return {load};
}
