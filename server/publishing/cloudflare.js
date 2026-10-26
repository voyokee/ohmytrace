import {createPublicationService,digest} from './service.js';
// D1 owns metadata and CAS; private R2 binding owns validated artifact bytes.
export function cloudflarePublisher(env,{origin,editorOrigin}){
  const store={
    async get(id){const r=await env.DB.prepare('SELECT payload FROM publications WHERE id = ?').bind(id).first();return r?JSON.parse(r.payload):null;},
    async list(owner){const r=await env.DB.prepare('SELECT payload FROM publications WHERE owner = ? ORDER BY updated_at DESC LIMIT 1000').bind(owner).all();return r.results.map(r=>JSON.parse(r.payload));},
    async insert(r){await env.DB.prepare('INSERT OR IGNORE INTO publications (id, owner, revision, updated_at, payload) VALUES (?, ?, ?, ?, ?)').bind(r.id,r.owner,r.revision,r.updatedAt,JSON.stringify(r)).run();},
    async replace(id,revision,r){const result=await env.DB.prepare('UPDATE publications SET revision = ?, updated_at = ?, payload = ? WHERE id = ? AND revision = ?').bind(r.revision,r.updatedAt,JSON.stringify(r),id,revision).run();return result.meta.changes===1;}
  };
  const objects={async put(key,raw){await env.BUCKET.put(key,raw,{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});},async get(key){const object=await env.BUCKET.get(key);return object?object.text():null;},async delete(key){await env.BUCKET.delete(key);},async deletePrefix(prefix){let cursor;do{const result=await env.BUCKET.list({prefix,cursor,limit:1000});if(result.objects.length)await env.BUCKET.delete(result.objects.map(v=>v.key));cursor=result.truncated?result.cursor:undefined;}while(cursor);}};
  async function identify(request){
    const native=request.headers.get('oai-authenticated-user-id');if(native)return 'sites:'+native;
    // Optional dedicated automation account. A one-way hash is configured only
    // as a runtime secret; it grants no access to any visitor's publications.
    const bearer=request.headers.get('Authorization')?.match(/^Bearer ([-\w]{32,256})$/)?.[1];
    if(bearer&&env.PUBLISHER_AUTOMATION_ACCOUNTS){const accounts=JSON.parse(env.PUBLISHER_AUTOMATION_ACCOUNTS),id=accounts[await digest(bearer)];if(typeof id==='string'&&/^[-\w]{1,64}$/.test(id))return 'automation:'+id;}
    return null;
  }
  return createPublicationService({store,objects,identify,origin,editorOrigin});
}
