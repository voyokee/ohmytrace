export const GEOCODER_VERSION=2;
export const needsGeocoding=place=>!place||(['rough','notfound'].includes(place.status)&&place.geocoderVersion!==GEOCODER_VERSION);
const normal=name=>String(name||'').replace(/[臺灣廣東門慶內龍寧雲別區]/g,c=>({'臺':'台','灣':'湾','廣':'广','東':'东','門':'门','慶':'庆','內':'内','龍':'龙','寧':'宁','雲':'云','別':'别','區':'区'}[c]));
const short=name=>normal(name).replace(/^(中国|中國)/,'').replace(/(特别行政区|壮族自治区|维吾尔自治区|回族自治区|自治区|省|市)$/,'');
export function countryForProvince(province) {return {香港:'hk',澳门:'mo',台湾:'tw'}[province]||'cn';}
export function provinceSearchOptions(province,fallback=false) {
  if(!province)return {};
  return {countrycodes:countryForProvince(province),...(fallback?{featureType:['北京','上海','天津','重庆'].includes(province)?'city':['香港','澳门','台湾'].includes(province)?'settlement':'state'}:{})};
}
export function fitsProvince(result,province) {
  if(!province)return true;
  const code=result.address?.country_code;
  return code===countryForProvince(province)&&normal(result.display_name).includes(normal(province));
}
export function provinceFallback(results,province) {
  return results.find(r=>fitsProvince(r,province)&&['boundary','place'].includes(r.category||r.class)&&short(r.name)===short(province));
}
export function placeQueries(name,core,provinces) {
  const queries=[name,core];
  // A border description is useful to a person but is not part of the landmark's name.
  if(name.includes('交界')) {
    let clean=name,prefix;
    while((prefix=provinces.find(p=>clean.startsWith(p))))clean=clean.slice(prefix.length).replace(/^(省|市|自治区)/,'');
    clean=clean.replace(/^交界(?:处|地区)?/,'');if(clean)queries.push(clean);
  }
  return [...new Set(queries)];
}
