import {yearOptions} from '../ui/year-scope.js';

const stamp=(year,month=0)=>new Date(year,month,1).getTime();
const ranges=items=>items.flatMap(item=>Number.isFinite(item.date?.start)&&Number.isFinite(item.date?.end)?[item.date]:[]);

// Only recorded travel years consume space. Residence/Chapter bands are overlays;
// they provide a fallback domain only when there are no dated Trips at all.
export function timelineLayout(trips,{year=null,context=[],viewportWidth=0}={}) {
  const dates=ranges(trips),years=yearOptions(trips),fallback=ranges(context);
  const source=dates.length?dates:fallback;
  let start=source.length?Math.min(...source.map(d=>d.start)):0;
  let end=source.length?Math.max(...source.map(d=>d.end)):1;
  let months=[];
  if(dates.length&&year!=null) {
    start=Math.max(start,stamp(year));end=Math.min(end,stamp(year+1)-1);
    const first=new Date(start).getMonth(),last=new Date(end).getMonth();
    months=Array.from({length:Math.max(0,last-first+1)},(_,i)=>first+i+1);
    start=stamp(year,first);end=stamp(year,last+1);
  } else if(years.length) {start=stamp(years[0]);end=stamp(years.at(-1)+1);}
  if(end<=start)end=start+1;
  const position=time=>{
    if(time<=start)return 0;if(time>=end)return 100;
    if(!years.length||year!=null)return (time-start)/(end-start)*100;
    const y=new Date(time).getFullYear();
    const i=years.findIndex(value=>value>=y);
    if(i<0)return 100;
    // Missing years collapse to the boundary between their neighbouring slots.
    return (i+(years[i]===y?(time-stamp(y))/(stamp(y+1)-stamp(y)):0))/years.length*100;
  };
  return {years,months,start,end,position,
    yearPosition:y=>(years.indexOf(y)+.5)/years.length*100,
    monthPosition:m=>(months.indexOf(m)+.5)/months.length*100,
    width:Math.max(0,viewportWidth-48,(year!=null?months.length*84:years.length*160)),
    overlaps:date=>!!date&&date.end>=start&&date.start<end&&(!years.length||year!=null||years.some(y=>date.start<stamp(y+1)&&date.end>=stamp(y))),
    key:JSON.stringify([year,trips.map(t=>[t.id,t.date?.start,t.date?.end]),dates.length?null:[start,end]])};
}
