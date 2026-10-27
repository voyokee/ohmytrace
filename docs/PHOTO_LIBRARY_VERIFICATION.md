# Photo Library V2 verification

2026-10-27. Branch `feat/photo-import`, base latest fetched `2e7f20e`.
This iteration implements M1–M3; M4–M6 and physical-device acceptance remain next.
No private phone photos were added to Git, uploaded, or used in these tests.

## Required automated checks

All pass on final implementation (macOS, Node 23.11.0):

- `npm test`: all existing rendering/performance/delivery scripts + 107 Life tests.
- `npm run test:production`: 2/2, reproducible editor/viewer/native distributions,
  allowlisted assets, integrity and isolation. Private media/geonames modules are
  excluded from the public Viewer. No renderer/scenery/performance module changed.
- `npm run test:publishing`: 6/6, privacy/service/publisher regressions.
- `git diff --check`: clean.

New tests cover safe stored/deflated ZIPs, UTF-8 nested paths, traversal/drive paths,
symlinks, duplicate names, CRC, capacity, cancellation, scoped Web acquisition,
normalized observations, legacy full-hash verification, converted-photo hints,
bounded hints for same-time/same-location libraries, actual offline names,
polygon holes/edges/multipolygons, WGS84 rejection, offline defaults, explicit
online consent, serialized requests/cache/fallback, thumbnail privacy/limits/
replace/GC, unified backup validation and relationships, metadata-only backups,
v1/v2 manifest compatibility, local-edit conflicts, staging rollback, canonical
write failure and pre/post-commit interrupted recovery. Legacy index restore
cannot strand existing Memory references or claim missing thumbnail Blobs.

## Actual browser acceptance

Chrome 156.0.8078.48, macOS, real Worker/IndexedDB/OPFS, isolated temporary profiles.
Desktop 1200×900 / 1440×1000 and touch viewport 390×844. These are real Chrome
sessions, not physical Android Chrome or iOS Safari.

`tests/life/photo-browser.mjs` passes the existing full regression:
CSV/manual correction preservation, review merge/split/exclude/rename, EXIF
orientation, dry run, Chapter relations, globe markers/list/year, reload, exact
re-import identity, media-index restore, aborted IndexedDB canonical transaction,
post-graph acknowledgement repair, scan cancel/transaction rollback, mid-scan
refresh/reselection resume, and first-import ephemeral-demo removal.

`tests/life/photo-library-browser.mjs` passes the new user flow:

1. Check retention is initially off; explicitly enable it and select a nested ZIP.
2. Read generated JPEG, ImageIO-encoded HEIC/PNG and no-GPS JPEG. Suggest
   Zhejiang / nearby Hangzhou locally. Assert no Nominatim request during import.
3. Dry run leaves canonical storage untouched. Confirm creates three located
   Memory records at one Place; no-GPS is explicitly filtered by default.
4. JPEG/PNG thumbnails are re-encoded and retained in real OPFS. Orientation-6
   images retain their rotated 48×64 aspect ratio. Chrome cannot
   decode the HEIC fixture; metadata remains and a thumbnail diagnostic is shown.
5. Refresh and reopen: retained pictures load from storage with stable Memory IDs.
6. Download unified ZIP; in an empty independent touch-browser context inspect
   counts/time before writes. Inject an actual canonical IDB transaction abort:
   graph, media index and staged thumbnails all remain empty. Retry succeeds.
7. Compare restored Memory/Trip/Visit relationships, refresh thumbnails again,
   then use “在地球上查看” and verify a globe marker is visible.
8. Verify IDB Blob fallback after reopen and an aborted replacement preserving
   the old Blob. Test ordinary multi-file selection when directory API is removed
   in a desktop context; touch context also retains ordinary file selection.

Synthetic fixture thumbnails total 608 bytes, far smaller than real photos;
this is a functional proof, not validation of real-world compression budgets.
Screenshots and per-run browser metrics are produced in `LIFE_BROWSER_OUTPUT`
(or a temporary output folder). Retained copies for this development session are
in the workspace's `outputs/photo-library-v2/` directory, outside the Git repo.
No original images or local media URI are exported into a Story by this flow.
Existing Story privacy/export tests continue to pass; saved-photo Story selection
belongs to M5.

## Scale results

Raw results: [PHOTO_LIBRARY_METRICS.json](PHOTO_LIBRARY_METRICS.json).
Generated 64×48 valid JPEG + EXIF, padded to 64 KiB for 100/1,000 or 16 KiB for
10,000; actual Chrome Worker + IndexedDB. No thumbnail retention in this scale run.

| Files | Scan | Saved review + offline naming | Dry run | Canonical commit | Writes | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | 35.8 ms | 10.6 ms | see raw metrics | 15.0 ms | 1 | 0 |
| 1,000 | 165.8 ms | 16.1 ms | see raw metrics | 148.8 ms | 1 | 0 |
| 10,000 | 1,834.3 ms | 160.1 ms | 835.8 ms | 2,401.7 ms | 1 | 0 |

10,000-file run main-thread sampled heap high-water and max frame gap are in raw
metrics; this is not process/Worker/native/GPU memory. A 633 ms main-thread frame
gap remains in that synthetic stress run, so this does not certify smooth globe
interaction for every 10,000-photo batch.

`node tests/life/photo-scale.mjs 100`, `1000`, `10000` separately exercise mixed
JPEG/HEIC, 20% missing GPS and a Live Photo video companion with actual offline
packs. For the 10,002-file case: scan 836 ms, review/naming 190 ms, dry run 315 ms,
commit 1,136 ms, 8,001 Memories, 2,000 unlocated-filtered files, one deferred video.
These are Node/in-memory timings, not browser/device performance guarantees.

A stress rerun caught quadratic suspected-duplicate hint growth causing quota
failure with many equal time/GPS observations. Hints are now capped at five per
asset in `MEDIA_LIMITS`; regression plus the full real 10,000-file run pass.

## Metric definitions and acceptance limits

- Import Success Rate: successfully analyzed image observations / selected images;
  the four-image functional fixture analyzes all four, including its no-GPS image.
- GPS Coverage Rate: fixture 3/4; missing GPS is neither inferred nor fabricated.
- Named Place Coverage: the fixture's single GPS place gets an inferred label;
  global accuracy/coverage needs a geographically representative labeled sample.
- Thumbnail Persistence: fixture 2/3 requested located photos saved; 2/2 generated
  thumbnails survive refresh and restore; HEIC decode failure is explicit.
- Backup/Restore: the tested package roundtrips and injected failure retries pass.
- Trip Candidate Acceptance, False Trip Proposal Rate and Duplicate Detection
  Quality require actual human labels. No accuracy percentage is invented here.
- The fixture selection-to-confirmed-map acknowledgement took 408 ms, excluding
  page/globe startup. This is one tiny synthetic run, not a p50 time to first
  meaningful globe. The ≤90 s experimental goal requires a defined real-device,
  real-photo batch and network protocol.

Physical iPhone / iOS Safari, Android Chrome, Windows hardware/browser and native
phone-library samples are pending authorized devices/data. Picker redaction,
iCloud/cloud-only downloads, native HEIC decoding and sustained mobile memory
cannot be inferred from desktop fixtures. Never describe this as device-certified.
Name packs require their static assets on first use; Cache Storage/derived labels
support later offline lookups when available. Boundary/city data is generalized
and sparse, with inferred precision labels, not authoritative city membership.

## Reproduction

Run Node >=20 required checks above. For real Chrome, set host-installed Playwright
and (if necessary) Chrome paths, then run both browser scripts:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
LIFE_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
node tests/life/photo-library-browser.mjs
```

Each browser script hosts only loopback HTTP, uses fresh contexts/fixtures and
closes its server/browser. Nothing modifies the user's ordinary browser profile.
