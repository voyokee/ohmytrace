import {StoryPublisher} from './publisher.js';
// Authentication stays on the Story origin. Neither cookies nor credentials
// cross to Editor; only reviewed artifact RPCs use this explicit origin channel.
export class PopupStoryPublisher extends StoryPublisher {
  constructor({origin}){super();this.origin=origin;this.nonce=crypto.randomUUID();this.pending=new Map();this.popup=null;this.ready=false;this.waiters=[];
    this.listener=e=>{if(e.origin!==this.origin||e.source!==this.popup||e.data?.nonce!==this.nonce)return;
      if(e.data.type==='publisher-ready'){this.ready=true;this.waiters.splice(0).forEach(f=>f());return;}
      const job=this.pending.get(e.data.id);if(!job)return;this.pending.delete(e.data.id);job.clean();e.data.error?job.reject(Object.assign(new Error(e.data.error.message),{code:e.data.error.code})):job.resolve(e.data.result);
    };window.addEventListener('message',this.listener);
  }
  connect(){
    if(!this.popup||this.popup.closed){this.ready=false;this.popup=window.open(this.origin+'/publisher.html#'+this.nonce,'ohmytrace-publisher','popup,width=620,height=720');}
    if(!this.popup)throw new Error('请允许打开故事发布窗口后重试');this.popup.focus();
  }
  async call(method,args=[],{signal}={}){
    this.connect();if(signal?.aborted)throw new DOMException('已取消','AbortError');
    if(!this.ready)await new Promise((resolve,reject)=>{
      const clean=()=>{clearTimeout(timer);this.waiters=this.waiters.filter(f=>f!==done);signal?.removeEventListener('abort',abort);};
      const done=()=>{clean();resolve();},abort=()=>{clean();reject(new DOMException('已取消','AbortError'));};
      const timer=setTimeout(()=>{clean();reject(new Error('请在故事窗口完成登录，再重试发布'));},60000);
      this.waiters.push(done);signal?.addEventListener('abort',abort,{once:true});
    });
    if(signal?.aborted)throw new DOMException('已取消','AbortError');
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID(),abort=()=>{this.popup?.postMessage({type:'publisher-cancel',nonce:this.nonce,id},this.origin);this.pending.delete(id);clean();reject(new DOMException('已取消；若请求已到服务器，请刷新状态确认','AbortError'));};
      const timer=setTimeout(()=>{this.pending.delete(id);clean();reject(new Error('发布响应超时，请刷新状态或使用同一请求重试'));},120000);
      const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};signal?.addEventListener('abort',abort,{once:true});this.pending.set(id,{resolve,reject,clean});
      this.popup.postMessage({type:'publisher-request',nonce:this.nonce,id,method,args},this.origin);
    });
  }
  publish(artifact,{signal,...options}={}){return this.call('publish',[artifact,options],{signal});}
  update(id,artifact,{signal,...options}={}){return this.call('update',[id,artifact,options],{signal});}
  unpublish(id,options={}){return this.call('unpublish',[id],options);}
  delete(id,options={}){return this.call('delete',[id],options);}
  getPublication(id,options={}){return this.call('getPublication',[id],options);}
  listPublications(options={}){return this.call('listPublications',[],options);}
  dispose(){window.removeEventListener('message',this.listener);for(const job of this.pending.values()){job.clean();job.reject(new Error('发布窗口已关闭'));}this.pending.clear();this.popup?.close();}
}
