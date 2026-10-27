import {parseArtifact} from '../share.js';
export const publicationStates=['draft','publishing','published','failed','revoked'];
export class StoryPublisher {
  async publish(){throw new Error('未配置 Hosted Sharing 发布服务');}
  async update(){throw new Error('未配置 Hosted Sharing 发布服务');}
  async unpublish(){throw new Error('未配置 Hosted Sharing 发布服务');}
  async delete(){throw new Error('未配置 Hosted Sharing 发布服务');}
  async getPublication(){throw new Error('未配置 Hosted Sharing 发布服务');}
  async listPublications(){throw new Error('未配置 Hosted Sharing 发布服务');}
}
export class HttpStoryPublisher extends StoryPublisher {
  constructor({origin,fetch:fetcher=globalThis.fetch.bind(globalThis)}){super();this.origin=origin;this.fetch=fetcher;}
  async request(path='',{signal,...options}={}){
    const r=await this.fetch(this.origin+'/api/publications'+path,{credentials:'same-origin',cache:'no-store',...options,signal,headers:{'Content-Type':'application/json',...options.headers}});
    let value;try{value=await r.json();}catch{throw new Error('发布服务响应无效');}
    if(!r.ok)throw Object.assign(new Error(value.message||'发布失败'),{code:value.error,status:r.status});return value;
  }
  publish(artifact,{visibility='private',idempotencyKey=crypto.randomUUID(),signal}={}){return this.request('',{method:'POST',body:JSON.stringify({artifact:parseArtifact(artifact),visibility,idempotencyKey}),signal});}
  update(id,artifact,{visibility='private',revision,idempotencyKey=crypto.randomUUID(),signal}={}){return this.request('/'+encodeURIComponent(id),{method:'PUT',headers:{'If-Match':String(revision)},body:JSON.stringify({artifact:parseArtifact(artifact),visibility,idempotencyKey}),signal});}
  unpublish(id,{signal}={}){return this.request('/'+encodeURIComponent(id)+'/revoke',{method:'POST',signal});}
  delete(id,{signal}={}){return this.request('/'+encodeURIComponent(id),{method:'DELETE',signal});}
  getPublication(id,{signal}={}){return this.request('/'+encodeURIComponent(id),{signal});}
  async listPublications({signal}={}){return (await this.request('',{signal})).publications;}
}
