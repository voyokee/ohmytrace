# Phase 5 verification ledger

Branch: `feat/life-atlas-mvp`. Remote was fetched at start and matched the given
`636a154` baseline. No reset/new feature branch, second renderer, native SDK
installation, canonical sync or automatic private-data upload was performed.
Only fictional CSV/JPEG/story fixtures were used in hosted acceptance.

## Environment

macOS arm64, Node 23.11.0 for Web checks, bundled Node 24.22.1 for the maintained
Sites/Vinext Worker build, system Google Chrome + Playwright. Browser profiles are
isolated. Touch emulation is not a Vivo/Android WebView/iOS device test. GitHub CI
is configured on Node 20/24; a local pass is not evidence that remote CI passed.

## M5.0 — implemented and HTTPS-verified

- `npm test`: all original 18 scripts + 76 Life tests passed after the phone and
  Publisher changes (`outputs/hosted-final-tests.log` in the task workspace).
- `npm run test:production`: 2 tests passed: repeatable contents, exact manifests,
  resources/licenses, isolation, tamper/extra-file/symlink/ownership rejection.
- Production `dist/editor` browser suites passed original CSV/overlapping Chapter/
  Story/privacy/ZIP and Photo Worker/review/rollback/recovery/backup flows.
- Actual private HTTPS Editor Story acceptance passed full export (454 files in that run; later builds include the shared Publisher
  module too), independent playback, photo permission, editing, transport,
  cancellation and lifecycle. Report: `outputs/phase5-story-https-redirect-fixed/`.
- Actual HTTPS Photo acceptance passed Worker JPEG review/delete/merge/split,
  canonical-write abort, acknowledgement recovery, matching-file resume, fresh
  demo reload, metadata backup and fictional 100/1,000-photo imports. Report:
  `outputs/phase5-photo-https-auth-fixed/`. Padded generated small JPEGs are not
  real-gallery speed/memory certification. Disposed-request diagnostics during
  deliberately closed contexts are teardown cancellation, not a page-error pass.
- Final Public HTTPS Viewer smoke passed exact deployed app.js/WASM checks,
  complete anonymous mobile playback, photo memory, zero personal-storage reads
  with storage traps, and all external services blocked. Report:
  `outputs/phase5-viewer-https/viewer-https-smoke.json`.
- Editor remains owner-private at
  https://ohmytrace-editor.whiteduck3.chatgpt.site . Stories remains Public at
  https://ohmytrace-stories.whiteduck3.chatgpt.site , explicitly authorized by the
  owner. The two HTTPS origins are separate; public runtime is not public Editor
  storage or public Private publications.

Early online failures were not counted as passes: sequential ZIP downloads first
exceeded the test limit (now four bounded workers); the private-site test proxy
needed same-origin clean-URL redirect handling and fresh-context authorization;
one static module request timed out transiently and a subsequent instrumented
run passed. Native hosting returned static revalidation headers rather than
`_headers` per-path no-store. Controlled API responses explicitly set no-store.

## Phone clarity, layout and circle “2” — live and browser-verified

The Vivo images showed low raster density and excessive UI coverage. Mobile now
uses bounded memory-tier framebuffer budgets. High-memory touch permits up to
DPR 3/four million settled pixels, including selected stopped near views; moving
views stay bounded. The existing 5400px surface is allowed in that tier without
raising vegetation budgets. Terrain/forest/shader geometry was not rewritten.

The phone header/chips are compact, Trip details begin collapsed (~117px), expand
inside 38dvh, and retain direct near-view access. The timeline is 92px in the
fixture; four year labels fit, long histories scroll, tips do not clip. At 360px
there is no horizontal overflow.

Markers snapshot the target at pointer-down, capture the pointer and freeze
layout until release. Slight jitter is accepted; drag/cancel/capture-loss paths
cancel, compatibility clicks are suppressed, and keyboard activation remains.
Minor camera-matrix changes no longer dismiss the chooser. Actual map input and
outside taps still dismiss it. Touch hit targets are 44px without enlarging the
visible count bubble.

Node gesture tests passed. Real HTTPS Chromium raw CDP touch sequences passed
six single press/jitter/release attempts interleaved with camera-home transitions:
each opened the complete two-place chooser and kept it open. No retry or
Playwright actionability waiting was used for these touch events. Report:
`outputs/mobile-touch-https/mobile-editor.json`. Local equivalent also passed.
The same 420×820 CSS/DPR3/simulated8GB run measured 1260×2460 global and stopped
near framebuffers, compact/expanded cards, year labels and no page errors.
Physical Vivo FPS, heat, scan peaks and long playback remain unverified; near
scenery/remote imagery can still be loading in early screenshots.

## M5.1 — implemented and real HTTPS workflow verified

The real hosted D1/R2 publication service is deployed, with six replaceable
Publisher operations, Composer review gate, status/cancel/retry, copy/open link,
update, owner list, revoke and delete. JSON/ZIP exports remain independent.
`npm run test:publishing`: 6 tests passed, including schema/privacy/auth rejection,
three modes, CAS/idempotency, local Publisher, late-upload revocation and native
browser-fetch receiver binding.

Actual HTTPS API tests passed: two dedicated owner accounts, Private ownership,
Unlisted credentials, anonymous Public access, stale revision rejection,
idempotency, server revalidation, caller-forged identity-header rejection,
revocation denying new reads and object deletion. All controlled responses were
no-store. Report: `outputs/hosted-api/hosted-api.json`.

Automated test owners are scoped automation accounts through hidden transport
credentials, with exactly the same ownership rules and no access to visitor data.
This does not claim a fresh human interactive Sites sign-in has been completed.
The normal browser path uses Sites sign-in, not custom OAuth/session code.

Browser acceptance found and fixed approval being invalidated by the publication
visibility selector, a premature ready button, and an unbound native fetch in the
adapter. Final actual HTTPS UI acceptance passed: create/edit in Composer, privacy approval
gate, explicit Public selection, authenticated popup, HTTPS link, anonymous mobile
Viewer complete playback with zero personal-storage reads, re-review required for
update, revision 2 visible anonymously, and revocation rejecting new data requests
and a fresh Viewer reload. Page errors: zero. Report:
`outputs/hosted-browser/hosted-browser.json`. Test objects were deleted afterward.
Popup transport tests additionally check forged source/origin/nonce rejection,
cancellation before/after pairing and state recovery.

The final browser run initially needed a null-safe wait during the deliberate
post-revocation reload; this was a test lifecycle issue and was not counted as
a pass until the complete rerun succeeded.

## M5.2 / M5.3 — requested boundary design only

`src/platform/contracts.d.ts`, `src/cloud/contracts.d.ts`, `NATIVE_PLATFORM.md`
and `CLOUD_SYNC.md` define capability acquisition/permissions/cancellation,
device-local media identity mapping, opt-in sync/CAS/conflict/tombstone boundaries.
No APK/IPA, PhotoKit/Kotlin bridge, Xcode build, physical-device native validation,
cross-device sync or account-erasure completion is claimed. Those are later
milestones and must not be inferred from reusable native Web assets.

## Deployment evidence

Final shared runtime build ID:
`23556da9ef7fad7b217a24e8986dad9087a73751036456965a927f2c0092b798`.
Editor Site source `6ba794c45609e5e09f7db8a317af027cec04c8f3`, deployment
`appgdep_6adf746e42f081919f0c7581bca5328d`, succeeded.
Stories Site source `97a1ab93ed4b0bd0f21d49f12b15dfd23ca356db`, version
`appgprj_6adf4c6b3c808191800127d3a87d08ae~appgver_065f7f127ff0819187c55941551e64d8`,
deployment `appgdep_6adf74e31e9c8191bbd21eb3e08ce6fd`, succeeded with D1/R2.
These source SHAs belong to the Sites-managed repositories, not GitHub feature
branch commits. Task output archives/reports are kept outside the GitHub repo.

Two dedicated automation account token hashes were a runtime-only secret during
acceptance. The map was explicitly replaced with an empty object and the same saved version
redeployed at environment revision 3. Cleanup deployment
`appgdep_6adf78c71d908191a47a44295edf44f2` succeeded. Both old tokens then returned
JSON HTTP 401 (`sign_in`) on no-store, cache-busted API requests. The Public
Viewer remained HTTP 200; normal Sites user identity is the production path. No original
media or visitor dataset was used. Cleanup verification uses `tests/publishing/credentials-disabled.mjs`; no token
or sensitive response content is written to a file.

Remaining checks: fresh human Sites SSO on the phone; physical Vivo clarity/tap
feedback; real mobile thermal/frame-time/long-playback and maximum-size hosted
upload load tests. These are not replaced by fixture or Chrome emulation results.
Deleting a publication removes controlled artifact/media objects; revoked
metadata/tombstones remain, and already downloaded copies cannot be recalled.

GitHub implementation commit: `cd9eea7` (Hosted Sharing and production integration).
