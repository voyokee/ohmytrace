# Photo Library Reconstruction V2

2026-10-27. Development branch `feat/photo-library-v2` starts from freshly fetched
`feat/photo-import` HEAD `2e7f20ef71cc954c9b6ff338d4f38d562f3b2158` (newer than audit
`ac6d85b`). The request's final instruction to create a new branch takes precedence
over its older `feat/life-atlas-mvp` delivery line. M1–M3 are this iteration;
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
