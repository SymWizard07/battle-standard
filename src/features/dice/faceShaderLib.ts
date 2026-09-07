import {
  CanvasTexture,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Texture,
} from 'three';

/** Shared vertex for playground preview and custom die face materials. */
export const FACE_SHADER_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Stock die look: white albedo × accent color, with light normal-map shading
 * so engraved numbers still read. Assigned to every die type by default.
 */
export const DEFAULT_DIE_FACE_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
uniform float uTime;
uniform float uRandom;
uniform vec2 uResolution;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform vec3 uFaceColor;

void main() {
  vec3 albedo = texture2D(uAlbedoMap, vUv).rgb;
  vec3 nTex = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
  vec3 L = normalize(vec3(0.35, 0.7, 1.0));
  float diff = 0.7 + 0.3 * max(dot(normalize(nTex), L), 0.0);
  vec3 col = albedo * uFaceColor * diff;
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Default fragment for the settings playground.
 * On dice, sample uAlbedoMap / uNormalMap with vUv for engraved numbers.
 * Use vPos (local mesh position) for seamless procedural fields across faces.
 * uRandom is a stable per-die float in [0,1) for phase / variation.
 */
export const FACE_SHADER_STARTER = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
uniform float uTime;
uniform float uRandom;
uniform vec2 uResolution;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform vec3 uFaceColor;

void main() {
  vec2 uv = vUv;
  float t = uTime + uRandom * 100.0;
  vec3 base = 0.5 + 0.5 * cos(t + vPos.xyz * 2.0 + vec3(0.0, 2.0, 4.0));
  vec3 albedo = texture2D(uAlbedoMap, uv).rgb;
  vec3 col = mix(base, albedo * base, 0.85);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Back-compat aliases used by the settings panel. */
export const SHADER_PREVIEW_VERTEX = FACE_SHADER_VERTEX;
export const SHADER_PREVIEW_STARTER = FACE_SHADER_STARTER;

let stubAlbedo: Texture | null = null;
let stubNormal: Texture | null = null;
let previewAlbedo: Texture | null = null;
let previewNormal: Texture | null = null;

/** 1×1 white albedo for missing maps. */
export function getStubAlbedoMap(): Texture {
  if (stubAlbedo) return stubAlbedo;
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  stubAlbedo = tex;
  return tex;
}

/** 1×1 flat tangent normal (0.5, 0.5, 1). */
export function getStubNormalMap(): Texture {
  if (stubNormal) return stubNormal;
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new DataTexture(data, 1, 1, RGBAFormat, UnsignedByteType);
  tex.needsUpdate = true;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  stubNormal = tex;
  return tex;
}

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

/**
 * White-field atlas cell with a dark “13” glyph for the settings shader preview
 * (so adaptive ink / normal sampling can be tested off-die).
 */
export function getPreviewGlyphMaps(): { albedo: Texture; normal: Texture } {
  if (previewAlbedo && previewNormal) {
    return { albedo: previewAlbedo, normal: previewNormal };
  }

  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const heightCanvas = document.createElement('canvas');
  heightCanvas.width = size;
  heightCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const hCtx = heightCanvas.getContext('2d')!;

  aCtx.fillStyle = '#ffffff';
  aCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.52;
  const fontPx = size * 0.48;
  aCtx.font = `700 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  aCtx.textAlign = 'center';
  aCtx.textBaseline = 'middle';
  aCtx.fillStyle = '#1e293b';
  aCtx.fillText('13', cx, cy);

  hCtx.font = aCtx.font;
  hCtx.textAlign = 'center';
  hCtx.textBaseline = 'middle';
  hCtx.fillStyle = '#101010';
  hCtx.fillText('13', cx, cy);

  const normalData = heightToNormalMap(hCtx.getImageData(0, 0, size, size), 2.8);
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext('2d')!.putImageData(normalData, 0, 0);

  const albedo = new CanvasTexture(albedoCanvas);
  albedo.colorSpace = SRGBColorSpace;
  albedo.generateMipmaps = true;
  albedo.minFilter = LinearMipmapLinearFilter;
  albedo.magFilter = LinearFilter;
  albedo.needsUpdate = true;

  const normal = new CanvasTexture(normalCanvas);
  normal.colorSpace = NoColorSpace;
  normal.generateMipmaps = true;
  normal.minFilter = LinearMipmapLinearFilter;
  normal.magFilter = LinearFilter;
  normal.needsUpdate = true;

  previewAlbedo = albedo;
  previewNormal = normal;
  return { albedo, normal };
}

export function hexToFaceColor(hex: string): Vector3 {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return new Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  );
}

export function createFaceShaderUniforms(
  albedo: Texture = getStubAlbedoMap(),
  normal: Texture = getStubNormalMap(),
  faceColor: Vector3 | string = new Vector3(1, 1, 1),
  /** Stable per-instance value in [0, 1). */
  random = Math.random(),
) {
  const color =
    typeof faceColor === 'string' ? hexToFaceColor(faceColor) : faceColor.clone();
  return {
    uTime: { value: 0 },
    uRandom: { value: random },
    uResolution: { value: new Vector2(1, 1) },
    uAlbedoMap: { value: albedo },
    uNormalMap: { value: normal },
    uFaceColor: { value: color },
  };
}
