# Photo Library V2 verification

2026-10-27, macOS. Base `2e7f20e`; branch `feat/photo-library-v2`.

M1 targeted Node tests: `node --test tests/life/photo-library-input.test.mjs tests/life/photo-formats.test.mjs` — 15/15 pass.
Includes real ImageIO-encoded HEIC/PNG containers derived from generated fixtures,
JPEG/WebP/XMP, explicit time semantics, WGS84, Live Photo companion suppression,
ZIP nested UTF-8 names, CRC failure, path traversal, symlink rejection, capacity,
deflate, cancellation, scoped Web access, and v1/v2 manifest compatibility.
These are synthetic test images, not an accuracy evaluation on a real phone library.

Physical iOS Safari and Android Chrome acceptance is pending authorized devices
and native photo samples. No private photos were added to the repository.
