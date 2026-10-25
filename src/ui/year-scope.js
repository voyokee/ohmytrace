// Date scope shared by the map, list, statistics, routes and timeline.
export function inYear(item,year) {
  if(year==null)return true;
  if(!item.date)return item.kind==='home'||item.kind==='past';
  const first=item.year??new Date(item.date.start).getFullYear();
  const last=item.endYear??new Date(item.date.end).getFullYear();
  return first<=year&&year<=last;
}
export function yearOptions(trips) {
  const years=new Set();
  for(const t of trips)if(t.date) {
    const first=t.year??new Date(t.date.start).getFullYear(),last=t.endYear??new Date(t.date.end).getFullYear();
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<1||last>9999)continue;
    for(let y=first;y<=last;y++)years.add(y);
  }
  return [...years].sort((a,b)=>a-b);
}
export function scopedDays(trip,year) {
  const d=trip.date;if(!d?.days)return 0;
  if(year==null)return d.days;
  const start=Math.max(d.start,new Date(year,0,1).getTime()),end=Math.min(d.end,new Date(year,11,31).getTime());
  return end<start?0:Math.round((end-start)/86400000)+1;
}
export function timelineBuckets(trips,year=null) {
  if(year==null)return yearOptions(trips).map(key=>({key,items:trips.filter(t=>t.date&&inYear(t,key))}));
  const buckets=new Map();
  for(const t of trips)if(t.date&&inYear(t,year)) {
    const start=year==null?t.date.start:Math.max(t.date.start,new Date(year,0,1).getTime());
    const date=new Date(start),key=year==null?date.getFullYear():date.getMonth()+1;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(t);
  }
  return [...buckets].sort((a,b)=>a[0]-b[0]).map(([key,items])=>({key,items}));
}
