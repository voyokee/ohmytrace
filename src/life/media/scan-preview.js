// Coarse cells for lighting the globe while photos are still being read. Purely visual:
// nothing here is named, grouped or saved, so a cancelled scan leaves no partial record.
export function createScanPreview({cellDegrees=0.25,limit=200}={}){
  const cells=new Set();
  const valid=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(Math.abs(lat)<1e-6&&Math.abs(lon)<1e-6);
  return {
    /** True when the point opens a new cell and the limit is not reached. */
    add(lat,lon){
      if(!valid(lat,lon)||cells.size>=limit)return false;
      const key=`${Math.floor(lat/cellDegrees)}:${Math.floor(lon/cellDegrees)}`;
      if(cells.has(key))return false;cells.add(key);return true;
    },
    get size(){return cells.size;},
    clear(){cells.clear();},
  };
}
