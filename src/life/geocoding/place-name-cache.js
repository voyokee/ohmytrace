// Private derived labels stay on this origin. Exact coordinate keys avoid
// sharing a rounded cache label across an administrative boundary.
export class PlaceNameCache {
 constructor({storage=globalThis.localStorage,maxEntries=2000,ttlMs=30*86400000}={}){this.storage=storage;this.maxEntries=maxEntries;this.ttlMs=ttlMs;this.map=new Map();try{const rows=JSON.parse(storage?.getItem('ohmytrace.place-names.v1')||'[]');for(const [k,v]of rows)if(v.expires>Date.now())this.map.set(k,v);}catch{/* Cache is expendable. */}}
 get(key){const row=this.map.get(key);return row&&row.expires>Date.now()?structuredClone(row.value):undefined;}
 set(key,value){if(this.map.size>=this.maxEntries)this.map.delete(this.map.keys().next().value);this.map.set(key,{expires:Date.now()+this.ttlMs,value:structuredClone(value)});if(!this.timer){this.timer=setTimeout(()=>{this.timer=null;try{this.storage?.setItem('ohmytrace.place-names.v1',JSON.stringify([...this.map]));}catch{/* Cache quota is non-fatal. */}},250);this.timer.unref?.();}}
}
