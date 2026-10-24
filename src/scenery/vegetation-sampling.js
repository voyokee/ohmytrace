// Pixel analysis is independent of Cesium, so it can run in a worker.
export async function sampleVegetation(options, checkpoint) {
  const { data, width: W, darkV, blossom, cpx, cpy, mPerPx, radius, x0, y0, n, treeCap, flowerCap } = options;
  let seed = options.seed;
  const random = () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const cls = new Uint8Array(W * W), luma = new Float32Array(W * W);
  for (let i = 0, k = 0; i < luma.length; i++, k += 4) {
    if (checkpoint && i % 65536 === 0) await checkpoint();
    luma[i] = (0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2]) / 255;
  }
  for (let y = 1; y < W - 1; y++) {
    if (checkpoint && y % 16 === 0) await checkpoint();
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, k = i * 4;
      const r = data[k], g = data[k + 1], b = data[k + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255, s = max ? (max - min) / max : 0;
      // Sparse dry scrub is allowed only for an explicitly selected arid habitat. Grey roofs,
      // blue water, white salt/snow and very bright bare dunes remain empty.
      if(options.arid&&r>g*1.08&&g>r*.56&&b<g*.85&&s>.18&&v>.25&&v<.72){cls[i]=3;continue;}
      if(b>r*1.2&&b>g*.7)continue;
      if (g < r * 0.95 || g < b * 0.9 || s < 0.12) continue;
      let sum = 0, sq = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const light = luma[i + dy * W + dx]; sum += light; sq += light * light;
      }
      const rough = Math.sqrt(Math.max(0, sq / 9 - (sum / 9) ** 2));
      const canopy = rough > 0.05 && g > r * 1.06 && s > 0.2 && v < darkV + 0.15;
      cls[i] = (v < darkV && g > r && (rough > .014 || b < g * .55)) || canopy ? 1 : v >= darkV + 0.05 ? 2 : 0;
    }
  }
  const B = 8, NB = W / B;
  const forest = new Float32Array(NB * NB), meadow = new Float32Array(NB * NB);
  for (let by = 0; by < NB; by++) {
    if (checkpoint && by % 8 === 0) await checkpoint();
    for (let bx = 0; bx < NB; bx++) {
      let f = 0, m = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) {
        const c = cls[y * W + x];
        if (c === 1) f++; else if (c === 2) m++;
      }
      forest[by * NB + bx] = f / (B * B); meadow[by * NB + bx] = m / (B * B);
    }
  }
  const trees = [], flowers = [],nearFlowers=[],farFlowers=[];
  let treeSeen = 0, flowerSeen = 0,nearSeen=0,farSeen=0;
  for (let py = 0; py < W; py++) {
    if (checkpoint && py % 16 === 0) await checkpoint();
    for (let px = 0; px < W; px++) {
      let c = cls[py * W + px];
      if (!c) continue;
      const bi = (py / B | 0) * NB + (px / B | 0);
      const dm = Math.hypot(px - cpx, py - cpy) * mPerPx;
      if (dm > radius) continue;
      const keep = Math.exp(-((dm / 1500) ** 2));
      let force = null;
      const green = forest[bi] + meadow[bi];
      // Blossom colours change the species, never the land-cover requirement. Sparse green roof
      // pixels in a city block must not seed a full canopy on the surrounding streets/buildings.
      if(c===3){if(random()>.001*keep)continue;}
      else if (blossom && green > 0.60 && forest[bi] > 0.20 && random() < 0.45 * keep) {
        c = 1; force = 'cherry';
      } else if (c === 1 ? forest[bi] <= 0.45 || random() > 0.7 * keep : meadow[bi] <= 0.6 || random() > (options.focusGrass&&dm<450?.10:.03) * keep) continue;
      // Reservoir sampling bounds candidate memory before expensive coordinate/colour work.
      const woody=c!==2;
      const localMeadow=!woody&&options.focusGrass;
      const local=dm<450,nearCap=Math.round(flowerCap*.65);
      const arr = woody ? trees : localMeadow?(local?nearFlowers:farFlowers):flowers;
      const cap = woody ? treeCap : localMeadow?(local?nearCap:flowerCap-nearCap):flowerCap;
      const seen = woody ? ++treeSeen : localMeadow?(local?++nearSeen:++farSeen):++flowerSeen;
      if (!cap) continue;
      const slot = seen <= cap ? seen - 1 : Math.floor(random() * seen);
      if (slot >= cap) continue;
      let r = 0, g = 0, b = 0, count = 0;
      for (let yy = Math.max(0, py - 1); yy <= Math.min(W - 1, py + 1); yy++) {
        for (let xx = Math.max(0, px - 1); xx <= Math.min(W - 1, px + 1); xx++) {
          const k = (yy * W + xx) * 4; r += data[k]; g += data[k + 1]; b += data[k + 2]; count++;
        }
      }
      const X = x0 + (px + random()) / 256, Y = y0 + (py + random()) / 256;
      arr[slot] = { lon: X / n * 360 - 180,
        lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * Y / n))) * 180 / Math.PI,
        rgb: [r / count / 255, g / count / 255, b / count / 255], distance: dm,
        force, kind: woody ? 'tree' : 'flower' };
    }
  }
  return [...trees, ...flowers,...nearFlowers,...farFlowers];
}
