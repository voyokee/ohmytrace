// UI preferences are independent of canonical records and may be unavailable in private mode.
export class LocalSettings {
 constructor({storage,key='oncehere.settings.v1'}={}){this.storage=null;this.key=key;this.values=Object.create(null);try{this.storage=storage===undefined?globalThis.localStorage:storage;const value=JSON.parse(this.storage?.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))Object.assign(this.values,value);}catch{/* Defaults keep the UI usable when preferences cannot be read. */}}
 get(name,fallback=null){try{return structuredClone(Object.hasOwn(this.values,name)?this.values[name]:fallback);}catch{return structuredClone(fallback);}}
 set(name,value){try{this.values[name]=structuredClone(value);this.storage?.setItem(this.key,JSON.stringify(this.values));return !!this.storage;}catch{return false;}}
}
