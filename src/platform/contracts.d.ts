/** Web scoped acquisition and Android MediaStore shell; iOS/device acceptance pending. */
export type PhotoPermission='unknown'|'authorized'|'limited'|'denied'|'restricted';
export type Platform='web'|'android'|'ios';
export interface MediaHandle {source:Platform; localId:string; scopeId:string; expiresAt?:string;}
export interface AssetMetadata {
 handle:MediaHandle; mimeType:string; size?:number; capturedAt?:string;
 location:{state:'authorized'|'redacted'|'permission-required'|'absent'|'unknown';latitude?:number;longitude?:number};
 availability:'local'|'remote'|'deleted'|'inaccessible'; contentHash?:string;
}
export interface PhotoCapability {
 readonly platform:Platform;
 permissionStatus():Promise<PhotoPermission>;
 selectPhotos(options:{operationId:string;signal?:AbortSignal}):AsyncIterable<MediaHandle[]>;
 enumerateAuthorizedAssets(options:{operationId:string;cursor?:string;signal?:AbortSignal}):AsyncIterable<{handles:MediaHandle[];cursor?:string;scopeId:string}>;
 readAssetMetadata(handle:MediaHandle,options:{signal?:AbortSignal}):Promise<AssetMetadata>;
 requestThumbnail(handle:MediaHandle,options:{maxEdge:number;signal?:AbortSignal}):Promise<Blob>;
 readAssetContent(handle:MediaHandle,options:{signal?:AbortSignal}):Promise<Blob>;
 cancelOperation(operationId:string):Promise<void>;
 observeLibraryChanges(callback:(event:{scopeId:string;added:MediaHandle[];changed:MediaHandle[];removed:MediaHandle[]})=>void):()=>void;
 releaseResources(handles?:MediaHandle[]):Promise<void>;
}
/** Mapping is device-local. A native URI/local identifier is never a portable ID. */
export interface MediaIdentityMapping {deviceId:string;handle:MediaHandle;assetId:string;contentHash?:string;}

/** Android acquisition extensions. Device-local JSON cursors never enter backups. */
export interface AndroidMediaHandle extends MediaHandle {source:'android';volume:string;stamp:string;libraryVersion:string;}
export interface AndroidLibraryOptions {startMs:number|null;endMs:number|null;pageSize?:number;cursor?:Record<string,unknown>|null;since?:Record<string,unknown>|null;signal?:AbortSignal;}
export interface AndroidLibraryPage {entries:Array<{handle:AndroidMediaHandle;name:string;mimeType:string;size:number;lastModified:number;locationAuthorized:boolean}>;cursor:Record<string,unknown>|null;scopeId:string;checkpoint:Record<string,unknown>;}

/** Unified observation view. Canonical schema and media manifest retain their versions. */
export interface PhotoObservation {
 assetId:string; source:Platform; format:string;
 capturedTime:{raw:string; localDateTime:string; timeBasis:'local-unzoned'|'offset-instant'; offsetMinutes:number|null; utcEpochMs:number|null}|null;
 timezoneEvidence:{basis:string;offsetMinutes:number|null}|null;
 gps:{latitude:number;longitude:number;crs:'WGS84';state:'observed'}|null;
 altitude:unknown;orientation:number|null;dimensions:{width:number;height:number}|null;
 fileMetadata:{name:string;type:string;size:number;lastModified:number|null};
 metadataSource:string[];diagnostics:string[];
}
