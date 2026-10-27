# Photo Library Reconstruction V2

2026-10-27. Development continues on `feat/photo-import` from freshly fetched
`feat/photo-import` HEAD `2e7f20ef71cc954c9b6ff338d4f38d562f3b2158` (newer than audit
`ac6d85b`). M1–M3 are this iteration;
M4–M6 remain subsequent acceptance-gated work.

## M1 — input and observations

The existing signature-based JPEG/HEIF/PNG/WebP EXIF/XMP readers are retained.
`photoObservation()` exposes normalized capture/timezone/GPS/WGS84 semantics without
changing canonical v1 or media manifest v2. v1 manifest backups remain accepted.
File modification and media creation times never supply an observed capture time.

The album UI accepts repeated photo selections, desktop recursive directory picks,
and photo ZIPs. Ordinary multiple selection is always available. All are explicit
user actions, with no account, CSV, location permission or ambient library access.
`WebPhotoCapability` implements scoped File acquisition behind the native contract;
PhotoHistoryService still owns scanning/reconstruction/review and commits.

ZIP32 stored/deflated entries support UTF-8 paths, including phone export folders.
Limits: archive ≤256 MiB, aggregate uncompressed ≤256 MiB, entry ≤64 MiB,
≤20,000 entries, expansion ratio ≤200. Whole central directory is checked before
reading contents; paths, duplicate normalized names, local headers, encryption,
symlinks, sizes, methods and CRCs are checked. ZIP64/multipart archives fail closed.
Decompression output is bounded while streaming. Unsupported deflate browsers are
asked to unpack using their OS and choose the resulting folder/files. No files are
written to disk; selected unpacked Files are bounded by the aggregate budget.
Sidecars and macOS resource forks do not enter photo reconstruction.

## Native boundary

Web File handles last for the page session and selection scope. Web cannot
incrementally enumerate an Android/iOS photo library or watch it in the background.
PhotoKit/MediaStore identifiers are device-local, revocable, and never substitute
for stable canonical asset IDs. iCloud/cloud-only assets may require download or
may be absent. System picker exports may redact GPS or transcode HEIC; neither an
extension nor a successful selection proves original metadata access. Unsupported
HEIC display must keep successfully parsed metadata. Physical iPhone/Android
acceptance requires authorized native phone photos and is not implied by fixtures.

## M2 — location intelligence

`GeoNameProvider` unifies legacy place search and photo reverse naming. Public
Nominatim queries serialize at ≥1.1 seconds, have a timeout, and are cached. Offline
photo naming is the default. The review UI offers a single-location online button
with explicit coordinate-sharing confirmation, source attribution and offline
fallback. No photo batch calls public Nominatim. Providers can be replaced via the
service's `geonames` dependency / `GeoNameProvider` constructor; the online adapter
accepts another compatible endpoint. Precise local cache keys never bleed a label
across nearby borders; the bounded cache is local to the origin and expendable.

Pinned Natural Earth v5.1.2 country/admin1 polygons and 7,342 sampled populated
places are processed into 242 country packs, loaded only during name lookup.
Source/license/reproduction and simplification limits are in
`src/life/geocoding/data/SOURCES.md`. Pack cache is bounded to eight countries.
Country/admin containment precedes nearest-city lookup. City centres never count
as city boundaries: all city suggestions say “附近城市” and report distance.
Offshore, ambiguous or missing coverage retains original GPS and manual naming.
Derived names are inferred Evidence, independent of observed WGS84 GPS and manual
renaming. Existing manually corrected Place names/coordinates are preserved.

## M3 — retained memories and unified backup

The import UI has an explicit unchecked thumbnail-retention option. Only confirmed
Memory assets are processed. At most one photo is decoded at a time, preferably
in an OffscreenCanvas Worker, with a bounded main-thread fallback. Metadata
parsing never requires image decoding. Decoder/source/pixel-budget failures keep
the observation and report a per-asset thumbnail diagnostic. Re-selecting originals
and confirming again can supplement thumbnails without new Memory/Trip IDs.

Thumbnail policy: max edge 512 px, JPEG ≤100 KiB after re-encoding and strict
EXIF/XMP/comment/extra-metadata removal; 100 MiB origin budget. Source decoding is
bounded to 64 MiB / 50 MP, with a requested resized bitmap. These bound requested
work, not native browser decoder peak memory. The gallery paginates 12 thumbnails.
Retention progress is visible. Capacity exhaustion stops adding images and reports
metadata-only results rather than a false full-photo success.

`ThumbnailStore` uses verified OPFS files with an IndexedDB reference/size/checksum
index; if OPFS acquisition or writing fails it falls back to IndexedDB Blobs. A
new file is verified before publishing its index, and old files are removed only
after replacement succeeds. The store supports read, replace, delete, stats and
unreferenced-resource collection. Stable `media:<assetId>` canonical URIs are
unchanged. Read failures remain visible. Origin data clearance, browser cleanup
or uninstall can lose all local stores; this is not permanent archival.

Photo confirmation retains the existing prepared → canonical verified commit →
media acknowledgement protocol. Optional thumbnail staging happens after prepared
and before canonical commit. Every retained resource has its own verified store
index; metadata-only failures are explicit and do not create a broken thumbnail
reference. A pre-graph interruption can be retried from its durable review, and
post-graph media acknowledgement is reconciled against canonical Memory URIs.

The UI downloads `OhMyTrace-Backup.zip` locally, containing `manifest.json` (time,
counts, scope), `life-dataset.json`, `media-index.json`, `thumbnails/asset_*.jpg`,
and `checksums.json`. JPEG is used rather than the example's optional WebP. The
archive omits original photos and is never automatically uploaded. CRC and SHA-256
validate contents, paths, versions, image metadata, dimensions, and graph/index
relations before restore preview. SHA-256 detects accidental corruption; it is not
a signature authenticating a backup's creator. Restore is additive for nonconflicting
records and refuses conflicting existing IDs, preserving local manual edits. It
never blindly overwrites a newer local dataset. Existing resources are preserved;
new resources are staged and capacity checked. A durable restore journal holds
before/target manifests and graph intentions. Failures before canonical commit
roll back staging; after a verified canonical commit recovery completes the media
acknowledgement. Unexpected subsequent changes refuse automatic overwrite.

Original canonical JSON and media-index JSON restore remain available. Unified
packages without retained images are valid; unsupported future versions fail before
writes. The new thumbnail database has version 1 with `thumbnails` / `journal`
stores; existing canonical/media databases and versions do not change. Manifest
v2 adds only optional `thumbnailReference`, `thumbnailStatus` and suspected-duplicate
hints, with pointer validation. No original Blob enters a manifest or canonical JSON.

The previous legacy-hash migration no longer aliases files on metadata similarity
alone: a ≤64 MiB candidate must match its actual full SHA-256 before reusing a
legacy full-hash ID. Otherwise it remains a separate suspected duplicate. Converted
formats with matching normalized capture/GPS/dimensions are hints only. The base
scanner's large-file sampled identity remains an explicit throughput tradeoff;
these tests are not a real-library duplicate-quality measurement.

Name packs use origin Cache Storage when available after first lookup. A never
loaded pack requires its static asset to be available; offline lookup without it
keeps coordinates and emits a naming diagnostic. No exact GPS is sent to a name
service during a batch. Clearing origin data can also clear cached name packs.

Legacy standalone media-index restores now reject an index missing any current
canonical photo Memory asset. An index JSON cannot restore Blobs: absent resources
are explicitly reset to metadata-only / reselect-required. Media acknowledgement
also rejects missing asset/batch records rather than announcing silent success.
Suspected-duplicate references are bounded to five per asset, including pathological
same-time/same-location imports. Thumbnail mutation/collection serializes with Web
Locks when supported; simultaneous multi-tab bulk imports are still discouraged.
