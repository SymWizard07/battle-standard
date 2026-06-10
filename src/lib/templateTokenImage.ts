import { loadAsset, saveAsset } from './db';
import { templateTokenDisplayName } from './tokenLibrary';
import {
  templateTokenIconForColor,
  type TemplateTokenIconSource,
} from './templateTokenIconSources';

export const TEMPLATE_TOKEN_RENDER_SIZE = 256;

/** Bump when ring shading or center icon changes so cached PNGs regenerate. */
const RENDER_VERSION = 10;

const publicBase = import.meta.env.BASE_URL;

const PALE_GOLD: [number, number, number] = [232, 213, 163];
const DARK_CRIMSON: [number, number, number] = [127, 29, 29];
const CRIMSON_AZIMUTH = 45;

/** Light from upper-left, slightly toward the viewer. */
const LIGHT: [number, number, number] = normalize3(-0.62, -0.58, 0.88);

const blobCache = new Map<string, Promise<Blob>>();
const urlCache = new Map<string, string>();
const iconImageCache = new Map<string, Promise<HTMLImageElement>>();

function templateTokenRadii(size: number): { outerR: number; midR: number; fillR: number } {
  const cx = size / 2;
  const outerR = cx - 1;
  const bandWidth = Math.max(3, outerR * 0.1);
  const midR = outerR - bandWidth;
  const fillR = midR - bandWidth;
  return { outerR, midR, fillR };
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Darker tint of the token fill for the center icon. */
function iconTintHex(fillRgb: [number, number, number]): string {
  return rgbToHex(scaleRgb(fillRgb, 0.46));
}

function recolorSvg(svg: string, color: string): string {
  return svg
    .replace(/\bfill="#000000"/gi, `fill="${color}"`)
    .replace(/\bfill="#000"/gi, `fill="${color}"`)
    .replace(/\bstroke="#000000"/gi, `stroke="${color}"`)
    .replace(/\bstroke="#000"/gi, `stroke="${color}"`);
}

function publicAssetUrl(relativePath: string): string {
  return `${publicBase}${relativePath.replace(/^\//, '')}`;
}

function loadTemplateIconImage(
  source: TemplateTokenIconSource,
  tintHex: string,
): Promise<HTMLImageElement> {
  const key = `${source.id}@${tintHex.toLowerCase()}`;
  const cached = iconImageCache.get(key);
  if (cached) return cached;

  const promise = fetch(publicAssetUrl(`icons/template-tokens/${source.id}.svg`))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load template icon ${source.id}: ${res.status}`);
      return res.text();
    })
    .then((svg) => recolorSvg(svg, tintHex))
    .then(
      (svg) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const blob = new Blob([svg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Failed to decode template icon ${source.id}`));
          };
          img.src = url;
        }),
    )
    .catch((err) => {
      iconImageCache.delete(key);
      throw err;
    });

  iconImageCache.set(key, promise);
  return promise;
}

async function drawTemplateTokenIcon(
  ctx: CanvasRenderingContext2D,
  templateColor: string,
  size: number,
  fillR: number,
): Promise<void> {
  const source = templateTokenIconForColor(templateColor);
  if (!source) return;

  const fillRgb = parseHexColor(templateColor);
  const tintHex = iconTintHex(fillRgb);
  const img = await loadTemplateIconImage(source, tintHex);
  const iconSize = fillR * 2 * 0.56;
  const x = (size - iconSize) / 2;
  const y = (size - iconSize) / 2;
  ctx.drawImage(img, x, y, iconSize, iconSize);
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function parseHexColor(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return [0, 0, lightness * 100];
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case rn:
      hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      hue = ((bn - rn) / delta + 2) / 6;
      break;
    default:
      hue = ((rn - gn) / delta + 4) / 6;
      break;
  }

  return [hue * 360, saturation * 100, lightness * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function adjustLightness(rgb: [number, number, number], deltaPct: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(...rgb);
  return hslToRgb(h, s, Math.max(4, Math.min(96, l + deltaPct)));
}

function scaleRgb(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.max(0, Math.min(255, rgb[0]! * factor)),
    Math.max(0, Math.min(255, rgb[1]! * factor)),
    Math.max(0, Math.min(255, rgb[2]! * factor)),
  ];
}

function facing(amountDeg: number, directionDeg: number): number {
  return (Math.cos(((amountDeg - directionDeg) * Math.PI) / 180) + 1) / 2;
}

function goldCrimsonBase(angleDeg: number): [number, number, number] {
  return lerpRgb(PALE_GOLD, DARK_CRIMSON, facing(angleDeg, CRIMSON_AZIMUTH));
}

/**
 * Outer facet: slopes down from ridge toward rim; normal tilts up-and-outward.
 */
function outerFacetNormal(thetaRad: number): [number, number, number] {
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  return normalize3(cosT * 0.74, sinT * 0.74, 0.4);
}

function innerFacetNormal(thetaRad: number): [number, number, number] {
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  return normalize3(-cosT * 0.74, -sinT * 0.74, 0.4);
}

function innerLipNormal(thetaRad: number): [number, number, number] {
  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  return normalize3(-cosT * 0.5, -sinT * 0.5, -0.62);
}

function ridgeCreaseBoost(dist: number, midR: number, angleDeg: number): number {
  const ridgePx = Math.max(0.55, midR * 0.012);
  const proximity = 1 - Math.min(1, Math.abs(dist - midR) / ridgePx);
  if (proximity <= 0) return 0;
  const lit = facing(angleDeg, 225);
  return proximity * proximity * (lit * 0.34 - (1 - lit) * 0.26);
}

function diffuseShade(normal: [number, number, number]): number {
  const dot =
    normal[0]! * LIGHT[0]! + normal[1]! * LIGHT[1]! + normal[2]! * LIGHT[2]!;
  return Math.max(0.38, Math.min(1.1, 0.5 + dot * 0.82));
}

function applyRingShade(base: [number, number, number], shade: number): [number, number, number] {
  return adjustLightness(base, (shade - 0.92) * 36);
}

function outerFacetShade(thetaRad: number, angleDeg: number): number {
  const lit = facing(angleDeg, 225);
  return diffuseShade(outerFacetNormal(thetaRad)) + (lit - 0.5) * 0.2;
}

function innerFacetShade(thetaRad: number, angleDeg: number): number {
  const lit = facing(angleDeg, 225);
  return diffuseShade(innerFacetNormal(thetaRad)) - (lit - 0.5) * 0.16;
}

function fillShadowFactor(dist: number, fillR: number, angleDeg: number, bandWidth: number): number {
  const shadowDepth = Math.max(2.5, bandWidth * 0.9);
  const inward = fillR - dist;
  if (inward <= 0 || inward >= shadowDepth) return 0;

  const t = inward / shadowDepth;
  const falloff = (1 - t) * (1 - t) * (3 - 2 * t);
  const awayFromLight = facing(angleDeg, CRIMSON_AZIMUTH);
  return falloff * (0.38 + awayFromLight * 0.34);
}

function fillPixelColor(
  fillRgb: [number, number, number],
  dist: number,
  fillR: number,
  angleDeg: number,
  bandWidth: number,
): [number, number, number] {
  const shadow = fillShadowFactor(dist, fillR, angleDeg, bandWidth);
  if (shadow <= 0) return fillRgb;
  return scaleRgb(adjustLightness(fillRgb, -shadow * 38), 1 - shadow * 0.22);
}

function ringPixelColor(
  thetaRad: number,
  angleDeg: number,
  dist: number,
  outerR: number,
  midR: number,
  fillR: number,
): [number, number, number] {
  const bandWidth = outerR - midR;
  const base = goldCrimsonBase(angleDeg);
  const crease = ridgeCreaseBoost(dist, midR, angleDeg);

  if (dist >= midR) {
    const u = (dist - midR) / bandWidth;
    let shade = outerFacetShade(thetaRad, angleDeg);
    if (u > 0.75) {
      const rim = (u - 0.75) / 0.25;
      shade -= rim * 0.2;
    }
    shade += crease;
    return applyRingShade(base, shade);
  }

  const u = (dist - fillR) / bandWidth;
  let shade =
    u < 0.2
      ? diffuseShade(innerLipNormal(thetaRad)) - (1 - u / 0.2) * 0.22
      : innerFacetShade(thetaRad, angleDeg);
  shade += crease;
  return applyRingShade(base, shade);
}

export function templateTokenAssetId(campaignId: string, templateColor: string): string {
  return `tpl-v${RENDER_VERSION}-${campaignId}-${templateColor.replace('#', '').toLowerCase()}`;
}

export function renderTemplateTokenCanvas(
  templateColor: string,
  size = TEMPLATE_TOKEN_RENDER_SIZE,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const { outerR, midR, fillR } = templateTokenRadii(size);
  const fillRgb = parseHexColor(templateColor);
  const image = ctx.createImageData(size, size);
  const data = image.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      const idx = (y * size + x) * 4;

      if (dist > outerR) {
        data[idx + 3] = 0;
        continue;
      }

      const thetaRad = Math.atan2(dy, dx);
      const angleDeg = (thetaRad * 180) / Math.PI;
      let rgb: [number, number, number];

      if (dist <= fillR) {
        rgb = fillPixelColor(fillRgb, dist, fillR, angleDeg, outerR - midR);
      } else {
        rgb = ringPixelColor(thetaRad, angleDeg, dist, outerR, midR, fillR);
      }

      data[idx] = rgb[0]!;
      data[idx + 1] = rgb[1]!;
      data[idx + 2] = rgb[2]!;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function renderTemplateTokenCanvasWithIcon(
  templateColor: string,
  size = TEMPLATE_TOKEN_RENDER_SIZE,
): Promise<HTMLCanvasElement> {
  const canvas = renderTemplateTokenCanvas(templateColor, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const { fillR } = templateTokenRadii(size);
  await drawTemplateTokenIcon(ctx, templateColor, size, fillR);
  return canvas;
}

export function renderTemplateTokenBlob(
  templateColor: string,
  size = TEMPLATE_TOKEN_RENDER_SIZE,
): Promise<Blob> {
  const key = `${templateColor.toLowerCase()}@${size}@v${RENDER_VERSION}`;
  const cached = blobCache.get(key);
  if (cached) return cached;

  const promise = renderTemplateTokenCanvasWithIcon(templateColor, size).then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to encode template token image'));
          },
          'image/png',
        );
      }),
  );
  blobCache.set(key, promise);
  return promise;
}

export async function getTemplateTokenObjectUrl(templateColor: string): Promise<string> {
  const key = `${templateColor.toLowerCase()}@v${RENDER_VERSION}`;
  const cached = urlCache.get(key);
  if (cached) return cached;

  const blob = await renderTemplateTokenBlob(templateColor);
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

export async function ensureTemplateTokenAsset(
  campaignId: string,
  templateColor: string,
  registerAssetUrl: (assetId: string, url: string) => void,
  options?: { forceRegenerate?: boolean },
): Promise<string> {
  const assetId = templateTokenAssetId(campaignId, templateColor);
  const existing = await loadAsset(assetId);

  if (existing && !options?.forceRegenerate) {
    registerAssetUrl(assetId, URL.createObjectURL(existing.blob));
    return assetId;
  }

  const blob = await renderTemplateTokenBlob(templateColor);
  await saveAsset({
    id: assetId,
    campaignId,
    blob,
    mimeType: 'image/png',
    name: templateTokenDisplayName(templateColor),
    createdAt: Date.now(),
    kind: 'token',
  });
  registerAssetUrl(assetId, URL.createObjectURL(blob));
  return assetId;
}

export function isTemplateTokenAssetId(assetId: string): boolean {
  return assetId.startsWith('tpl-');
}

export function invalidateTemplateTokenRenderCache(): void {
  blobCache.clear();
  iconImageCache.clear();
  for (const url of urlCache.values()) {
    URL.revokeObjectURL(url);
  }
  urlCache.clear();
}
