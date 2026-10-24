// A narrow desktop panel is still a desktop. Layout width says nothing about GPU capacity.
export function constrainedDevice({ coarsePointer = false, memoryGB } = {}) {
  return coarsePointer || (Number.isFinite(memoryGB) && memoryGB <= 4);
}

export function earthTexturePlan({ coarsePointer = false, memoryGB, maxTextureSize = 2048 } = {}) {
  const limit = Math.max(1, Math.floor(maxTextureSize));
  const lowMemory = Number.isFinite(memoryGB) && memoryGB <= 2;
  const constrained = constrainedDevice({ coarsePointer, memoryGB });
  return {
    previewWidth: Math.min(2048, limit),
    // Spend the texture budget on visible surface detail; height/depth/night stay at 2K.
    surfaceWidth: Math.min(lowMemory ? 2048 : constrained ? 4096 : 5400, limit),
    constrained,
  };
}
