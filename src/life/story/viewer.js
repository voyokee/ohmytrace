import {parseArtifact} from './share.js';

export function mountStandaloneViewer({onLoad,onStop}){
  const panel=document.createElement('section');panel.id='story-loader';panel.className='glass';
  // Visitors normally arrive through a share link; the landing copy only appears
  // when no work is attached, and the JSON file input stays a secondary path.
  panel.innerHTML='<h2 data-story-load-title>正在打开分享…</h2><p data-story-load-intro></p><div class="story-loader-actions" data-story-landing hidden><button class="btn primary" data-story-demo>看一段示例</button><a class="btn" data-story-editor hidden>记录我自己的足迹 →</a></div><label class="story-file-link" data-story-landing hidden>已有分享文件？<span>打开文件</span><input data-story-file type="file" accept="application/json,.json" hidden></label><p data-story-load-status role="status"></p><p data-story-load-error role="alert"></p>';
  document.body.append(panel);
  const message=value=>{panel.querySelector('[data-story-load-status]').textContent=value;};
  const error=value=>{panel.querySelector('[data-story-load-error]').textContent=value;};
  async function landing(title){
    panel.querySelector('[data-story-load-title]').textContent=title;
    panel.querySelector('[data-story-load-intro]').textContent='打开别人发给你的分享链接，就能在地球上回看对方走过的地方。这个页面只读，不会读取你的照片或数据。';
    for(const el of panel.querySelectorAll('[data-story-landing]'))el.hidden=false;
    // A deployed Viewer only knows its Editor through runtime configuration; the
    // buildless development page sits next to the Editor's index.html.
    let editor=/story-viewer\.html$/.test(globalThis.location?.pathname||'')?'./':null;
    try{const config=await fetch('./runtime-config.json',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null);if(config?.editorOrigin)editor=config.editorOrigin+'/';}catch{}
    const link=panel.querySelector('[data-story-editor]');if(editor){link.href=editor;link.hidden=false;}
  }
  let generation=0,controller;
  const begin=()=>{controller?.abort();controller=new AbortController();error('');return {id:++generation,signal:controller.signal};};
  const current=ticket=>ticket.id===generation;
  async function load(input,ticket=begin()){
    if(!current(ticket))return;
    const artifact=parseArtifact(input);onStop();document.querySelector('#brand h1').textContent=artifact.title;
    await onLoad(artifact);if(current(ticket)){message('作品已载入');error('');}
  }
  panel.addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;const ticket=begin();
    try{if(file.size>24*1024*1024)throw new Error('作品超过 24 MiB 限制');await load(await file.text(),ticket);}
    catch(e){if(current(ticket))error(e.message);}finally{e.target.value='';}
  });
  panel.addEventListener('click',async e=>{
    if(!e.target.closest('[data-story-demo]'))return;const ticket=begin();
    try{const r=await fetch('./src/life/story/demo.story.json',{signal:ticket.signal});if(!r.ok)throw new Error('示例暂不可用');await load(await r.text(),ticket);}
    catch(e){if(current(ticket))error(e.message);}
  });
  // No URL-supplied data path, database key or debug bridge. A deployed package
  // always reads its own fixed, minimal story.json, with an optional SHA-256.
  (async()=>{
    const ticket=begin(),signal=AbortSignal.any([ticket.signal,AbortSignal.timeout(30000)]);
    try{
      const params=new URLSearchParams(globalThis.location?.search||''),publication=params.get('publication');
      if(publication!==null){
        if(!/^[a-f0-9]{64}$/.test(publication))throw new Error('故事链接无效');
        const key=location.hash.match(/^#key=([a-f0-9]{64})$/)?.[1];
        const response=await fetch('/api/publications/'+publication+'/content',{signal,cache:'no-store',credentials:'same-origin',headers:key?{'X-Story-Key':key}:{}});
        if(!response.ok){const login=document.createElement('a');login.textContent='所有者登录';login.className='btn';login.target='_top';login.href='/signin-with-chatgpt?return_to='+encodeURIComponent(location.pathname+location.search+location.hash);panel.append(login);throw new Error('故事不存在、已撤销或需要访问凭据');}
        await load(await response.text(),ticket);if(current(ticket))panel.querySelector('[data-story-demo]').hidden=true;return;
      }
      const response=await fetch('./story.json',{signal,cache:'no-store'});if(!current(ticket))return;
      if(!response.ok){await landing('这里是足迹分享页');return;}
      if(Number(response.headers.get('content-length'))>24*1024*1024)throw new Error('作品过大');
      const raw=await response.text();
      const digest=await fetch('./story.sha256',{signal,cache:'no-store'});
      if(digest.ok){const expected=(await digest.text()).trim(),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(expected!==actual)throw new Error('分享作品校验失败，文件可能不完整');}
      await load(raw,ticket);if(current(ticket))panel.querySelector('[data-story-demo]').hidden=true;
    }catch(e){if(current(ticket)){error('分享加载失败：'+e.message+'。');await landing('这个分享暂时打不开');}}
  })();
  return {load};
}
