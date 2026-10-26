/** Phase 5.2 boundary only. No native shell or device acceptance is implied. */
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
