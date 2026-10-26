# Life Atlas M0 + M1

Phase 3 local photo ingestion/reconstruction now extends these interfaces;
see [PHOTO_HISTORY.md](PHOTO_HISTORY.md) for media storage, review, recovery and validation.

Phase 4 adds Story composition, privacy-reviewed exports and an independent
read-only Viewer; see [LIFE_STORY.md](LIFE_STORY.md).

## Baseline and boundaries

Implementation branch: `feat/life-atlas-mvp`, based on `perf/local-rendering`
at `a76e564`. Static ES modules; no framework or build step. The Cesium,
terrain, vegetation and performance modules remain unchanged.

## Baseline dependencies and integration points

Before this change `app.js` owned CSV parsing, `footprints.v1` localStorage,
mutable `rows/places`, `buildModel()`, and globe/list/card/timeline controls.
It grouped trips by title/date and places by name. `visibleTrips()/visibleHomes()`
still feed markers, light pools, routes and replay. `setPlace()` still receives
manual corrections and geocoding, but now awaits the Repository.
`src/ui/year-scope.js` remains the existing display date-bucket utility.

## Implemented module flow

`schema.js` (plain JSON and partial dates) → `repository.js` (validated,
serialized IndexedDB transactions) → `renderer-adapter.js` (disposable legacy
projection) → existing `app.js` render and flight functions.

`legacy.js` parses CSV and migrates rows without requiring Cesium or DOM.
`chapter-ui.js` supplies the independent Chapter editor and timeline selector.
`app-bridge.js` joins these pieces and distinguishes previews from user data.
Only app bootstrap, mutation entry points and projection selection are integrated
in `app.js`; `index.html/styles.css` supply a small entry point and layout.

Canonical entities have opaque persisted IDs. CSV's title/date grouping is an
import hint, never an entity primary key. Place identity includes coordinates;
homonyms receive distinct display keys. A projection is never another writable
persistence layer. Evidence preserves source, state and manual revisions.

## Implementation sequence

1. Schema, date semantics, Repository, pure tests.
2. CSV adapter, recoverable migration, JSON backup/restore.
3. Renderer adapter, scopes and selection.
4. Chapter CRUD and existing globe/list/timeline/replay integration.
5. Regression suite and browser acceptance, recorded below when performed.

## Persistence contract

One versioned dataset record in IndexedDB; full validation before writes and
readback before migration completion. Legacy localStorage remains untouched.
New browser, migrated empty dataset, persisted user dataset and ephemeral
fictional demo are separate states. Storage errors must remain visible and
must not become success notifications. JSON is the lossless backup format;
legacy CSV remains a footprints interchange format.

## Canonical schema v1

| Collection | Identity and relationships |
| --- | --- |
| `places` | Opaque `id`, original `name`, `coordinates: {latitude, longitude}` or `null`, location status, `evidenceIds` |
| `visits` | A distinct `id` per visit, `placeId`, optional `tripId`, `start/end`, preserved original CSV fields in `legacy` |
| `trips` | Opaque `id`, title/type/period, ordered `visitIds` as Stops |
| `residences` | Opaque `id`, `visitId/placeId`, home/past kind and period; separate from Chapters |
| `chapters` | Opaque `id`, title/type/period, `homeAnchors` (Place IDs), `relatedTripIds`, `memoryIds` |
| `memories` | Opaque `id`, kind/title/optional URI/period, `placeIds/tripIds`; interface only, no media scanning |
| `evidence` | Opaque `id`, observed/inferred/manual/unknown state, concrete source, timestamped before/after revisions |

The dataset has its own ID, schemaVersion, revision and origin/migration metadata.
IDs survive editing, reopening and JSON backup/restore. CSV exports also include
optional `visit_id/place_id/trip_id` columns, preserving those identities when
read by this app. CSV cannot preserve Chapters, memories or full evidence;
use JSON for complete backups.

Dates are `{precision: 'year'|'month'|'day', value: 'YYYY'|'YYYY-MM'|'YYYY-MM-DD'}`.
Unknown is `{precision:'unknown',value:null}`. An ongoing end is
`{precision:'ongoing',value:null}`. An empty end means unknown, not ongoing.
Invalid legacy date text is preserved in the original row and unknown evidence,
without inventing a date. Impossible or reversed Chapter dates are rejected.
The adapter derives interval bounds for display; those bounds never replace
canonical partial dates. No unsupported confidence or timezone is invented.

`migrateLegacy()` implements unversioned footprints → schema v1.
`migrateDataset()` validates current canonical backups; unknown/future versions
are rejected before any write. Future canonical migrations belong at this
explicit boundary. `addMemory()` and `upsertChapter(...memoryIds)` provide the
M2 association interface; no user example Chapters are inserted automatically.

## CSV compatibility and place identity

Chinese/English aliases, BOM, comma/tab/full-width separators, quoted fields,
UTF-8/GBK file decoding, date ranges, missing dates and existing residence types
remain supported. Explicit `纬度/经度` fields never swap axes. The old combined
coordinate column uses latitude first; unambiguous longitude-first input is
normalized as before, recorded in Evidence and reported in the import toast.

Repeated visits remain separate. Equal name plus equal known coordinates can
identify a Place; name alone never forces unrelated CSV places together. The
legacy localStorage name-keyed table is preserved as an explicit legacy identity
hint because it already lost finer distinctions. Homonyms get distinct view
keys, while canonical/exported names stay original. Changing a visit destination
in the editor requires fresh coordinate evidence for the new place.

Legacy CSV title/date grouping is an import hint, including unambiguous appended
Stops. IDs remain the durable identity; explicitly distinct Trip IDs are kept
separate even when labels match. Append skips exact duplicate rows. Replace
replaces footprint rows and prunes invalid Trip associations, preserving Chapters
and memories. JSON Restore replaces the complete dataset after validation.

## Migration, durability and failure behavior

IndexedDB database `ohmytrace.life`, database version 1, store `datasets`, record
`canonical` holds one complete versioned dataset. Every mutation clones the
committed dataset, validates all IDs/relations/dates/coordinates, serializes writes,
and uses a readwrite transaction with an expected-revision check. A stale tab
cannot overwrite a newer tab's data; it gets an explicit refresh message.

On first legacy load, migration writes `meta.migration.status='pending'`, reads
back and validates the exact dataset, then writes and verifies `complete`.
A refresh resumes a validated pending dataset without reimporting its rows.
Legacy JSON/access/write errors stop migration visibly. Nothing deletes or
rewrites `footprints.v1`. A readback failure blocks further writes until reload
because persistence may have happened even though confirmation failed.

No legacy key means an ephemeral fictional preview. An existing empty legacy
dataset remains empty. Real imports remove *all* preview entities and evidence
before persistence. `?demo=...` scenery previews stay ephemeral and refuse user
data writes. Sample terrain heights and renderer keys never become Place facts.

The UI reports persistent storage failures, retains failed editing drafts, and
does not announce success before verified persistence. JSON backup is available
from the Chapter entry. Restore is explicitly replacing and prompts the user.

## Renderer API and UI use

`new RendererAdapter(repository)` exposes:

- `getRenderSnapshot()`: disposable `rows/places/placeIds/trips/homes`, Chapter
  period, current scope and focus. Trip/Residence IDs remain canonical IDs.
- `setScope({type:'all'|'year'|'chapter', year?, id?})`: validated view selection.
- `focusTrip(id)` / `focusPlace(id)`: selection state, independent of Cesium.
- `subscribe(listener)`: data/scope/focus changes; returns an unsubscribe function.

The existing UI continues to use its year filter over the projection. Choosing
a year exits Chapter scope. `app.js` delegates Chapter scope to the adapter,
then refreshes existing map markers, light pools, routes, list, cards and timeline.
Flights and replay still call the original functions. Chapter associations are
explicit, not guessed from date overlap. Selecting a Chapter filters its Trips
and home anchors; even a Chapter without Trips retains a period and navigation.
A Place anchor without a ResidencePeriod is labeled “阶段地点”, and does not
invent a residence or a travel departure origin.
Timeline year ticks follow the scoped Trip records, matching the year filter;
residence and Chapter spans retain their bands without adding empty year ticks.

Start the usual static server, then click the toolbar book icon (“人生阶段”).
Import your CSV, create a title/type and partial start/end, choose associated
places/Trips, and save. Create overlapping Chapters or associate a Trip with
several Chapters. Click a Chapter in the editor or the row above the year filter
to browse it. Existing Trip cards, “近看”, day/night and replay remain available.
Use **全部阶段** / **全部年份** to return to the whole dataset.

## Verification (2026-10-26)

- The `package.json` test script passed: all 18 existing suites plus 21 new Life
  tests. This host supplies pnpm rather than npm; the exact `test` script was run
  with `pnpm run test` (dependency-install verification disabled for the host's
  bundled runner). No application dependency was added.
- Real headless Chrome, isolated temporary profiles, 1440×1000 and 390×844:
  CSV file import, overlapping Chapter creation, shared Trip associations,
  scoped list/map/timeline, year reset, Trip and Place flight controls,
  day/night, replay start/stop, reload persistence, Chapter edit/delete,
  no-Trip Chapter navigation, JSON download/restore, original map-pick coordinate
  correction, CSV export, successful editing retry and mobile dialog bounds.
- Actual IndexedDB transaction aborts verified failed editing retention and
  first-write/complete-marker migration recovery. Legacy storage stayed intact.
- A paired Chrome check with the same Beijing/Tianjin fixture and baseline
  `a76e564` app versus the Life app reached `cameraPhase=immersive` and visible
  terrain in both versions. At the 10-second capture both also reported the
  pre-existing `regionalFailures=1`, zero vegetation instances and
  `sceneryPhase=loading`. Full vegetation readiness therefore remains a visual
  validation limit; no rendering-pipeline change or pixel/performance equality
  claim is made. Asynchronous imagery loading differed between the captures.
- Unit tests prove readback failure handling, stale-tab protection, partial and
  unknown dates, ongoing periods, homonyms, repeated visits, stable IDs, memory
  associations and JSON equivalence.
- Correctness fixes have observed RED/GREEN evidence: demo contamination,
  inferred provenance, changed destinations, appended Stops, render-cache
  persistence, all-years reset, no-Trip timeline and synthetic residence inference.
  A browser regression also proves a closed Chapter dialog releases map clicks.

The toolbar uses a book icon for “人生阶段” and an image icon for “导入照片”, with
full accessible names and hover/focus labels. `src/life/timeline-layout.js` derives
the timeline from the scoped dated Trips: only recorded years consume slots;
Residence and Chapter periods are clipped overlays. A Chapter without Trips
retains its period band. Year view uses the months actually covered by its Trips.
Long histories retain readable spacing and scroll horizontally (touch, trackpad,
scrollbar or keyboard arrows/Home/End). Initial load, new data and scope changes
start at the latest end; selection and ordinary refresh preserve browsing position.
Resize follows the latest end only if the user was already there.

The isolated browser regression `node tests/life/timeline-browser.mjs` uses the
same host Playwright/Chrome variables as below. On the original code its first
assertion failed because the first 2022 Trip was at 64.5753% of a domain expanded
by 2015–2021 residences. It also checks sparse years, overflow, newest positioning,
mouse-wheel/keyboard scrolling, selection, resize, reload and month bounds, and
saves desktop/mobile screenshots. Pure layout cases run with the Life test suite.
Validation for this change: the full test command passed all 18 existing scripts
and 52 Life tests. The timeline browser regression and both existing Life/Photo
browser acceptance scripts passed, including real IndexedDB failure/reload cases.

Run `npm test` or `npm run test:life` with Node >=20. The optional browser test
requires a host-installed Playwright and Chrome/Chromium:

```powershell
$env:PLAYWRIGHT_MODULE = 'ABSOLUTE_PATH_TO_PLAYWRIGHT_PACKAGE' # optional if resolvable
$env:LIFE_BROWSER_EXECUTABLE = 'ABSOLUTE_PATH_TO_CHROME'       # optional for bundled Chromium
$env:LIFE_BROWSER_OUTPUT = 'ABSOLUTE_SCREENSHOT_DIRECTORY'    # optional
node tests/life/browser.mjs
```

The browser script starts/stops its own static server and uses only test fixtures
in fresh profiles. It does not change an existing user's browser data.

## Merge surface, limits and M2

Shared files likely to conflict with `perf/local-rendering`: `app.js` bootstrap,
data entry points, `buildModel`, scope/timeline UI; `index.html` entry/cache tags;
the appended Life CSS; and the test command in `package.json`. All other changes
are new files under `src/life`, `tests/life` and this document. No rendering,
scenery, performance, assets or vendor file changed.

This is browser-local storage and full-record transactional persistence. Very
large datasets should be profiled before broader media use; there is no cross-tab live refresh,
cloud sync or native app. Photo scanning is now an independent Phase 3 module.
Legacy format cannot recover distinct
places already collapsed by the old name-keyed table. Switching to an old
application version can still write its old localStorage; this branch does not
silently merge later legacy edits into canonical data. Use CSV/JSON explicitly.
Browser verification is functional and visual; it is not a fresh performance
benchmark or a guarantee about every external terrain/geocoding provider. The
paired near-scene vegetation readiness issue above is present in both versions
and remains outside M0/M1's protected renderer boundary.

M2 should first add a local, resumable media manifest with content hashes and
Memory IDs, preserve EXIF date/GPS/timezone uncertainty as evidence, propose
PlaceVisit/Chapter links for user confirmation, and support dry-run/undo and
incremental import. Measure storage and thumbnail budgets before adding media
blobs. Keep photos local; cloud sync and native clients remain separate work.
