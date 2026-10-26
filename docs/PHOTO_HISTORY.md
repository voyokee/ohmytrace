# Phase 3 — Photo History Reconstruction

Development stays on `feat/life-atlas-mvp`, starting at `480ea69`.

## Boundaries and data flow

Selected File objects → bounded worker EXIF extraction + content hash → separate
versioned media manifest → explainable visit/trip candidates → saved human review
→ dry run → one verified Life Repository update → existing Renderer Adapter.

Original files are never uploaded or persisted. No thumbnail Blob store is used
in this MVP. File objects and object URLs last only for the current page session;
metadata and review drafts survive reload, and files must be reselected to preview.

Canonical schema v1 remains unchanged: photo metadata is held in Evidence.source,
Memory.kind is `photo`, and Memory.uri is `media:<assetId>`. Manifest schema version
is independent of Canonical and IndexedDB database versions. Existing canonical
JSON remains valid and does not include the separate media manifest or originals.
The UI must explicitly label backup coverage and provide media-index JSON export.

## Intended modules

- `src/life/media/exif.js`: bounded JPEG/TIFF EXIF reading and explicit time semantics.
- `manifest.js`: incremental, transactional metadata/batch/review persistence.
- `scanner.js`, `scan-worker.js`: cancelable bounded local File processing.
- `reconstruction.js`, `config.js`: pure spatial/temporal heuristics and thresholds.
- `integration.js`: dry-run, canonical commit and recoverable manifest acknowledgement.
- `photo-ui.js`: selection, progress, diagnosis, edit/delete/merge/split and confirmation.

## Evidence and temporal semantics

DateTimeOriginal without OffsetTimeOriginal is not an instant. Preserve the raw
EXIF string, local date/time, optional offset and optional derived UTC instant.
GPS time, when present, is separate evidence and never silently supplies a timezone.
File modification time is file metadata, never an invented capture time.

Photo GPS means the photo location; candidate visit spans are observed photo
coverage. Trip arrival/departure and transport remain unknown until reviewed.
Renderer connections between photo stops must be labeled as inferred connections.
No ResidencePeriod or Chapter is synthesized from photo data.

## Standards checked

Tag meanings were checked against the [CIPA EXIF/XMP mapping](https://www.cipa.jp/std/documents/e/DC-X010-2017.pdf)
and the author-maintained [ExifTool GPS tag reference](https://exiftool.org/TagNames/GPS.html).

Implementation, rules, failure recovery, real test evidence and performance results
will be filled in as each stage is implemented and verified.
