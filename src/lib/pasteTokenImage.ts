import { GRID_SIZE_PX, getGridOffset } from './fixedGrid';
import { screenToWorld } from './grid';
import type { GridCell, Point } from './types';

const MAX_FOOTPRINT_CELLS = 4;
/** min/max dimension ratio above which an image counts as square. */
const SQUARE_ASPECT_TOLERANCE = 0.85;

export function readClipboardImage(data: DataTransfer): File | null {
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** Grid footprint that fits the image aspect ratio within maxCells on the long side. */
export function footprintForImagePixels(
  width: number,
  height: number,
  maxCells = MAX_FOOTPRINT_CELLS,
): { w: number; h: number } {
  if (width <= 0 || height <= 0) return { w: 1, h: 1 };

  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (short / long >= SQUARE_ASPECT_TOLERANCE) {
    return { w: 1, h: 1 };
  }

  const scale = (maxCells * GRID_SIZE_PX) / long;
  const wPx = width * scale;
  const hPx = height * scale;
  return {
    w: Math.max(1, Math.min(maxCells, Math.round(wPx / GRID_SIZE_PX))),
    h: Math.max(1, Math.min(maxCells, Math.round(hPx / GRID_SIZE_PX))),
  };
}

export async function loadBlobImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function gridPosForTokenCenteredAtScreen(
  screen: Point,
  stagePos: Point,
  scale: number,
  footprint: { w: number; h: number },
  gridOffset = getGridOffset(),
): GridCell {
  const world = screenToWorld(screen, stagePos, scale);
  return {
    col: Math.round((world.x - gridOffset.x) / GRID_SIZE_PX - footprint.w / 2),
    row: Math.round((world.y - gridOffset.y) / GRID_SIZE_PX - footprint.h / 2),
  };
}

export function defaultPasteScreenPoint(container: HTMLElement | null): Point {
  if (!container) return { x: 0, y: 0 };
  const rect = container.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}
