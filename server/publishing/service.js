import {parseArtifact} from '../../src/life/story/share.js';
export const MAX_BODY=24*1024*1024+8192;
export const visibilityModes=['private','unlisted','public'];
const encode=new TextEncoder();
export const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');
const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;let x=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)x|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return x===0;};
async function body(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'json_required','需要 JSON 请求');
  const reader=request.body?.getReader();if(!reader)fail(400,'empty_body','缺少请求内容');let length=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_BODY){await reader.cancel();fail(413,'too_large','作品超过上传限制');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'invalid_json','无效 JSON');}
}
export function publicationView(row,origin){
  return {id:row.id,storyId:row.storyId,title:row.title,status:row.status,visibility:row.visibility,revision:row.revision,updatedAt:row.updatedAt,deleted:!!row.deleted,
    url:row.deleted||row.status!=='published'?null:`${origin}/index.html?publication=${row.id}${row.visibility==='unlisted'?'#key='+row.linkToken:''}`};
}
// All writes receive an authenticated owner from the host adapter. The core has
// no vendor SDK, no canonical database access and no public object-storage URL.
export function createPublicationService({store,objects,identify,origin,editorOrigin}){
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie, Authorization','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
  async function owner(request){const id=await identify(request);if(!id)fail(401,'sign_in','请先在故事站点登录');return id;}
  async function owned(id,identity){const row=await store.get(id);if(!row||row.owner!==identity)fail(404,'not_found','作品不存在或无权访问');return row;}
  async function validate(input){
    if(!visibilityModes.includes(input.visibility))fail(400,'visibility','无效分享权限');
    let artifact;try{artifact=parseArtifact(input.artifact);}catch(e){fail(400,'artifact',e.message);}
    const raw=JSON.stringify(artifact),hash=await digest(input.visibility+'\n'+raw);return {artifact,raw,hash};
  }
  function key(input){if(typeof input.idempotencyKey!=='string'||!/^[-\w]{16,128}$/.test(input.idempotencyKey))fail(400,'idempotency','缺少有效的幂等请求编号');return input.idempotencyKey;}
  async function finalize(row,raw,hash,next){
    const objectKey=`stories/${row.id}/${next.revision}-${hash}.json`;await objects.put(objectKey,raw);
    try{
      const changed=await store.replace(row.id,row.revision,{...next,objectKey});
      if(!changed){const current=await store.get(row.id);if(current?.objectKey!==objectKey)await objects.delete(objectKey);fail(409,'conflict','作品已改变，请刷新发布状态后重试');}
      // A concurrent revocation is authoritative even after the upload finishes.
      const current=await store.get(row.id);if(current?.status!=='published'||current.objectKey!==objectKey){if(current?.objectKey!==objectKey||current.status!=='published')await objects.delete(objectKey);fail(409,'conflict','作品已撤销或更新');}
      if(row.objectKey&&row.objectKey!==objectKey)await objects.delete(row.objectKey);
      return current;
    }catch(e){const current=await store.get(row.id);if(current?.objectKey!==objectKey||current.status!=='published')await objects.delete(objectKey);throw e;}
  }
  async function handle(request){
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
    if(!path.startsWith('/api/publications'))return null;
    try{
      // Browser writes are same-origin only; CORS is deliberately absent. The
      // reviewed Editor talks to the authenticated Site popup via postMessage.
      if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')&&request.headers.get('origin')!==origin)fail(403,'origin','请求来源不受信任');
      const match=path.match(/^\/api\/publications(?:\/([a-f0-9]{64})(?:\/(content|revoke))?)?$/);if(!match)fail(404,'not_found','未找到接口');
      const [,id,action]=match;
      if(id&&action==='content'&&request.method==='GET'){
        const row=await store.get(id);if(!row||row.deleted||row.status!=='published')fail(404,'not_found','故事已撤销或不存在');
        const identity=await identify(request),token=request.headers.get('X-Story-Key');
        if(row.visibility!=='public'&&row.owner!==identity&&!(row.visibility==='unlisted'&&equal(token,row.linkToken)))fail(404,'not_found','故事不存在或需要访问凭据');
        const raw=await objects.get(row.objectKey);const current=await store.get(id);
        if(!raw||current?.status!=='published'||current.revision!==row.revision)fail(409,'changed','故事已改变，请重新加载');
        return new Response(raw,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie, Authorization, X-Story-Key','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
      }
      const identity=await owner(request);
      if(!id&&request.method==='GET')return json({publications:(await store.list(identity)).map(row=>publicationView(row,origin))});
      if(!id&&request.method==='POST'){
        const input=await body(request),requestKey=key(input),{artifact,raw,hash}=await validate(input),id=await digest(identity+'\n'+requestKey);
        let row=await store.get(id);
        if(row){if(row.owner!==identity||row.hash!==hash||row.createKey!==requestKey)fail(409,'idempotency','同一请求编号不能用于另一份作品');if(row.status==='published')return json(publicationView(row,origin));if(row.status==='revoked')fail(409,'revoked','此发布已撤销，请创建新的发布');}
        else{
          if((await store.list(identity)).filter(r=>!r.deleted).length>=100)fail(409,'quota','最多保留 100 份发布，请先删除旧作品');
          row={id,owner:identity,storyId:artifact.storyId,title:artifact.title,status:'publishing',visibility:input.visibility,revision:0,hash,createKey:requestKey,lastKey:requestKey,linkToken:random(),objectKey:null,deleted:false,updatedAt:new Date().toISOString()};
          await store.insert(row);row=await store.get(id);if(row.owner!==identity||row.hash!==hash)fail(409,'conflict','发布请求已改变');
        }
        const result=await finalize(row,raw,hash,{...row,status:'published',revision:1,updatedAt:new Date().toISOString()});return json(publicationView(result,origin),201);
      }
      if(!id)fail(405,'method','方法不支持');
      const row=await owned(id,identity);
      if(!action&&request.method==='GET')return json(publicationView(row,origin));
      if(!action&&request.method==='PUT'){
        const input=await body(request),requestKey=key(input),{artifact,raw,hash}=await validate(input);
        if(row.lastKey===requestKey&&row.hash===hash&&row.status==='published')return json(publicationView(row,origin));
        if(row.deleted||row.status!=='published')fail(409,'revoked','已撤销的故事需要重新发布');
        if(request.headers.get('If-Match')!==String(row.revision))fail(409,'conflict','其他窗口已更新这份作品，请刷新状态');
        if(artifact.storyId!==row.storyId)fail(400,'story_id','不能替换为另一份故事');
        const result=await finalize(row,raw,hash,{...row,title:artifact.title,visibility:input.visibility,hash,lastKey:requestKey,revision:row.revision+1,updatedAt:new Date().toISOString()});return json(publicationView(result,origin));
      }
      if(action==='revoke'&&request.method==='POST'||!action&&request.method==='DELETE'){
        const deleting=request.method==='DELETE';
        if(row.status!=='revoked'||deleting&&!row.deleted){if(!await store.replace(id,row.revision,{...row,status:'revoked',deleted:deleting||row.deleted,revision:row.revision+1,updatedAt:new Date().toISOString()}))fail(409,'conflict','状态已改变，请刷新后重试');}
        // State changes before storage cleanup. Failure is visible and retryable;
        // denied reads do not depend on successful cleanup or CDN invalidation.
        await objects.deletePrefix(`stories/${id}/`);
        return json(publicationView(await store.get(id),origin));
      }
      fail(405,'method','方法不支持');
    }catch(e){return json({error:e.code||'storage_unavailable',message:e.status?e.message:'发布服务暂时不可用；保留当前草稿并重试'},e.status||503);}
  }
  return {handle,editorOrigin};
}
