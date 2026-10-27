export function memoryPublicationStorage(){
  const rows=new Map(),files=new Map();
  return {store:{async get(id){return structuredClone(rows.get(id));},async list(owner){return [...rows.values()].filter(r=>r.owner===owner).map(r=>structuredClone(r));},async insert(row){if(!rows.has(row.id))rows.set(row.id,structuredClone(row));},async replace(id,revision,next){if(rows.get(id)?.revision!==revision)return false;rows.set(id,structuredClone(next));return true;}},
    objects:{async put(key,value){files.set(key,value);},async get(key){return files.get(key)||null;},async delete(key){files.delete(key);},async deletePrefix(prefix){for(const key of files.keys())if(key.startsWith(prefix))files.delete(key);}},files};
}
