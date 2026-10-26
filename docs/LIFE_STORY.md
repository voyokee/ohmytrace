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

## Completion evidence

Implementation and validation are in progress. This document will record the
final schema, state machine, privacy rules, deployment and verified limitations.
