/** Phase 5.3 design boundary only. No synchronization is enabled by these types. */
export type SyncStatus='disabled'|'idle'|'pending'|'syncing'|'conflict'|'offline'|'failed';
export interface AuthProvider {
 currentUser():Promise<{id:string}|null>; signIn():Promise<void>;signOut():Promise<void>;
 observe(callback:(user:{id:string}|null)=>void):()=>void;
}
export interface SyncEnvelope {
 schemaVersion:1;datasetId:string;remoteRevision:string|null;parentRemoteRevision:string|null;
 localRepositoryRevision:number;canonicalDataset:unknown;mediaManifest:unknown;
 tombstones:{entityType:string;id:string;deletedInRevision:string}[];
 /** No original image bytes, raw EXIF or private evidence file URLs. */
}
export interface RemoteLifeRepository {
 get(datasetId:string,options:{signal?:AbortSignal}):Promise<{etag:string;envelope:SyncEnvelope}|null>;
 /** Atomic server-side precondition. A conflict returns 409; never last-write-wins. */
 compareAndSwap(datasetId:string,envelope:SyncEnvelope,options:{ifMatch:string|null;idempotencyKey:string;signal?:AbortSignal}):Promise<{etag:string}>;
 deleteDataset(datasetId:string,options:{ifMatch:string;signal?:AbortSignal}):Promise<void>;
 deleteAccount(options:{signal?:AbortSignal}):Promise<void>;
}
export interface Conflict {entityType:string;id:string;base:unknown;local:unknown;remote:unknown;}
export interface ConflictResolver {
 analyze(base:SyncEnvelope,local:SyncEnvelope,remote:SyncEnvelope):{candidate:SyncEnvelope;conflicts:Conflict[]};
 resolve(candidate:SyncEnvelope,choices:{conflict:Conflict;action:'keep-local'|'keep-remote'|'keep-both'}[]):SyncEnvelope;
}
export interface SyncCoordinator {
 status:SyncStatus;enable(options:{datasetId:string;firstSync:'merge'|'restore-after-backup'|'keep-local'}):Promise<void>;
 sync(options:{signal?:AbortSignal}):Promise<void>;disable():Promise<void>;
}
