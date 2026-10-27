# Native platform boundary

## Android implementation (2026-10-27)

`feat/photo-import` now includes an Android 10+ WebView application, an
origin-scoped native message bridge, MediaStore permission/date-range/generation
paging, durable resumable acquisition and native HEIC thumbnail generation.
See [Android photo import](ANDROID_PHOTO_IMPORT.md) for build, tests and remaining
device acceptance. Web and iOS boundaries below remain unchanged; the old
no-Android-source statement below describes the earlier M5.2 milestone.

## Earlier M5.2 milestone

M5.0 emits `dist/native/`, the same audited Web runtime as Editor. This is a
`webDir` candidate, not an Android/iOS application. There is no APK, IPA,
Capacitor installation, PhotoKit/Kotlin bridge or claimed device acceptance.

`src/platform/contracts.d.ts` defines permission status, selection, authorized
pagination, metadata/content/thumbnail reads, cancellation, library observation
and release. Implement a Web adapter around the existing File API/PhotoScanner;
retain Phase 3 reconstruction, review, transaction and canonical identity logic.
Native adapters only acquire observations. Human review remains mandatory.

Evaluate the current stable [Capacitor requirements](https://capacitorjs.com/docs/getting-started/environment-setup)
when native work starts. Keep its Node/SDK/Xcode requirements separate from this
repository's Node >=20 Web build and the Sites wrapper's Node >=22.13. Do not
upgrade the Web minimum merely to install a native toolchain.

Android first: system Photo Picker, bounded JPEG/HEIC reads, URI scope/lifetime,
authorized location vs redacted/absent GPS, cancellation and revoked selections.
Add MediaStore only for an explicit incremental-library use case. iOS: native
Picker/PhotoKit authorized/limited/denied/restricted, iCloud assets not downloaded,
permission changes and cancelled downloads. Native handles are device-local;
map them to stable asset identities separately, never replace `media:<assetId>`
with a supposedly permanent URI or cross-device PHAsset identifier.

Next acceptance requires actual Android and iOS builds, then physical-device
Globe/Trip/Scenery/photo-review tests. Record startup, frame-time distribution,
heap/GPU resources, scan memory, long playback, background/foreground and offline
behavior. Current Chrome touch tests certify browser behavior only. IndexedDB
must be tested inside each WebView; app installation does not guarantee permanent
storage. Keep explicit complete backup/restore and document uninstall, app-data
clear, operating-system cleanup and Web-to-native migration behavior.

## Photo Library V2 Web boundary (2026-10-27)

`src/platform/web-photo-capability.js` now supplies an executable scoped Web
adapter and bounded directory/ZIP input preparation. `photoObservation()` exposes
normalized time and WGS84 semantics while keeping canonical/media identities.
The production album UI uses this input preparation and the existing scanner and
PhotoHistoryService. User-selected File handles are page-scoped; release/cancel
is explicit. Web cannot enumerate the operating system gallery, monitor incremental
library changes, authorize background PhotoKit/MediaStore access or fetch arbitrary
iCloud/Android cloud assets. Missing/redacted picker GPS remains absent. Native
metadata/thumbnail decoders can later replace acquisition, preserving the same
human review, reconstruction, stable ID and Repository behavior. Android/iOS
builds and physical-device acceptance remain pending, as described above.
