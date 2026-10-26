# Phase 5 verification ledger

Branch: `feat/life-atlas-mvp`. Remote was fetched at start and matched the given
`636a154` baseline. No branch reset, new feature branch, renderer rewrite, Native
SDK installation, account synchronization or private-data upload was performed.

## M5.0 — in verification

- Static production packaging implemented for editor/viewer/native assets.
- Determinism, exact asset integrity, unexpected-file rejection, symlink/path and
  output ownership tests passed.
- Existing 18 scripts and 74 Life tests passed after the ZIP concurrency fix.
- Actual browser run against `dist/editor` passed the complete CSV/overlapping
  Chapter/Story/privacy/export/independent-viewer sequence.
- Actual Photo suite against `dist/editor` passed Worker JPEG extraction,
  reconstruction/review, canonical-write rollback, acknowledgement recovery,
  metadata backup, cancellation, matching-file resume and 100/1,000 fictional
  photo imports. These are synthetic fixtures, not phone-gallery benchmarks.
- Both initial HTTPS Sites deployments succeeded. Editor stays owner-private;
  the user explicitly approved Public Viewer access and the platform applied it.
- First HTTPS Editor run reached JSON export but its sequential 451-resource ZIP
  exceeded the 30-second browser-test limit (progress 51/451). The packager now
  uses four bounded downloads; ordering/CRC format is preserved and covered by
  tests. Final HTTPS export verification remains pending the updated release.

## User-requested phone correction (in release)

The Vivo screenshots revealed low raster density and excessive UI coverage.
Mobile motion previously capped rendering at DPR 1; stills capped at 1.5 and only
unselected global views could regain detail. New framebuffer budgets distinguish
known low-memory, ordinary/unknown and >=8GB browser memory tiers; the high tier
allows DPR 2 in motion and up to DPR 3 / four million pixels when settled. A
selected, stopped near view can regain still quality. High-memory touch devices
may use the existing 5400-pixel surface image without raising forest budgets.

Phone header and chips are compact; Trip details start collapsed with a direct
near-view action, can expand into a bounded scroll region, and do not cover the
timeline. Four travel years fit a phone track; longer histories remain scrollable.
Floating timeline tips no longer clip inside the horizontal scroller.

Real Chromium touch emulation at 420×820 CSS / DPR 3 / simulated 8GB confirmed
1260×2460 global and stopped near framebuffers, a ~117px collapsed Trip card, a
92px footer, readable years, details access and no horizontal overflow at 360px.
This is an M1 browser test, not Vivo hardware FPS, thermal or long-playback
certification. Near imagery/scenery may still be loading in early captures.
Renderer-policy/texture files were changed only for this explicit phone request;
no terrain, vegetation, Shader or engine geometry was rewritten.

## M5.1 — not yet implemented / not accepted

The deployed Viewer is a static read-only runtime. There is no functional hosted
Publisher yet. No claim of one-click hosted sharing, link revocation, hosted access
control or backend storage is made. Next: pure Publisher contract/local tests,
server-side validation/storage/auth, Composer publishing UI and real hosted
create/open/update/revoke tests. Existing JSON/ZIP sharing remains available.

## M5.2 / M5.3 / M5.4

Native and sync remain limited to the required upcoming interface/dependency
boundaries. Android/iOS compilation, hardware tests and cross-device synchronization
have not been completed. The full Phase 5 goal remains active.


## Touch-cluster correction

A press now snapshots the cluster and freezes marker layout until release; the
map's optional motion stops on pointer-down. One pointer-up activates once, with
compatibility clicks suppressed and drag/cancel/capture-loss paths cancelled.
Minor camera-matrix changes no longer close the chooser; actual globe input and
outside taps still dismiss it. Phone targets are 44px without enlarging the
visible count bubble. Node gesture tests pass, as do six raw CDP touch sequences
with slight finger jitter and camera-home transitions, all opening the complete
two-place chooser with one tap. No retries/actionability waiting were used for
these physical touch events. Vivo hardware retest remains user feedback.

The first HTTPS photo test passed the main Worker/review/recovery cases, then
its deliberately fresh browser context reached the private Site sign-in gate.
The harness now authorizes that separate test context too. Separately, the
Editor does serve story-viewer.html through a same-origin clean-URL redirect;
the credential-proxy test wrapper now follows that redirect on the server side
without forwarding its token to a different origin. These test-infrastructure
limits are not counted as completed online acceptance.
