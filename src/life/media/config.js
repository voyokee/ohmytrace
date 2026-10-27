// All ingestion and reconstruction policy knobs live here. Distances are km,
// durations are hours, and buffer sizes are bytes. No hidden per-file globals.
// Only a sampled header/tail of each original is read (sampleBytes, tailSampleBytes;
// at most maxHeaderBytes when metadata sits deeper), so maxFileBytes bounds identity
// work rather than memory. workerConcurrency is an upper bound; the scanner also caps
// it by navigator.hardwareConcurrency.
export const MEDIA_LIMITS=Object.freeze({maxFileBytes:1024*1024*1024,maxHeaderBytes:4*1024*1024,sampleBytes:64*1024,tailSampleBytes:16*1024,
  maxIfdEntries:512,maxTagValues:256,maxFiles:20000,workerConcurrency:4,filesPerJob:16,flushEvery:100,maxDuplicateHints:5,
  previewMaxPixels:16_000_000,maxPreviewImages:2,manifestVersion:2});
export const RECONSTRUCTION_RULES=Object.freeze({placeRadiusKm:1,visitGapHours:18,
  tripGapHours:72,homeRadiusKm:15,existingPlaceRadiusKm:1,existingTripDayPadding:1,
  earthRadiusKm:6371.0088,
  // Without any dated residence, the ~0.1° cell holding the most photo days is a
  // suggested home base when it covers enough days; photos near it are daily memories.
  inferHomeCellDegrees:0.1,inferHomeMinDays:5,inferHomeMinShare:0.3});
