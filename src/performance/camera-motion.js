// Motion-quality decisions use actual camera pose, independently of native moveEnd timing.
// Keep subpixel numerical jitter from pinning a stationary globe in animation quality forever.
export function createCameraMotionTracker({settleMs=800,positionEpsilon=.01,relativePositionEpsilon=1e-6,angleEpsilon=1e-6}={}) {
  const previous=new Float64Array(9),sample=new Float64Array(9),vectors=['positionWC','directionWC','upWC'];
  let initialized=false,lastMoved=0,lastSample=0,translation=0,rotation=0;
  return {
    update(camera,now) {
      let offset=0;
      for(const key of vectors) {
        const vector=camera[key];
        sample[offset++]=vector?.x;sample[offset++]=vector?.y;sample[offset++]=vector?.z;
      }
      if(!Number.isFinite(now)||!sample.every(Number.isFinite)){
        if(Number.isFinite(now))lastMoved=now;
        return true;
      }
      if(now<lastSample)initialized=false;
      lastSample=now;
      translation=Math.hypot(sample[0]-previous[0],sample[1]-previous[1],sample[2]-previous[2]);
      rotation=Math.max(Math.hypot(sample[3]-previous[3],sample[4]-previous[4],sample[5]-previous[5]),
        Math.hypot(sample[6]-previous[6],sample[7]-previous[7],sample[8]-previous[8]));
      const altitude=camera.positionCartographic?.height,height=Number.isFinite(altitude)?Math.abs(altitude):0,
        threshold=Math.max(positionEpsilon,height*relativePositionEpsilon);
      if(!initialized||translation>threshold||rotation>angleEpsilon){
        previous.set(sample);lastMoved=now;initialized=true;
      }
      return now-lastMoved<settleMs;
    },
    details:()=>({cameraStillMs:Math.max(0,Math.round(lastSample-lastMoved)),
      cameraMotionMeters:+translation.toFixed(4),cameraMotionAngle:+rotation.toFixed(9)}),
  };
}
