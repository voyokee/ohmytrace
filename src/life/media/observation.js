// Adapter view only: preserve Manifest v1/v2 and canonical media:<assetId> IDs.
export function photoObservation(asset,{source='web'}={}){return {
  assetId:asset.assetId,source,format:asset.format||'jpeg',capturedTime:asset.extractedTime||null,
  timezoneEvidence:asset.extractedTime?{basis:asset.extractedTime.timeBasis,offsetMinutes:asset.extractedTime.offsetMinutes}:null,
  gps:asset.coordinates?{...asset.coordinates,crs:'WGS84',state:'observed'}:null,
  altitude:asset.altitude??null,orientation:asset.orientation??null,dimensions:asset.dimensions||null,
  fileMetadata:asset.originalFile,mediaCreatedTime:asset.mediaCreatedTime||null,
  metadataSource:asset.metadataSources||['exif'],diagnostics:asset.diagnostics||[]};}
