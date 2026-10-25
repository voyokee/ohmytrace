// Shared camera-relative art light. The same eye-space direction lights the globe, terrain,
// foliage and cloud-shadow projection through a flight; it is not a date-based solar model.
export const SUN_EC=Object.freeze([0.72,0.64,0.70]);
export function syncCameraSun(inverseView,eye,world) {
  Cesium.Cartesian3.fromArray(SUN_EC,0,eye);
  Cesium.Cartesian3.normalize(eye,eye);
  Cesium.Matrix4.multiplyByPointAsVector(inverseView,eye,world);
  Cesium.Cartesian3.normalize(world,world);
}
