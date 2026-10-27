import {OfflineAdminResolver} from './offline-admin-resolver.js';
import {OnlineGeocoderAdapter} from './online-geocoder-adapter.js';
import {PlaceNameCache} from './place-name-cache.js';
export class GeoNameProvider {
 constructor({offline=new OfflineAdminResolver(),online=new OnlineGeocoderAdapter(),cache=new PlaceNameCache()}={}){this.offline=offline;this.online=online;this.cache=cache;}
 async reverse(point,{online=false,consent=false}={}){
  if(online&&!consent)throw new Error('请先确认发送这一个地点的坐标');
  const provider=online?this.online:this.offline,key=JSON.stringify([provider.id,point.latitude,point.longitude,point.crs||'WGS84']);
  const cached=this.cache.get(key);if(cached!==undefined)return cached;
  let result;try{result=await provider.reverse(point,{consent});}catch(error){if(!online)throw error;result=await this.offline.reverse(point);if(result)return {...result,onlineFailed:true};throw error;}
  this.cache.set(key,result);return result;
 }
 async search(query,options={}){const key=JSON.stringify(['search',this.online.id,query,options]),cached=this.cache.get(key);if(cached!==undefined)return cached;const result=await this.online.search(query,options);this.cache.set(key,result);return result;}
}
export const geoNameProvider=new GeoNameProvider();
