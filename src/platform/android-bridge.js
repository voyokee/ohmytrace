/** Origin-scoped WebMessageListener, installed only by the bundled Android app. */
export class AndroidPhotoBridge {
  constructor(port=globalThis.OhMyTraceMedia){
    if(!port?.postMessage)throw new Error('Android 相册通道不可用');
    this.port=port;this.pending=new Map();this.sequence=0;
    port.onmessage=event=>{let response;try{response=JSON.parse(event.data);}catch{return;}
      const job=this.pending.get(response.id);if(!job)return;this.pending.delete(response.id);job.cleanup();
      response.error?job.reject(new Error(response.error)):job.resolve(response.result);
    };
  }
  call(method,params={}, {signal,timeoutMs=60000}={}){
    signal?.throwIfAborted();const id=String(++this.sequence);
    return new Promise((resolve,reject)=>{
      const abort=()=>{this.pending.delete(id);cleanup();this.port.postMessage(JSON.stringify({id:`cancel-${id}`,method:'cancel',params:{requestId:id}}));reject(signal.reason||new DOMException('已取消','AbortError'));};
      const timer=setTimeout(()=>{this.pending.delete(id);cleanup();this.port.postMessage(JSON.stringify({id:`cancel-${id}`,method:'cancel',params:{requestId:id}}));reject(new Error('本机操作超时，请重试'));},timeoutMs);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
      this.pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true});
      try{this.port.postMessage(JSON.stringify({id,method,params}));}catch(error){this.pending.delete(id);cleanup();reject(error);}
    });
  }
}
const bridges=new WeakMap();
export function androidBridge(port=globalThis.OhMyTraceMedia){if(!port?.postMessage)return null;if(!bridges.has(port))bridges.set(port,new AndroidPhotoBridge(port));return bridges.get(port);}
