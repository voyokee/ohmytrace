// All ingestion and reconstruction policy knobs live here. Distances are km,
// durations are hours, and buffer sizes are bytes. No hidden per-file globals.
export const MEDIA_LIMITS=Object.freeze({maxFileBytes:64*1024*1024,maxHeaderBytes:4*1024*1024,
  maxIfdEntries:512,maxTagValues:256,maxFiles:10000,workerConcurrency:1,flushEvery:20,
  previewMaxPixels:16_000_000,maxPreviewImages:2,manifestVersion:1});
export const RECONSTRUCTION_RULES=Object.freeze({placeRadiusKm:1,visitGapHours:18,
  tripGapHours:96,homeRadiusKm:15,existingPlaceRadiusKm:1,existingTripDayPadding:1,
  earthRadiusKm:6371.0088});
