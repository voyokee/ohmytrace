# Life Atlas M0 + M1

## Baseline and boundaries

Implementation branch: `feat/life-atlas-mvp`, based on `perf/local-rendering`
at `a76e564`. Static ES modules; no framework or build step. The Cesium,
terrain, vegetation and performance modules remain unchanged.

## Existing dependencies and integration points

`app.js` owns CSV parsing, `footprints.v1` localStorage, mutable `rows/places`,
`buildModel()`, and the globe/list/card/timeline controls. `buildModel()` currently
groups trips by title/date and places by name. `visibleTrips()/visibleHomes()`
feed markers, light pools, routes and replay. `setPlace()` handles both manual
correction and geocoding. `src/ui/year-scope.js` supplies display date buckets.

## Intended module flow

`schema.js` (plain JSON and partial dates) → `repository.js` (validated,
serialized IndexedDB transactions) → `renderer-adapter.js` (disposable legacy
projection) → existing `app.js` render and flight functions.

`legacy.js` parses CSV and migrates rows without requiring Cesium or DOM.
`chapter-ui.js` supplies the independent Chapter editor and timeline selector.
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
