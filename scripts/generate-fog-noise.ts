/**
 * Generates a seamless, subtle fog noise texture.
 * Run: npm run generate:icons
 */
import { createCanvas } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
 
const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/textures');
mkdirSync(outDir, { recursive: true });
 
const SIZE = 512;
const OUT_NAME = 'fog-noise.png';
 
type Wave = { kx: number; ky: number; phase: number; amp: number };
 
function rand(seed: number) {
  // xorshift32
  let x = seed | 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // [0,1)
    return ((x >>> 0) / 4294967296);
  };
}
 
function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
 
function generateWaves(seed: number): Wave[] {
  const r = rand(seed);
  const waves: Wave[] = [];
 
  // A few low-frequency and medium-frequency periodic components.
  // Integer kx/ky guarantee seamless tiling over [0,1) UVs.
  const counts = [
    { n: 10, minK: 1, maxK: 3, amp: 1.0 },
    { n: 12, minK: 3, maxK: 7, amp: 0.55 },
    { n: 10, minK: 7, maxK: 13, amp: 0.25 },
  ];
 
  for (const c of counts) {
    for (let i = 0; i < c.n; i++) {
      const kx = Math.floor(c.minK + r() * (c.maxK - c.minK + 1));
      const ky = Math.floor(c.minK + r() * (c.maxK - c.minK + 1));
      const phase = r() * Math.PI * 2;
      const amp = c.amp * (0.65 + 0.7 * r());
      // Avoid (0,0)
      if (kx === 0 && ky === 0) continue;
      waves.push({ kx, ky, phase, amp });
    }
  }
 
  return waves;
}
 
function samplePeriodicCloud(uvx: number, uvy: number, waves: Wave[]): number {
  let sum = 0;
  let ampSum = 0;
  for (const w of waves) {
    // Two basis functions help avoid obvious striping.
    const a = Math.cos(2 * Math.PI * (w.kx * uvx + w.ky * uvy) + w.phase);
    const b = Math.sin(2 * Math.PI * (w.ky * uvx - w.kx * uvy) + w.phase * 0.73);
    const v = 0.6 * a + 0.4 * b;
    sum += v * w.amp;
    ampSum += w.amp;
  }
  // Normalize to roughly [-1, 1]
  return ampSum > 0 ? sum / ampSum : 0;
}
 
function main() {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
 
  const waves = generateWaves(1337);
 
  // First pass: compute field + min/max for normalization.
  const field = new Float32Array(SIZE * SIZE);
  let mn = Infinity;
  let mx = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      // Slight domain warp using another periodic sample (still tiles).
      const warp = samplePeriodicCloud(u, v, waves) * 0.08;
      const n = samplePeriodicCloud(u + warp, v - warp, waves);
      field[y * SIZE + x] = n;
      mn = Math.min(mn, n);
      mx = Math.max(mx, n);
    }
  }
 
  const invRange = mx > mn ? 1 / (mx - mn) : 1;
 
  // Map to a subtle, cloudy grayscale with most energy near midtones.
  for (let i = 0; i < field.length; i++) {
    let t = (field[i]! - mn) * invRange; // [0,1]
    // Soft thresholding to create cloud "puffs" but keep it subtle.
    t = smoothstep(0.28, 0.82, t);
    // Compress contrast (subtle)
    t = 0.25 + t * 0.55;
 
    const g = Math.max(0, Math.min(255, Math.round(t * 255)));
    const o = i * 4;
    img.data[o + 0] = g;
    img.data[o + 1] = g;
    img.data[o + 2] = g;
    img.data[o + 3] = 255;
  }
 
  ctx.putImageData(img, 0, 0);
  writeFileSync(join(outDir, OUT_NAME), canvas.toBuffer('image/png'));
  console.log(`Wrote ${OUT_NAME}`);
}
 
main();

