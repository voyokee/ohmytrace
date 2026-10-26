// Small generated EXIF fixtures. Expected values in tests are independent of
// parser internals; both TIFF byte orders and malformed offsets are exercised.
import {readFileSync} from 'node:fs';
const image=readFileSync(new URL('./fixtures/photo-base.jpg',import.meta.url));
export function photoJPEG({time='2025:05:01 10:30:00',offset='+08:00',lat=39.9,lon=116.4,altitude=50,orientation=6,little=true,nonce=0,subsecond=null}={}) {
  const text=s=>[...new TextEncoder().encode(s+'\0')];
  const dms=value=>{const total=Math.round(Math.abs(value)*3600*1e6),d=Math.floor(total/(3600*1e6)),rest=total-d*3600*1e6,m=Math.floor(rest/(60*1e6));return [d,1,m,1,rest-m*60*1e6,1e6];};
  const root=[[0x112,3,[orientation]],[0x8769,4,[0]],[0x8825,4,[0]]];
  const exif=[];if(time!==null)exif.push([0x9003,2,text(time)]);if(offset!==null)exif.push([0x9011,2,text(offset)]);
  exif.push([0xc7a1,4,[nonce]]);if(subsecond!==null)exif.push([0x9291,2,text(subsecond)]);
  const gps=[];
  if(lat!==null&&lon!==null)gps.push([1,2,text(lat<0?'S':'N')],[2,5,dms(lat)],[3,2,text(lon<0?'W':'E')],[4,5,dms(lon)]);
  if(altitude!==null)gps.push([5,1,[altitude<0?1:0]],[6,5,[Math.abs(altitude)*100,100]]);
  const ifds=[root,exif,gps],positions=[];let size=8;
  for(const list of ifds){positions.push(size);size+=6+list.length*12;}
  root[1][2]=[positions[1]];root[2][2]=[positions[2]];
  const types={1:1,2:1,3:2,4:4,5:8};
  for(const list of ifds)for(const [,type,values]of list){const length=type===5?values.length/2*8:values.length*types[type];if(length>4)size+=length;}
  const bytes=new Uint8Array(size),v=new DataView(bytes.buffer),u16=(p,n)=>v.setUint16(p,n,little),u32=(p,n)=>v.setUint32(p,n,little);
  bytes[0]=bytes[1]=little?73:77;u16(2,42);u32(4,8);let payload=positions[2]+6+gps.length*12;
  for(let i=0;i<ifds.length;i++){
    const list=ifds[i],start=positions[i];u16(start,list.length);
    list.forEach(([tag,type,values],j)=>{
      const at=start+2+j*12,count=type===5?values.length/2:values.length,length=count*types[type];u16(at,tag);u16(at+2,type);u32(at+4,count);
      const dest=length>4?payload:at+8;if(length>4){u32(at+8,payload);payload+=length;}
      if(type===1||type===2)bytes.set(values,dest);else values.forEach((n,k)=>type===3?u16(dest+k*2,n):u32(dest+k*4,n));
    });
  }
  const appSize=2+6+bytes.length,out=new Uint8Array(2+2+appSize+image.length-2);out.set([255,216,255,225,appSize>>8,appSize&255,69,120,105,102,0,0]);out.set(bytes,12);out.set(image.subarray(2),4+appSize);return out;
}
export function photoFile(options={},name='photo.jpg'){return new File([photoJPEG(options)],name,{type:'image/jpeg',lastModified:123});}
