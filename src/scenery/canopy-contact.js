import {steppeWeight} from './world-biomes.js';
import {mapPixel,elevationAt} from './world-elevation.js?v=20261025-groves';
// Once-per-world CPU bake, normally in the Worker. One small texture sample replaces thousands
// of dynamic shadow casters. Geographic radius follows the actual instanced crown footprint.
export function makeCanopyContact(forest,{constrained=false,dayMap,heightMap}={}) {
  const width=constrained?512:1024,height=width/2,data=new Uint8ClampedArray(width*height*4);
  for(let i=3;i<data.length;i+=4)data[i]=255;
  for(const chunk of forest.chunks)for(const p of chunk.plants) {
    const x=(p.lon+180)/360*width-.5,y=(90-p.lat)/180*height-.5;
    const radius=p.height*p.width*(p.species==='tropical'?.38:p.species==='birch'?.23:.30);
    const ry=Math.max(.55,radius/111320/180*height),rx=ry/Math.max(.25,Math.cos(p.lat*Math.PI/180));
    for(let j=Math.max(0,Math.floor(y-ry*1.8));j<=Math.min(height-1,Math.ceil(y+ry*1.8));j++)
      for(let i=Math.floor(x-rx*1.8);i<=Math.ceil(x+rx*1.8);i++) {
        const d=((i-x)/rx)**2+((j-y)/ry)**2;if(d>3.24)continue;
        const k=(j*width+(i%width+width)%width)*4;
        data[k]=Math.min(255,data[k]+Math.round(185*Math.exp(-d*1.4)));
      }
  }
  // A second packed channel gently separates open steppe from dry bare ground. The image's
  // green/yellow balance remains authoritative; water, snow and desert cores are left unchanged.
  if(dayMap&&heightMap)for(let j=0;j<height;j++) {
    const lat=90-(j+.5)/height*180;if(lat<38||lat>55)continue;
    for(let i=0;i<width;i++) {
      const lon=(i+.5)/width*360-180;if(lon<85||lon>130)continue;
      const h=elevationAt(heightMap,lon,lat),[r,g,b]=mapPixel(dayMap,lon,lat);
      if(h<35||g<.15||g<r*.92||b>g*.97||Math.min(r,g,b)>.72)continue;
      data[(j*width+i)*4+1]=Math.round(steppeWeight(lon,lat,h)*255);
    }
  }
  return {width,height,data};
}
