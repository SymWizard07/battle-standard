import type { DrawToolShape, MeasureKind } from '../../lib/types';

export const FOG_SHAPE_ORDER = ['stroke', 'rect', 'cone', 'sphere'] as const;
export type FogShapeId = (typeof FOG_SHAPE_ORDER)[number];

export const MEASURE_KIND_ORDER = ['line', 'cone', 'cube', 'sphere'] as const satisfies readonly MeasureKind[];

export const DRAW_SHAPE_ORDER = [
  'stroke',
  'line',
  'cone',
  'rect',
  'sphere',
  'erase',
] as const satisfies readonly DrawToolShape[];

function digitIndex(key: string, code: string, max: number): number | null {
  if (key.length === 1 && key >= '1' && key <= String(max)) return Number(key) - 1;
  const numpad = code.match(new RegExp(`^Numpad([1-${max}])$`));
  if (numpad) return Number(numpad[1]) - 1;
  return null;
}

function digitIndex4(key: string, code: string): number | null {
  return digitIndex(key, code, 4);
}

function digitIndex6(key: string, code: string): number | null {
  return digitIndex(key, code, 6);
}

export function fogShapeForKey(key: string, code: string): FogShapeId | null {
  const idx = digitIndex4(key, code);
  return idx == null ? null : (FOG_SHAPE_ORDER[idx] ?? null);
}

export function measureKindForKey(key: string, code: string): MeasureKind | null {
  const idx = digitIndex4(key, code);
  return idx == null ? null : (MEASURE_KIND_ORDER[idx] ?? null);
}

export function drawShapeForKey(key: string, code: string): DrawToolShape | null {
  const idx = digitIndex6(key, code);
  return idx == null ? null : (DRAW_SHAPE_ORDER[idx] ?? null);
}
