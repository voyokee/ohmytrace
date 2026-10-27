// No Cesium/DOM/storage dependencies. Each transition owns an abortable ticket;
// late renderer promises can never arm a timer or complete a newer transition.
export class StoryPlayback {
  constructor({enter=async()=>{},cancel=()=>{},exit=()=>{},now=()=>performance.now(),setTimer=(...args)=>setTimeout(...args),clearTimer=id=>clearTimeout(id),reducedMotion=false,transitionTimeout=10000}={}){
    Object.assign(this,{enter,cancel,exit,now,setTimer,clearTimer,reducedMotion,transitionTimeout});
    this.listeners=new Set();this.generation=0;this.status='idle';this.index=0;this.speed=1;this.scenes=[];this.remaining=null;
  }
  snapshot(){return {status:this.status,index:this.index,count:this.scenes.length,speed:this.speed,scene:this.scenes[this.index]||null,error:this.error||null};}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(type='state'){for(const listener of this.listeners)listener({...this.snapshot(),type});}
  load(story){this.stop();this.scenes=structuredClone(story.orderedScenes);this.speed=story.cameraPreferences.speed;this.motion=story.cameraPreferences.motion;this.index=0;this.status='idle';this.error=null;this.emit();}
  abort(){this.generation++;this.controller?.abort();this.controller=null;this.clearTimer(this.timer);this.clearTimer(this.deadline);this.timer=null;this.deadline=null;this.cancel();}
  async transition(index,{playing=this.status==='playing',instant=false}={}){
    if(!Number.isInteger(index)||index<0||index>=this.scenes.length)throw new Error('镜头位置无效');
    this.abort();const generation=this.generation;this.controller=new AbortController();const {signal}=this.controller;
    this.index=index;this.status=playing?'playing':'paused';this.error=null;this.remaining=null;this.started=null;this.emit('scenechanged');
    try {
      await Promise.race([
        Promise.resolve(this.enter(this.scenes[index],{signal,instant:instant||this.reducedMotion||this.motion==='reduced',speed:this.speed})),
        new Promise(resolve=>{signal.addEventListener('abort',()=>resolve(),{once:true});this.deadline=this.setTimer(()=>{if(generation===this.generation){this.cancel();resolve();}},this.transitionTimeout);})
      ]);
      if(signal.aborted||generation!==this.generation)return;
      this.clearTimer(this.deadline);
      if(this.status==='playing')this.schedule(this.scenes[index].duration*1000/this.speed);
      this.emit('ready');
    }catch(error){if(signal.aborted||generation!==this.generation)return;this.abort();this.status='error';this.error=error.message;this.emit();}
  }
  schedule(ms){
    this.remaining=ms;this.started=this.now();const generation=this.generation;
    this.timer=this.setTimer(()=>{
      if(generation!==this.generation||this.status!=='playing')return;
      if(this.index+1<this.scenes.length)this.transition(this.index+1,{playing:true});
      else {this.abort();this.status='ended';this.emit('ended');}
    },ms);
  }
  play(){if(!this.scenes.length)return Promise.resolve();return this.transition(this.status==='ended'?0:this.index,{playing:true});}
  pause(){if(this.status!=='playing')return;const remaining=this.started!==null&&this.remaining!==null?Math.max(0,this.remaining-(this.now()-this.started)):null;
    this.abort();this.remaining=remaining;this.status='paused';this.emit();}
  resume(){if(this.status!=='paused')return this.play();if(this.remaining===null)return this.transition(this.index,{playing:true});this.status='playing';this.schedule(this.remaining);this.emit();}
  stop(){this.abort();this.status='stopped';this.index=0;this.remaining=null;this.error=null;this.exit();this.emit('stopped');}
  seek(index){return this.transition(index);}
  next(){return this.seek(Math.min(this.scenes.length-1,this.index+1));}
  previous(){return this.seek(Math.max(0,this.index-1));}
  setSpeed(speed){if(!Number.isFinite(speed)||speed<.25||speed>4)throw new Error('回放速度超出范围');
    const old=this.speed;this.speed=speed;if(this.remaining!==null){this.remaining=Math.max(0,this.remaining-(this.status==='playing'?(this.now()-this.started):0))*old/speed;
      if(this.status==='playing'){this.clearTimer(this.timer);this.schedule(this.remaining);}}
    this.emit();}
  dispose(){this.stop();this.listeners.clear();}
}
