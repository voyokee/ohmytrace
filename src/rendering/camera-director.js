// Flight tickets prevent a cancelled flight from completing a newer scene transition.
export class CameraDirector {
  constructor(viewer){this.viewer=viewer;this.generation=0;this.phase='global';this.target=null;}
  begin(phase,target=null){this.generation++;this.phase=phase;this.target=target;this.publish();return this.generation;}
  finish(ticket,phase){if(ticket!==this.generation)return false;this.phase=phase;this.publish();return true;}
  update({altitude,flying,scenery}) {
    if(!flying)this.phase=scenery?'immersive':altitude>2400000?'global':'place';
    this.publish();
  }
  publish(){if(this.viewer?.canvas)this.viewer.canvas.dataset.cameraPhase=this.phase;}
  details(){return {cameraPhase:this.phase,cameraGeneration:this.generation};}
}
