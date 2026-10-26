export const TERRAIN_END = 650000;
export const HERO_START = 2400000;
export const TERRAIN_PRELOAD = 4300000;
export function smoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function presentationState(altitude, ready) {
  const mix = ready ? smoothstep(TERRAIN_END, HERO_START, altitude) : 0;
  return { mix, surface: mix > 0, terrain: mix < 1 || altitude < TERRAIN_PRELOAD,
    phase: !ready ? 'fallback' : mix === 0 ? 'terrain' : mix === 1 ? 'earth' : 'transition' };
}
export function geographicUV(longitude, latitude) {
  return [((longitude + 180) / 360 % 1 + 1) % 1, (latitude + 90) / 180];
}
