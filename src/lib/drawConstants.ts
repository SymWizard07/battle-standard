export const DRAW_STROKE_WIDTH_MIN = 1;
export const DRAW_STROKE_WIDTH_MAX = 48;
export const DRAW_STROKE_WIDTH_DEFAULT = 4;

/** Eraser cursor radius in screen pixels (constant regardless of zoom). */
export const ERASER_RADIUS_SCREEN_PX = 14;

export function clampDrawStrokeWidth(width: number): number {
  return Math.max(
    DRAW_STROKE_WIDTH_MIN,
    Math.min(DRAW_STROKE_WIDTH_MAX, Math.round(width)),
  );
}
