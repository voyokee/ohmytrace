import {HttpStoryPublisher} from './publisher.js';
const status=document.querySelector('#status'),signin=document.querySelector('#signin'),nonce=location.hash.slice(1),jobs=new Map();
const config=await fetch('/runtime-config.json',{cache:'no-store'}).then(r=>r.json());
const publisher=new HttpStoryPublisher({origin:location.origin});
const allowed=new Set(['publish','update','unpublish','delete','getPublication','listPublications']);
const ready=()=>window.opener?.postMessage({type:'publisher-ready',nonce},config.editorOrigin);
async function boot(){
  if(!config.editorOrigin||!/^[-\w]{16,128}$/.test(nonce)||!window.opener){status.textContent='请从人生故事编辑器打开发布窗口。';return;}
  try{await publisher.listPublications();status.textContent='已登录。回到编辑器发布或管理审核后的作品。';ready();setInterval(ready,1500);}
  catch(e){if(e.status===401){status.textContent='先登录故事站点，再回到编辑器重试。';signin.href='/signin-with-chatgpt?return_to='+encodeURIComponent('/publisher.html#'+nonce);signin.hidden=false;}else status.textContent=e.message;}
}
window.addEventListener('message',async e=>{
  if(e.origin!==config.editorOrigin||e.source!==window.opener||e.data?.nonce!==nonce)return;
  const {id,type,method,args}=e.data;
  if(type==='publisher-cancel'){jobs.get(id)?.abort();return;}
  if(type!=='publisher-request'||!allowed.has(method)||!Array.isArray(args)||jobs.has(id))return;
  const controller=new AbortController();jobs.set(id,controller);status.textContent='正在处理发布请求…';
  try{const params=[...args];if(['publish','update'].includes(method))params[params.length-1]={...params.at(-1),signal:controller.signal};else params.push({signal:controller.signal});
    const result=await publisher[method](...params);e.source.postMessage({type:'publisher-response',nonce,id,result},e.origin);status.textContent='请求完成，可回到编辑器。';}
  catch(error){e.source.postMessage({type:'publisher-response',nonce,id,error:{code:error.code||'request_failed',message:error.message}},e.origin);status.textContent=error.message;}
  finally{jobs.delete(id);}
});
boot();
