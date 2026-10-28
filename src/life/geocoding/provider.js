import {OfflineAdminResolver} from './offline-admin-resolver.js';
import {OnlineGeocoderAdapter} from './online-geocoder-adapter.js';
import {PlaceNameCache} from './place-name-cache.js';
import {normalizeRegion} from './region-policy.js';
export class GeoNameProvider {
 constructor({offline=new OfflineAdminResolver(),online=new OnlineGeocoderAdapter(),cache=new PlaceNameCache()}={}){this.offline=offline;this.online=online;this.cache=cache;}
 async reverse(point,{online=false,consent=false}={}){
  if(online&&!consent)throw new Error('请先确认发送这一个地点的坐标');
  const provider=online?this.online:this.offline,key=JSON.stringify([provider.id,point.latitude,point.longitude,point.crs||'WGS84']);
  const cached=this.cache.get(key);if(cached!==undefined)return normalizeRegion(cached);
  let result;try{result=await provider.reverse(point,{consent});}catch(error){if(!online)throw error;result=await this.offline.reverse(point);if(result)return {...normalizeRegion(result),onlineFailed:true};throw error;}
  result=normalizeRegion(result);this.cache.set(key,result);return result;
 }
 async search(query,{online=false,consent=false,...options}={}){
  if(online&&!consent)throw new Error('请先确认发送这一个地点名称');
  const provider=online?this.online:this.offline,key=JSON.stringify(['search',provider.id,'cn-v3',query,options]),cached=this.cache.get(key);if(cached!==undefined)return cached;
  const rows=await provider.search(query,{...options,consent}),result=online?rows.map(row=>{const r=normalizeRegion({countryCode:row.address?.country_code,country:row.address?.country,admin1:row.address?.state,city:row.address?.city||row.address?.town,precision:'provider-result'});return {...row,countryCode:r.countryCode,sovereignCode:r.sovereignCode,display_name:r.country?Array.from(new Set([r.country,r.admin1,row.name||r.city].filter(Boolean))).join(' / '):row.display_name,address:{...row.address,country:r.country,state:r.admin1},source:provider.id,state:'inferred'};}):rows;
  this.cache.set(key,result);return result;
 }
}
export const geoNameProvider=new GeoNameProvider();
