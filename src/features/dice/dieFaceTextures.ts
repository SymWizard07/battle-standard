import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import type { FaceDef } from './faceRead';
import type { DiceSides } from './diceTypes';

export type DieFaceTextures = {
  map: Texture;
  normalMap: Texture;
  normalScale: Vector2;
};

const textureCache = new Map<string, DieFaceTextures>();

export function dieAtlasGrid(faceCount: number): { cols: number } {
  return { cols: Math.max(1, Math.ceil(Math.sqrt(Math.max(1, faceCount)))) };
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function atlasLayout(faceCount: number, cellHint = 128): { cols: number; size: number; cell: number } {
  const { cols } = dieAtlasGrid(faceCount);
  const size = nextPow2(cols * cellHint);
  return { cols, size, cell: size / cols };
}

/**
 * Build a tangent-space normal map from height (brighter = raised).
 * Dark digits ⇒ recessed engraving.
 */
function heightToNormalMap(height: ImageData, strength = 2.8): ImageData {
  const { width: w, height: h, data: src } = height;
  const out = new ImageData(w, h);
  const dst = out.data;
  const at = (x: number, y: number) => {
    const xi = Math.min(w - 1, Math.max(0, x));
    const yi = Math.min(h - 1, Math.max(0, y));
    return src[(yi * w + xi) * 4]! / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Canvas Y grows down; flip so +Y in the normal map is UV-up.
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      dst[i] = (nx * 0.5 + 0.5) * 255;
      dst[i + 1] = (ny * 0.5 + 0.5) * 255;
      dst[i + 2] = (nz * 0.5 + 0.5) * 255;
      dst[i + 3] = 255;
    }
  }
  return out;
}

function drawCenteredNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fontPx: number,
  fill: string,
  angleRad = 0,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angleRad);
  ctx.font = `700 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function faceBasis(face: FaceDef): {
  center: Vector3;
  uAxis: Vector3;
  vAxis: Vector3;
  normal: Vector3;
} {
  const normal = new Vector3(face.normal[0], face.normal[1], face.normal[2]).normalize();
  const align = face.align
    ? new Vector3(face.align[0], face.align[1], face.align[2])
    : new Vector3(1, 0, 0);
  align.addScaledVector(normal, -align.dot(normal));
  if (align.lengthSq() < 1e-10) {
    const ref = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    align.crossVectors(normal, ref);
  }
  align.normalize();
  const uAxis = new Vector3().crossVectors(align, normal).normalize();
  const vAxis = align.clone();
  const center = face.center
    ? new Vector3(face.center[0], face.center[1], face.center[2])
    : normal.clone().multiplyScalar(0.5);
  return { center, uAxis, vAxis, normal };
}

function paintFaceCell(
  albedo: CanvasRenderingContext2D,
  height: CanvasRenderingContext2D,
  face: FaceDef,
  x0: number,
  y0: number,
  cell: number,
  bodyColor: string,
  sides: DiceSides,
) {
  const { r, g, b } = parseHexColor(bodyColor);
  albedo.fillStyle = `rgb(${r},${g},${b})`;
  albedo.fillRect(x0, y0, cell, cell);
  height.fillStyle = '#808080';
  height.fillRect(x0, y0, cell, cell);

  const ink = '#1e293b';
  const { center, uAxis, vAxis } = faceBasis(face);
  const frame = face.uvFrame ?? {
    uMin: -0.5,
    uMax: 0.5,
    vMin: -0.5,
    vMax: 0.5,
  };
  const du = frame.uMax - frame.uMin || 1;
  const dv = frame.vMax - frame.vMin || 1;

  const toPixel = (world: Vector3) => {
    const d = world.clone().sub(center);
    const uN = (d.dot(uAxis) - frame.uMin) / du;
    const vN = (d.dot(vAxis) - frame.vMin) / dv;
    // Canvas Y down; vN=1 (glyph up) → top of cell.
    return {
      x: x0 + uN * cell,
      y: y0 + (1 - vN) * cell,
    };
  };

  if (face.cornerLabels && face.cornerLabels.length >= 3) {
    const fontPx = cell * (sides === 4 ? 0.28 : 0.2);
    for (const corner of face.cornerLabels) {
      // Use true corner direction from face center for placement (label pos is inset).
      const toward = new Vector3(corner.align[0], corner.align[1], corner.align[2]).normalize();
      // Inset from corners so glyphs stay readable and clear of edges.
      const edgePush = Math.min(du, dv) * (sides === 4 ? 0.26 : 0.38);
      const wp = center.clone().addScaledVector(toward, edgePush);
      const { x, y } = toPixel(wp);
      const au = toward.dot(uAxis);
      const av = toward.dot(vAxis);
      const rot = Math.atan2(au, av);
      drawCenteredNumber(albedo, String(corner.value), x, y, fontPx, ink, rot);
      drawCenteredNumber(height, String(corner.value), x, y, fontPx, '#101010', rot);
    }
  } else {
    const digits = String(face.value);
    const twoDigit = digits.length > 1;
    // d20 faces are small triangles — keep 10–20 inset from the edges.
    const fontPx = twoDigit
      ? cell * (sides === 20 ? 0.32 : 0.42)
      : cell * (sides === 20 ? 0.44 : 0.52);
    const { x, y } = toPixel(center);
    drawCenteredNumber(albedo, digits, x, y, fontPx, ink, 0);
    drawCenteredNumber(height, digits, x, y, fontPx, '#101010', 0);
  }

  albedo.strokeStyle = `rgba(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)},0.3)`;
  albedo.lineWidth = Math.max(1, cell * 0.012);
  const inset = cell * 0.06;
  albedo.strokeRect(x0 + inset, y0 + inset, cell - inset * 2, cell - inset * 2);
}

/**
 * Albedo + normal-map atlas for a die. Glyphs are painted per face cell;
 * normals come from a height field so numbers read as recessed engraving.
 */
export function getDieFaceTextures(
  sides: DiceSides,
  bodyColor: string,
  faces: FaceDef[],
): DieFaceTextures {
  const key = `v3:${sides}:${bodyColor}:${faces
    .map((f) => `${f.value}:${f.align?.join(',') ?? ''}`)
    .join('|')}`;
  const hit = textureCache.get(key);
  if (hit) return hit;

  const { cols, size, cell } = atlasLayout(faces.length, sides >= 12 ? 96 : 128);
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const hCtx = heightCanvas.getContext('2d')!;

  aCtx.fillStyle = bodyColor;
  aCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < faces.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    paintFaceCell(aCtx, hCtx, faces[i]!, col * cell, row * cell, cell, bodyColor, sides);
  }

  const heightData = hCtx.getImageData(0, 0, size, size);
  const normalData = heightToNormalMap(heightData, sides === 4 ? 3.2 : 2.6);
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext('2d')!.putImageData(normalData, 0, 0);

  const map = new CanvasTexture(albedoCanvas);
  map.colorSpace = SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.needsUpdate = true;

  const normalMap = new CanvasTexture(normalCanvas);
  normalMap.colorSpace = NoColorSpace;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = LinearMipmapLinearFilter;
  normalMap.magFilter = LinearFilter;
  normalMap.needsUpdate = true;

  const result: DieFaceTextures = {
    map,
    normalMap,
    normalScale: new Vector2(1.05, 1.05),
  };
  textureCache.set(key, result);
  return result;
}
