# Optional sync boundary — M5.3 design only

Cloud synchronization is not implemented or enabled. Hosted Story publishing
uploads an explicitly reviewed projection; it does not synchronize the private
LifeRepository, media manifest or account history.

`src/cloud/contracts.d.ts` reserves AuthProvider, RemoteLifeRepository,
SyncCoordinator, ConflictResolver, SyncStatus and a versioned SyncEnvelope.
Provider business boundaries use no vendor SDK. Canonical repository revision,
remote revision/ETag and stable cross-device dataset identity are distinct.
Media observations/metadata may sync only after opt-in; originals and raw EXIF do
not. An index on device B does not mean its image bytes are available there.

A later Snapshot Sync implementation must save its last acknowledged common
baseline, then use server-side compare-and-swap. A stale ETag rejects the write.
Three-way comparison may merge disjoint edits; same-entity edits and edit/delete
conflicts retain both alternatives for human resolution. Tombstones prevent
resurrection. Never use wall-clock last-write-wins or silently replace a local
Dataset. Failed writes retain pending state and the local graph.

First login must show differences and backup choices before restoring/merging.
Login and logout do not clear local history. Local reads, edits, review, backup
and playback remain available without cloud. Server ownership isolation,
validated size/schema bounds, secret handling and complete account deletion are
required before activation. Public Story storage is a separate authority and
must never become a read path to private sync data.

Required future evidence: A creates Chapter/B restores; disjoint offline Trip
edits merge; same Chapter conflict keeps both; owner A cannot read B; tombstones
propagate; dropped acknowledgements recover idempotently; cloud outage preserves
local edits/exports. None of these cross-device cases is claimed as passed here.
