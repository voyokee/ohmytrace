import {exportGeoJSON,exportGPX,exportFileName} from '../life/export-open.js';
import {dateBound} from '../life/schema.js';
import {saveDocument} from '../platform/document-save.js';
const size=bytes=>bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':(bytes/1024).toFixed(1)+' KB';
export function mountMyPanel({repository,guide,backup,restore,onData,onError=()=>{}}){
 const element=document.querySelector('#my-dialog'),button=document.querySelector('#btn-my'),data=()=>repository.snapshot();let info=null,busy=false;
 const close=()=>element.close();
 function render(){
  const d=data(),v=guide.view(d);document.querySelector('#my-dot').hidden=!v.reminder;
  element.querySelector('[data-my-backup-status]').textContent=v.lastBackup?'上次备份：'+new Date(v.lastBackup.at).toLocaleString('zh-CN')+' · '+size(v.lastBackup.bytes)+(v.dirty?' · 有未备份的修改':' · 已备份当前记录'):'还没有完整备份'+(v.dirty?' · 有未备份的修改':'');
  element.querySelector('[data-my-storage]').textContent=info?(info.protected?'已保护：浏览器不会自动清理。':'未保护：浏览器在空间不足时可能清理。')+(info.usage!==null?' 已用 '+size(info.usage)+(info.quota!==null?' / '+size(info.quota):''):''):'正在读取本机存储状态…';
  element.querySelector('[data-my-later]').hidden=!v.reminder;
  const select=element.querySelector('[data-my-range]'),old=select.value,years=new Set();
  for(const e of [...d.trips,...d.residences])if(!e.hidden){const a=dateBound(e.start),b=dateBound(e.end,true);if(a!==null)for(let year=new Date(a).getUTCFullYear();year<=new Date(b??a).getUTCFullYear();year++)years.add(year);}
  select.replaceChildren(new Option('全部','all'),...[...years].sort((a,b)=>b-a).map(y=>new Option(y+' 年','year:'+y)),...d.chapters.filter(c=>!c.hidden).map(c=>new Option(c.title,'chapter:'+c.id)));if([...select.options].some(o=>o.value===old))select.value=old;
 }
 async function open(){guide.check(data());render();if(!element.open)element.showModal();try{info=await guide.storageInfo();render();}catch(error){onError(error);}}
 button.addEventListener('click',()=>void open());
 element.addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-my-photos')){close();document.querySelector('#btn-photos').click();return;}
  if(target.hasAttribute('data-my-confirm')){close();document.dispatchEvent(new CustomEvent('earth-confirm'));return;}
  if(target.hasAttribute('data-my-close')){close();return;}
  if(['btn-life','btn-tone','btn-data','btn-list'].includes(target.id)){close();return;}
  if(target.dataset.myData){close();onData(target.dataset.myData);return;}
  if(target.hasAttribute('data-my-later')){guide.snooze();render();return;}
  if(target.hasAttribute('data-my-restore')){close();try{await restore();}catch(error){onError(error);}return;}
  if(!target.hasAttribute('data-my-backup')&&!target.dataset.myExport||busy)return;
  busy=true;target.disabled=true;element.querySelector('[data-my-error]').textContent='';
  try{
   if(target.hasAttribute('data-my-backup')){const result=await backup();element.querySelector('[data-my-error]').textContent=result?.saved?'完整备份已保存':'已取消保存';}
   else{
    if(!window.confirm('导出文件包含地点坐标，请只分享给你信任的人。是否继续？'))return;
    const d=data(),value=element.querySelector('[data-my-range]').value,scope=value==='all'?{type:'all'}:value.startsWith('year:')?{type:'year',year:Number(value.slice(5))}:{type:'chapter',id:value.slice(8)},format=target.dataset.myExport,now=new Date();
    const text=format==='gpx'?exportGPX(d,{scope,now}):exportGeoJSON(d,{scope,now}),result=await saveDocument(exportFileName(d,{scope,format,now}),text,{mimeType:format==='gpx'?'application/gpx+xml':'application/geo+json'});element.querySelector('[data-my-error]').textContent=result.saved?'导出文件已保存':'已取消保存';
   }
   render();
  }catch(error){element.querySelector('[data-my-error]').textContent='保存失败：'+error.message;onError(error);}finally{busy=false;target.disabled=false;}
 });
 repository.subscribe(()=>{guide.check(data());render();});guide.check(data());render();return {open,close,render};
}
