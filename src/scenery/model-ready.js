export function waitForModelReady(model,signal) {
  signal?.throwIfAborted();
  if(model.ready)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    let offReady,offError;
    const clean=()=>{offReady?.();offError?.();signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{clean();reject(new DOMException('Model preparation cancelled','AbortError'));};
    offReady=model.readyEvent.addEventListener(()=>{clean();resolve();});
    offError=model.errorEvent.addEventListener(error=>{clean();reject(error);});
    signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  });
}
