import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n | 0));
}

/** Billiard / pool-table felt: vivid green with fine multidirectional nap. */
export function createFeltTexture(size = 512): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Classic casino / pool felt green.
  ctx.fillStyle = '#0b6b38';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      // Periodic nap so tiling stays clean.
      const napA =
        Math.sin(u * TAU * 48 + v * TAU * 11) * 5 +
        Math.sin(u * TAU * 13 - v * TAU * 41) * 4;
      const napB =
        Math.sin((u + v) * TAU * 27) * 3 + Math.sin((u - v) * TAU * 35) * 3;
      const mottling =
        Math.sin(u * TAU * 5 + v * TAU * 3) * 7 +
        Math.sin(u * TAU * 2 - v * TAU * 6) * 5;
      const shade = napA + napB + mottling;
      d[i] = clampByte(12 + shade * 0.25);
      d[i + 1] = clampByte(110 + shade);
      d[i + 2] = clampByte(55 + shade * 0.45);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Soft cloth-roll fibers (periodic in V).
  ctx.globalAlpha = 0.07;
  for (let s = 0; s < 24; s++) {
    const v0 = ((s + 0.5) / 24) * size;
    ctx.strokeStyle = s % 2 === 0 ? '#084f2a' : '#14924c';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, v0);
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, v0 + Math.sin((x / size) * TAU * 3 + s) * 1.2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Warm wood grain for tray walls / rim — tile-seamless (periodic in U and V). */
export function createWoodTexture(size = 512): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const img = ctx.createImageData(size, size);
  const d = img.data;
  const TAU = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Normalized coords; all frequencies are integers ⇒ wraps without a seam.
      const u = x / size;
      const v = y / size;

      // Vertical-ish rings that gently wave along the board length.
      const wave = Math.sin(v * TAU * 3) * 1.6 + Math.sin(v * TAU * 7) * 0.45;
      const ring =
        Math.sin(u * TAU * 8 + wave) * 15 +
        Math.sin(u * TAU * 3 + v * TAU) * 7 +
        Math.sin(u * TAU * 14 + Math.sin(v * TAU * 2) * 0.8) * 5;

      // Fine pores / latewood flecks (still periodic).
      const pore =
        Math.sin(u * TAU * 31 + v * TAU * 19) * 3.5 +
        Math.sin(u * TAU * 47 - v * TAU * 29) * 2.5 +
        Math.sin((u * 17 + v * 13) * TAU) * 2;

      // Soft darker growth bands at periodic U positions.
      let streak = 0;
      for (let k = 0; k < 6; k++) {
        const band = (u * 6 + k / 6 + Math.sin(v * TAU * 2 + k) * 0.04) % 1;
        const dist = Math.min(Math.abs(band), 1 - Math.abs(band));
        streak += Math.max(0, 1 - dist * 28) * -7;
      }

      const shade = ring + pore + streak;
      d[i] = clampByte(118 + shade);
      d[i + 1] = clampByte(78 + shade * 0.75);
      d[i + 2] = clampByte(48 + shade * 0.45);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
