# Life Story — Phase 4

Implementation stays on `feat/life-atlas-mvp`. A Story is a versioned work derived
from the Canonical Dataset, never a second writable Life database. CSV-only data
and Chapters are sufficient; Memory and photo support is optional.

## Existing integration points

- `src/life/schema.js` owns stable Canonical IDs and partial/unknown dates.
- `src/life/renderer-adapter.js` supplies disposable map/list/timeline views.
- `app.js` owns one Cesium Viewer, `flyToPoints`, `homeView`, `pauseOverviewMotion`,
  scenery entry, route presentation and CameraDirector generation tickets.
- `src/rendering/camera-director.js` already prevents obsolete flight completion.
  Story playback must cancel existing flights before starting each new scene.
- `src/life/media/scanner.js` holds selected files only for the current page.
  A Story may attach an explicitly reselected image as a sanitized thumbnail;
  local Memory URIs and file paths must never become share links.

## Implementation boundaries and sequence

1. `src/life/story/schema.js` and `compose.js`: independent, pure Story model,
   deterministic scene hierarchy and selection.
2. `playback.js`: independent, cancellable controller with injected renderer and
   clock; reuse the existing application camera and terrain pipeline.
3. `composer-ui.js`: local editing, preview, per-record review and export controls.
4. `share.js` and `package.js`: allowlisted privacy projection, input validation,
   JSON and a deployable static archive. No automatic upload.
5. `viewer.js` / `viewer-bridge.js`: read-only standalone Story loader, using the
   same `app.js`/Cesium rendering entry and static engine/assets. Viewer bootstrap
   must not import or instantiate the personal Repository or media database.
6. Pure and real-browser tests, fictional runnable demo, deployment instructions.

Shared application changes stay at bootstrap, scene/camera context and controls;
terrain, vegetation, handoff and renderer modules remain untouched. Public Viewer
mode is a separate document entry, never enabled by a URL flag on the private app.

## Story model and composition

`LifeStory`, schemaVersion 1, is an editable work containing `storyId`, title,
description, `selectedChapterIds`, `selectedTripIds`, `orderedScenes`,
`visualTheme`, `cameraPreferences`, `includedMemories`, `privacySettings` and
`provenanceSummary`. Its references are Canonical IDs. It contains no copied
private database or renderer objects. `composeStory()` supports full life,
Chapter, year and Trip scopes. Overlapping Chapters remain independent; a Trip
may appear in both Chapter narratives, with one shared identity.

The deterministic hierarchy is globe → Chapter → home anchors → Trips → ordered
Stop/Place scenes → selected Memory moments → closing/global view. Unassigned
selected Trips remain in their own Trip section. Chapters without Trips remain
valid. Scene titles, descriptions, ordering and removal are editable. New Memory
selection preserves the identity, text and ordering of already edited Memory
scenes. No emotion, relationship, transport or unsupported experience is invented.

Year choices include every covered year, including cross-year Trips. A Trip with
unknown actual boundaries may be selected by its recorded Visit observations;
the Story still preserves unknown Trip boundaries. The read-only render adapter
labels such display intervals as observations, not confirmed trip start/end.

Themes: `atlas` (gold), `night` and `paper` caption treatment. Camera preferences
include speed (0.25–4) and system/reduced motion. Month/day precision supplies a
scene's seasonal context. Year/unknown precision remains season-unknown: a neutral
view is labeled explicitly and local seasonal decoration is skipped. No July
date is written into the Story or Canonical Dataset as a substitute for unknown.

## Playback and shared rendering

`StoryPlayback` injects `enter(scene, {signal, instant, speed})`, `cancel`, an
optional `exit`, timers and clock. It has no Cesium, DOM or storage dependency.
Subscribers receive state and `scenechanged`, `ready`, `ended`, `stopped` events.

| Operation | State and behavior |
| --- | --- |
| load | Cancel previous work; load an independent scene list; enter idle |
| play | Enter current scene (or restart an ended story), then dwell/advance |
| pause | Abort flight/timer and preserve remaining dwell |
| resume | Continue dwell, or re-enter a scene paused during flight |
| seek / next / previous | Cancel previous ticket; enter selected scene; preserve playing/paused intent |
| speed | Rescale remaining dwell; future flights use the selected speed |
| stop | Cancel flight/timers, reset index; keep the work available for replay |
| end / failure | End without a live timer, or expose a visible error |

Every transition has an AbortController and generation ticket. An old completion
cannot arm a timer, clear the new deadline, or restore an obsolete camera. A
10-second renderer deadline prevents indefinite waits; no animation waits for
terrain. `prefers-reduced-motion` uses instantaneous scene flights. Direct canvas
interaction pauses playback for exploration. The existing CameraDirector, flight,
scenery, footprint overlay, routes and day/night controls remain the renderer.

Private preview temporarily uses the exact public Share Projection and restores
the original adapter/scope/selection/tone on return. It never writes Canonical
records. The private editor remains in the private page; a preview is not a new
browser security origin. Background geocoding is not started for read-only views.

Application bootstrap completes Cesium's image-bitmap capability probe before
starting image requests, avoiding the bundled 1.120 offline Blob-rejection race.
Terrain metadata has an 8-second limit and an explicit ellipsoid fallback. Story
views have a local NASA base image under optional satellite imagery. The global
Scenic Earth textures, text and controls work without external terrain/imagery;
high-resolution close terrain is unavailable when those services are offline.
No terrain, vegetation, handoff or vendor source was modified.
Offline Place scenes keep a wider regional view, so a missing high-resolution
image does not turn the whole screen into an enlarged single-color tile. Grid
locations also retain a regional framing; immersive close scenes require opted-in
precise coordinates and available terrain. Automatic scenes use the Story caption
without opening a second legacy Trip card; manually selecting a Trip while
exploring can still open the original card and Place controls.

## Share Artifact and privacy rules

`projectShare(data, story, {images})` builds `OhMyTraceStory`, schemaVersion 1:
the Story's title/theme/scenes plus minimal `places`, `chapters`, `trips` (ordered
Stops) and `memories`. `selected*Ids` and scene references are remapped to
artifact-local `c1/t1/p1/m1/s1` identities. It has no dataset ID, revision,
migration state, Residence records, raw CSV, database handles or original evidence.
Source summary includes only observed/inferred/manual/unknown counts and a route
explanation. `storyId` is an independent work ID, not a database ID.

Defaults and choices:

- Only the explicitly chosen scope is included. Selecting full life explicitly
  selects all current records. Per-Trip exclusion removes its scenes/Stops and
  prunes unused Places. Unselected Chapters are never copied merely because a
  chosen Trip is associated with them.
- Original notes and all Memories are excluded by default. Including notes is an
  explicit switch; including a Memory requires per-Memory selection as well.
  Story narration typed by the user is intentional public text, distinct from
  the original private notes switch.
- Photos require the photo-permission switch and per-Memory selection. A file
  must be explicitly reselected for that Memory; otherwise its text/place can
  appear with a missing-photo explanation. No local URI is followed or exported.
- Selected files are decoded and resized to at most 768 pixels, JPEG encoded,
  and stripped of APP1–APP15/COM metadata. Only the resulting inline thumbnail is
  shared. EXIF GPS, camera identifiers, original names, modification times,
  raw paths, directories and original image bytes are not copied.
- Location mode `city` means a **0.1-degree grid**, about 11 km in latitude; it is
  not an administrative-city lookup. Both JSON coordinates and camera positions
  use the grid. Residence/home-anchor names become “居住区域 N”. Users may edit
  public names to avoid address leaks, hide individual coordinates, hide all
  coordinates, or explicitly opt into precise coordinates including homes.
- Recorded Stops are not recorded paths. Generated connections are inferred;
  a Trip containing an unknown/hidden coordinate has `routeKind: unknown` and
  no route line. Future artifacts can describe observed paths explicitly; this
  composer never invents that evidence from CSV Stop order.

The final review shows the actual export graph, counts, privacy choices and JSON.
Export requires checking that it may be made public. Any subsequent edit clears
that approval. Preview uses the same filtered projection without an upload.
The original photo's visible content may itself identify a location/person;
stripping metadata does not anonymize image content. Review images and narration.

`parseArtifact()` rejects unknown versions/fields, invalid references/periods,
inconsistent permissions, precision claims contradicted by coordinates, absent
scene targets, empty works, unsafe image schemes and JPEG metadata. Input text
stays data and is escaped in the UI. Images are embedded JPEG data, never HTML,
SVG, remote URLs, `blob:` links or `file:` paths supplied by an artifact.

MVP budgets: 5,000 scenes/entities per public collection; up to 64 thumbnails,
each at most 256 KiB (imported dimensions at most 1024²); Story JSON at most
24 MiB; static archive at most 256 MiB. Oversized input fails visibly, without
silently truncating personal records. Draft edits live only in the current page;
export before leaving. Canonical JSON remains the private backup format.
Video/other Memory summaries can retain their type, text and Place associations;
this MVP does not package or play original video files.

## Independent Viewer and isolation

Open `story-viewer.html`. It loads its fixed sibling `story.json`, or a user-selected
Story JSON; the source checkout also offers the explicitly fictional demo.
It has no login, CSV dependency, personal Repository or media manifest. Public
mode comes from the separate document's `data-story-viewer` marker, never a URL
parameter on the private application. `?dataset=`, `?artifact=` and `?demo=` do
not select or load private data. No global repository/debug bridge is exposed.

`viewer-bridge.js` constructs a disposable render snapshot directly from the
Artifact. It has no `repository`, write operations, IndexedDB or localStorage.
The same `app.js` conditionally skips every personal bootstrap import. Packages
exclude `repository.js`, `app-bridge.js`, media modules, editors, CSV and tests.
Their fixed runtime manifest includes only public engine/assets and read-only
modules. Existing render/scenery/performance/UI modules contain no private-store
reads. Uploaded text is escaped; the public document uses a CSP that excludes
inline scripts, objects, frames and forms, while allowing Cesium's own blob
workers/resources and optional ArcGIS imagery/terrain requests.

Serve shared works on a **separate origin** from the private application. Origin
is the browser's actual storage boundary; arbitrary scripts deliberately installed
on a creator's own private origin would inherit that origin's storage access.
The provided Viewer has no route to that storage, and a package on another origin
cannot access it. This MVP is a public static artifact, with no access-control or
revocation service. Anyone with its deployed URL can view/download its contents.

## Export and static deployment

1. In the normal application, import CSV, create Chapters, then click **生成人生故事**.
2. Choose full life/Chapter/year/Trip, generate and edit scenes. Preview the work.
3. Return to editing, review trips, location precision/names and Memories.
4. Click **审查最终分享内容**, inspect the actual JSON, and approve public content.
5. Export `LifeStory.json` or `LifeStory-static.zip`. Nothing is uploaded.
6. Extract the ZIP into a new folder, and serve the **entire extracted folder**
   as the root of a separate static HTTPS site. No build or server API is needed.

For a local deployment example, after extraction:

```sh
python -m http.server 8080 --directory ./LifeStory-static
```

Then open `http://localhost:8080/`. Do not double-click `index.html` through
`file://`; modules, workers and fetched JSON require HTTP(S). A static host must
serve `.js` as JavaScript, `.json` as JSON and `.wasm` as WebAssembly. Preserve
all relative paths. The ZIP includes the read-only entry as `index.html`, the
reviewed `story.json`, its `story.sha256`, local engine/assets, licenses and README.
Viewer checks the optional SHA-256 before opening a packaged story. This detects
incomplete/mismatched files, not authorship or a malicious host replacing both.

The package is a standard uncompressed ZIP (about 32 MiB before any selected
thumbnails). It contains no creator database or original media. The fictional
source demo is `src/life/story/demo.story.json`; it is not private user content.
Sharing JSON alone also works: open any deployed Viewer and choose that file.

## Hosted Sharing extension

`Publisher.publish(artifact, options)` is the extension boundary; the default
implementation rejects explicitly as unavailable. A future publisher should
accept only a validated reviewed Artifact/package, support AbortSignal/progress,
return an HTTPS URL, and provide authentication, access control, upload integrity,
error recovery, expiry/deletion and revocation. It must not accept or fetch a
LifeRepository. No hosted upload, private hosting or one-click cloud share is
claimed by this MVP.

## Validation

Run the complete existing `npm test` command (or the host-provided pnpm equivalent).
Story Schema/selection/privacy tests, injected-clock transition tests, ZIP CRC and
runtime-whitelist tests are included in `tests/life/*.test.mjs`.

The optional real browser acceptance starts its own static servers and isolated
Chrome profiles; it never changes the user's real browser data:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright LIFE_BROWSER_EXECUTABLE=/path/to/chrome \
  LIFE_BROWSER_OUTPUT=/path/to/results node tests/life/story-browser.mjs
```

It imports CSV and creates overlapping Chapters through real controls; proves
scene editing/reordering, a complete replay, transport/cancellation and review;
exports and independently parses/CRC-checks the ZIP; serves only extracted files
on another port; forbids all IndexedDB/localStorage reads and external requests;
tests mobile playback/exploration, hostile text, invalid artifacts and an explicitly
authorized EXIF-free photo thumbnail. A second page uses normal animation and
rapidly switches actual camera flights. The report and fictional exported works
are written alongside screenshots. Screenshots supplement these assertions.

Regression evidence includes the original timeline-domain failure, the stale
transition deadline failure, editing-before-reorder lost click, excluded undated
Trip count mismatch, unknown-route status mismatch, preservation of edited Memory
scenes, and the real Cesium offline image-probe race. Each was observed failing
before its corresponding correction; corrected behavior is kept in tests.
The separate `node tests/life/story-mobile-browser.mjs` starts a fresh mobile
Chromium context (390×844, DPR 2, touch enabled), performs native touch exploration,
plays the complete fictional life and opens its photo Memory with external
services blocked. This is browser mobile emulation; physical iOS/Safari devices
were not available for testing.

Final review on this host: `npm test` passed all 18 original scripts and 73 Life
unit tests. The full Story acceptance rechecked creation from CSV, overlapping
Chapters, complete playback, privacy review, photo permission, JSON/ZIP export,
isolated Viewer, actual-flight cancellation and lifecycle cleanup. It also edited,
previewed and exported a Story at 390×844, preserving the persisted Dataset and
its revision. Public Viewer storage traps recorded zero reads with all external
services blocked. Fresh touch-mobile acceptance passed; this is Chromium mobile
emulation, not physical iOS/Safari certification. Earlier Life/Photo/Timeline
acceptances are historical evidence, not newly rerun by this review.

Two additional failures were reproduced and corrected. JPEG inspection now walks
all scans, escaped entropy bytes and restart markers: APP1–APP15/COM metadata
after the first scan is stripped during sanitization and rejected on import.
Late automatic Viewer fetches and slower file reads cannot overwrite a newer
explicit selection; superseded fetches are aborted. Both have regression tests,
including a held real-browser default request followed by manual selection.

For a deployment-level touch test, extract an exported package, then pass its
absolute root as `LIFE_VIEWER_ROOT=/path/to/extracted-package` to
`tests/life/story-mobile-browser.mjs` with the same Playwright/executable/output
environment variables. This runs the full fictional story against only packaged
files, with private storage and external services unavailable. The reviewed demo
contains two overlapping Chapters, two Trips, an unknown-coordinate Stop and one
approved thumbnail; it is a separate, deployable 454-file artifact.

See `LIFE_STORY_VERIFICATION.json` for current requirement-to-evidence results and
source hashes. Rebuild the explicitly fictional source demo with
`node tests/life/build-story-demo.mjs`. No creator records or original media are
included in the demo, test exports or public repository.
