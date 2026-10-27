# Android photo import

2026-10-27, `feat/photo-import`. The three P0 features already existed at
`63211e3`; this change adds the Android app and executable MediaStore acquisition.
Physical vivo / Android acceptance is still required. Desktop browser tests with
a simulated native message port certify UI integration, not Android permissions,
MediaProvider queries, HEIC codec availability or phone performance.

## Build and use

Use JDK 17 and Android SDK platform/build tools 35. The included Gradle Wrapper
pins Gradle 8.11.1 with the official distribution SHA-256. Open `android/`
in Android Studio, or run `node scripts/build-android.mjs`. Configure `JAVA_HOME`, `ANDROID_HOME` or
`android/local.properties`. The script builds the allowlisted `dist/native/`
Web runtime, runs JVM tests and assembles `android/app/build/outputs/apk/debug/app-debug.apk`.
Install that APK on an authorized Android 10+ device. No release signing or store
submission is configured. Normal Web/Sites deployments retain manual File/ZIP
selection; a Web page cannot gain MediaStore access by deploying this code.

In the app, open **从相册恢复足迹**:

1. Choose **授权 / 调整可访问照片**. Full, selected-only and denied access are distinct.
2. Optionally choose **允许读取照片 GPS**. This requests `ACCESS_MEDIA_LOCATION`,
   not live device location. Missing/redacted GPS never receives a guessed location.
3. Set optional start/end local date-times. Start is inclusive, end is exclusive.
   Both blank means all accessible dates. MediaStore DATE_TAKEN is used for
   acquisition filtering, falling back to DATE_ADDED when missing. Only original
   EXIF/XMP supplies observed capture evidence.
4. Scan. All pages feed one aggregate review. Cancellation/refresh leaves a
   recoverable device-local journal; choose **恢复上次系统扫描** after reopening.
5. Review inferred visits/trips and offline place names, optionally retain
   thumbnails, preview changes and confirm. Metadata scanning never commits the map.
6. Later use the same time range with incremental supplementation enabled.
   Clearing the checkbox explicitly rescans that range and deduplicates it.

## Acquisition and durability

The app supports accessible external storage volumes, including mounted SD media.
Queries page by `_id`, 100 entries at a time, with a fixed per-volume upper
generation and MediaStore version. Android 11+ supplements by generation_modified,
so a newly added older photo is included in the original capture-date range.
A rebuilt index, new volume or changed permission scope restarts its applicable
range. Android 10 and selected-only authorization re-enumerate the accessible
range and deduplicate because timestamps/partial selections cannot safely serve
as complete incremental checkpoints. Cloud-only items outside MediaStore are not
enumerated; unavailable, changed or revoked originals report read failures.

The native bridge reads <=256 KiB per message; existing bounded EXIF/hash parsing
remains authoritative. No originals are persisted. Metadata failures prevent
advancing the range's successful incremental checkpoint. A durable pending page
and idempotent aggregation handle interruption between metadata, aggregate and
journal writes. The device-local journal is in `ohmytrace.android-scans` and is
deliberately omitted from backups. Stable canonical `media:<assetId>` identity and
manual edits remain owned by the existing review/Repository transaction path.

Android ImageDecoder supplies JPEG/PNG/HEIC previews/thumbnails with decoder
resize, <=50 MP source dimensions and <=64 MiB source size. JPEG recompression
removes original metadata; JS independently validates dimensions, size and absence
of EXIF/XMP before existing OPFS/IndexedDB retention. Decode failure keeps metadata
with a visible diagnostic. A codec/platform failure is not a successful thumbnail.
App data clearing/uninstall also clears local memories. Web-origin data and app
data are separate; existing unified backups provide transfer, not shared storage.

The app bundles code under a WebViewAssetLoader HTTPS origin. The native message
listener accepts only that origin's main editor frame, rejects other frames and
opens external navigation outside the privileged WebView. File/content URL access
and mixed content are disabled. Permission checks and current row fingerprints
are revalidated on every native read; no arbitrary URI/path read API is exposed.
Scanning is foreground and user initiated; there is no background photo monitor.

## Verification

Current Windows verification (2026-10-27): all existing rendering checks and
114 Life tests pass; publishing 6/6 and production build/boundary 2/2 pass.
Both existing photo browser flows and the new native-port browser flow pass in
Chrome 155.0.8059.86. The existing browser run also completes 10,000 generated
photo observations; these are not phone photos or mobile performance evidence.
Android app and connected-test APKs compile with SDK 35 / JDK 17; JVM tests 3/3
and Android Lint pass. ADB reports no connected devices, so instrumentation tests are compiled
but have not been executed. The pending-page idempotency test was negatively
validated: removing its guard made a resumed three-photo batch count five;
restoring the guard passes. Two older test harness assumptions were corrected:
wait for asynchronous thumbnail reads, and use Windows junctions for link tests.

- `node --test tests/life/android-photo.test.mjs`: real scanner/review/commit,
  paging, duplicate names, repeated import, interrupted scan, page-journal crash,
  cancellation, revoked-read failures and checkpoint invariants.
- `node tests/life/android-photo-browser.mjs`: simulated WebMessage port plus
  real Chrome touch UI and IndexedDB. Three mixed-format observations, retained
  thumbnails after refresh, then incremental fourth Memory; no naming network call.
- `android/`: `testDebugUnitTest` checks permission/version incremental rules,
  range validation and bounded/overflow-safe reads.
- `connectedDebugAndroidTest` uses actual MediaProvider with generated fixtures:
  bounded pagination, ranged original reads, stale authorization rejection,
  HEIC thumbnail recompression and a backdated photo added after a checkpoint.
  It inserts/deletes only its own synthetic test rows. Run on a test device/emulator.

Phone acceptance must also cover Android 14+ limited selection expansion/revocation,
denial, original GPS permission, HEIC codec behavior, SD/cloud availability,
background/foreground interruption, 1k/10k real-photo resource use and WebView
globe interaction. Desktop scan timings do not establish mobile performance.
