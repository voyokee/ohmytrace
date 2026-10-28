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
2. Map scanning requires **允许读取照片 GPS** (`ACCESS_MEDIA_LOCATION`), not live
   device location. The Scan action checks/requests album access first, then photo
   GPS access before enumerating any rows or creating a scan journal. Denial stops
   with an actionable message. Native enumeration and original-range reads also
   enforce this permission and never fall back to a redacted original. Missing GPS
   in an authorized original still never receives a guessed location.
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

## GPS permission correction (0.1.2-onboarding)

The previous UI allowed all-library scanning without photo GPS permission, then
reported redacted metadata as thousands of unlocated files. A two-case regression
failed on the previous implementation (no rejection on denial, no GPS request
before enumeration) and passes after adding consent preflight and native guards.
The browser flow additionally denies GPS first (zero enumeration/read calls), then
grants it via the Scan action and verifies imports, refresh and supplementation.
119 Life tests pass; native JVM and instrumentation guard tests cover the same rule.
Physical-device execution still requires an attached device.

To retry a completed redacted batch, cover-install the new APK, use the system
album Scan action, allow photo GPS access and start a new scan. Do not resume the
old redacted batch. Permission scope changes force re-enumeration of the selected
range; existing canonical memories are retained and deduplicated. No app-data
clear or uninstall is necessary. Originals stripped of metadata before reaching
MediaStore cannot have GPS reconstructed from their pixels.

## One-tap import (0.2.0-one-tap)

The app's photo dialog is now a single **开始导入** button; the review-based
steps above describe the previous release and remain only for Web file import.

1. The button requests album and photo-GPS access (same consent rules as above).
2. Native `locate` pages MediaStore 400 rows at a time. A small thread pool reads
   only GPS and capture time with the platform `ExifInterface` from the original
   (`setRequireOriginal`). Photos without usable GPS (missing, out of range, 0,0)
   or without any capture time are dropped natively. Only
   `[volume, id, lat, lon, localTime, offset, takenMs]` rows cross the bridge.
3. JS (`src/life/media/auto-import.js`) names each 0.05° cell offline, drops cells
   with no name, counts distinct photo days per city and year and chooses that
   year's maximum as home. Only the current year's home is labelled current.
   Continuous same-city observations spanning more than two calendar months
   establish former residence even outside the annual maximum. Observations
   interrupted by another city or a gap over 72 h do not establish continuous
   residence; two distant photos alone are insufficient. These are inferences.
   Places are merged by city; journeys split only on returning home or a gap
   strictly over 72 h. Changing country alone does not split them, and overlapping
   dates never rejoin journeys separated by a home observation. There is no review.
4. Memories store `android-media:<volume>/<id>` pointers and local GPS/time/city
   metadata; `preview` reads an album thumbnail on demand. No photo pixels are copied.
5. Later runs use the last generation checkpoint and skip saved pointers. The first
   run after upgrading regroups the previous review-based results (see
   `removeLegacyPhotoData`); CSV records, chapters and residences are kept.

## City browsing and regrouping rules (2026-10-27)

Tapping a map cluster first zooms in. Tapping any city focuses that location and
opens its residence history and **N distinct journeys**, including zero or one.
A journey is selected only after tapping its history row; A–B–A counts as one
journey at A. A former residence may also have later travel visits. A city view
clears journey routes and does not fabricate a departure from a home city.

For one country and at most two provinces, titles use province names; otherwise
they use country short names. A cross-border title lists countries in photo order.

**重新整理足迹** lives inside the Photos dialog, alongside **导入新照片**. It
rebuilds automatic groups from saved observations without album permission or a
rescan, preserving photo IDs, city IDs and Chapter references. Automatic import
batches are recomputed together so yearly classification is independent of batch
boundaries. Explicitly edited city classifications and journeys (including titles
and splits) retain their user-defined records and photo membership. Rules version
3 and the classification year are persisted; a new year invalidates the old
current-home result. Legacy data without exact capture metadata falls back to its
saved observation date and city centre rather than inventing the original time.

This change does not produce an APK. Automated browser acceptance uses fictional
records and a simulated native port; phone permissions and EXIF throughput still
require a physical-device check.

Verified on Windows only: JVM `PhotoLocationTest`, 128 Life tests and a mock-port
browser flow (12,000 rows, ~2 s of JS time). Phone EXIF throughput, HEIC EXIF on
the vivo ROM and the real album size still need on-device measurement.
Known limit: offline country polygons are generalized, so photos within a few km
of a border (for example Shenzhen/Hong Kong) can be named after the neighbour.

## Beta 0.3 I2：保存、恢复与数据行为（`MainActivity.java`、`DATA_SOVEREIGNTY.md`）

本节为 2026-10-28 的新增机制；旧分组与边境说明以 `BORDER_TRANSIT_FIX.md`、
`CN_REGION_POLICY.md` 为准。国家 / 地区口径和自动整理已升级到版本 5。

代码审查确认旧 WebView 仅处理文件选择，没有下载监听和保存桥。
现已加入共用的 SAF ACTION_CREATE_DOCUMENT 保存通道，完整备份、记录文件、
CSV、GeoJSON、GPX 和分享文件使用同一通道。JVM 验证分块顺序、字节总量、
取消与磁盘错误；编译与 Lint 不代表系统文件选择器或真实文件提供方验证。

| 动作 | 预期 | 状态与待测步骤 |
| --- | --- | --- |
| 同 applicationId、同签名覆盖安装 | 保留 WebView IndexedDB、设置、缩略图、本地安装来源与扫描检查点；权限仍受系统控制 | **未测**。导入并备份后覆盖安装，逐项比较实体 / ID、提示状态、原图与缩略图，再增量导入 |
| 系统清除 App 数据 | 本机记录、设置、缩略图、扫描日志和安装来源被清除；系统相册及 SAF 保存的外部备份应保留 | **未测**。记录备份位置和校验和，清数据后确认空库，再恢复并比较实体 / ID；原图关联须重新确认 |
| 卸载后重装 | 私有数据与本地安装来源不应被当作仍存在；相册和用户保存的外部文件不随 App 主动删除 | **未测**。分别检查系统是否启用自动备份恢复；从自有完整备份恢复后比较记录并检查缺原图占位 |
| 保存或取消 | 系统选择位置后完整写入；取消不标成功、不更新时间；失败尽力清理未完成文件 | **未测**。分别选本机与常见文档提供方，取消、写入时切后台 / 杀进程、空间不足，检查文件和备份提示 |
| 设备 A → 空设备 B | 规范实体与 ID 一致；没有可验证的本机原图时显示占位，不读取同编号的另一张照片 | 自动化与桌面模拟已验证，**真机未测**。在两台设备放入不同内容但编号相同的照片，恢复后检查卡片与新增扫描 |

新的原生指针带应用安装的随机来源标识，原生预览校验来源；恢复来的旧指针在独立
本机元数据中标记为未关联。覆盖安装保留已有旧指针；清数据 / 重装导致来源变化时，
不能仅凭相册编号重新关联。按内容重新关联尚未实现，再次扫描可能保留两份观测；
不能用相同日期和坐标证明照片内容相同。以上行为仍需在 vivo 与中档 Android 上实测。
