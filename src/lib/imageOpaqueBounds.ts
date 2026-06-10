/** Axis-aligned bounds of opaque pixels, normalized 0–1 within the image. */
export type NormalizedOpaqueBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageOpaqueShape =
  | { kind: 'rect'; bounds: NormalizedOpaqueBounds }
  | {
      kind: 'circle';
      bounds: NormalizedOpaqueBounds;
      centerX: number;
      centerY: number;
      /** Radius as a fraction of min(source width, source height). */
      radius: number;
    };

const shapeCache = new Map<string, ImageOpaqueShape>();

const CIRCLE_ASPECT_TOLERANCE = 0.82;
/** Sample pixels inside fitted circle vs total opaque pixels. */
const CIRCLE_FILL_MIN = 0.58;

export function getCachedOpaqueShape(url: string): ImageOpaqueShape | undefined {
  return shapeCache.get(url);
}

export function cacheOpaqueShape(url: string, shape: ImageOpaqueShape): void {
  shapeCache.set(url, shape);
}

export function computeOpaqueShapeFromImage(
  img: HTMLImageElement,
  alphaThreshold = 8,
  maxSample = 512,
): ImageOpaqueShape | null {
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW <= 0 || srcH <= 0) return null;

  const sampleScale = Math.min(1, maxSample / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * sampleScale));
  const h = Math.max(1, Math.round(srcH * sampleScale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]!;
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (maxX < 0 || count === 0) return null;

  const bounds: NormalizedOpaqueBounds = {
    x: minX / w,
    y: minY / h,
    width: (maxX - minX + 1) / w,
    height: (maxY - minY + 1) / h,
  };

  const centerSampleX = sumX / count;
  const centerSampleY = sumY / count;
  const centerX = centerSampleX / w;
  const centerY = centerSampleY / h;

  let maxRadiusSample = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3]!;
      if (alpha > alphaThreshold) {
        const dist = Math.hypot(x - centerSampleX, y - centerSampleY);
        if (dist > maxRadiusSample) maxRadiusSample = dist;
      }
    }
  }

  const boundsAspect = bounds.width / bounds.height;
  const isSquareish =
    boundsAspect >= CIRCLE_ASPECT_TOLERANCE &&
    boundsAspect <= 1 / CIRCLE_ASPECT_TOLERANCE;
  const circleArea = Math.PI * maxRadiusSample * maxRadiusSample;
  const fillRatio = circleArea > 0 ? count / circleArea : 0;

  const srcMin = Math.min(srcW, srcH);
  const maxRadiusSrc = maxRadiusSample / sampleScale;

  if (isSquareish && fillRatio >= CIRCLE_FILL_MIN) {
    return {
      kind: 'circle',
      bounds,
      centerX,
      centerY,
      radius: maxRadiusSrc / srcMin,
    };
  }

  return { kind: 'rect', bounds };
}

export function selectionRectFromOpaqueBounds(
  bounds: NormalizedOpaqueBounds | null | undefined,
  displayW: number,
  displayH: number,
  pad = 4,
): { x: number; y: number; width: number; height: number } {
  const rect = bounds
    ? {
        x: bounds.x * displayW - pad,
        y: bounds.y * displayH - pad,
        width: bounds.width * displayW + pad * 2,
        height: bounds.height * displayH + pad * 2,
      }
    : { x: -pad, y: -pad, width: displayW + pad * 2, height: displayH + pad * 2 };

  if (
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return { x: -pad, y: -pad, width: displayW + pad * 2, height: displayH + pad * 2 };
  }
  return rect;
}

export function selectionCircleFromOpaqueShape(
  shape: ImageOpaqueShape | null | undefined,
  displayW: number,
  displayH: number,
  pad = 2,
): { x: number; y: number; radius: number } | null {
  if (!shape || shape.kind !== 'circle') return null;
  const scale = Math.min(displayW, displayH);
  const radius = shape.radius * scale + pad;
  if (!Number.isFinite(radius) || radius <= 0) return null;
  return {
    x: shape.centerX * displayW,
    y: shape.centerY * displayH,
    radius,
  };
}
