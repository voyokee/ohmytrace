const shortRegion=name=>{const s=String(name||'');return s.length>2?s.replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市|府|县|都)$/,''):s;};
const SHORT_COUNTRY={'中华人民共和国':'中国','大韩民国':'韩国','朝鲜民主主义人民共和国':'朝鲜','美利坚合众国':'美国','大不列颠及北爱尔兰联合王国':'英国','俄罗斯联邦':'俄罗斯'};
const shortCountry=name=>SHORT_COUNTRY[name]||name;
// Rank cities by distinct observed days, then photo count, with stable ties.
export function tripTitle(segment,{homeCountry=null}={}){
 const ranked=new Map();for(const o of segment){const key=o.city.key;let r=ranked.get(key);if(!r){r={city:o.city,days:new Set(),photos:0};ranked.set(key,r);}r.days.add(o.day);r.photos++;}
 const cities=[...ranked.values()].sort((a,b)=>b.days.size-a.days.size||b.photos-a.photos);
 if(!cities.length)return '机场 / 路过停留';
 const names=[...new Set(cities.map(r=>r.city.hasCity===false?shortRegion(r.city.region===r.city.country?'':r.city.region):r.city.label).filter(Boolean))];
 if(!names.length)return '足迹回顾';
 const countries=[...new Set(cities.map(r=>r.city.country))],abroad=homeCountry&&countries.length===1&&shortCountry(countries[0])!==shortCountry(homeCountry);
 if(names.length>=3)return abroad?`${shortCountry(countries[0])} · ${names[0]}等 ${names.length} 城`:`${names.slice(0,2).join('、')}等 ${names.length} 城`;
 return names.join(' · ');
}
