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

export const DRAW_OUTLINE_SLIDER_CENTER = 50;
export const DRAW_OUTLINE_CENTER_SNAP_THRESHOLD = 4;

/** Snap stops across the full bar (0 = min, center = default, max divisions = max width). */
export const DRAW_OUTLINE_SLIDER_DIVISIONS =
  (DRAW_STROKE_WIDTH_DEFAULT - DRAW_STROKE_WIDTH_MIN) * 2;

export function outlineSliderIndexFromPosition(slider: number): number {
  const pos = Math.max(0, Math.min(100, slider));
  return Math.round((pos / 100) * DRAW_OUTLINE_SLIDER_DIVISIONS);
}

export function outlineSliderPositionFromIndex(index: number): number {
  const clamped = Math.max(0, Math.min(DRAW_OUTLINE_SLIDER_DIVISIONS, index));
  return (clamped / DRAW_OUTLINE_SLIDER_DIVISIONS) * 100;
}

export function snapOutlineSliderPosition(slider: number): number {
  return outlineSliderPositionFromIndex(outlineSliderIndexFromPosition(slider));
}

/** Map stroke width to slider position (0–100); default sits at center. */
export function drawStrokeWidthToSlider(width: number): number {
  const value = clampDrawStrokeWidth(width);
  const def = DRAW_STROKE_WIDTH_DEFAULT;
  let pos: number;
  if (value <= def) {
    if (def <= DRAW_STROKE_WIDTH_MIN) {
      pos = DRAW_OUTLINE_SLIDER_CENTER;
    } else {
      pos = ((value - DRAW_STROKE_WIDTH_MIN) / (def - DRAW_STROKE_WIDTH_MIN)) * 50;
    }
  } else if (DRAW_STROKE_WIDTH_MAX <= def) {
    pos = DRAW_OUTLINE_SLIDER_CENTER;
  } else {
    pos = 50 + ((value - def) / (DRAW_STROKE_WIDTH_MAX - def)) * 50;
  }
  return snapOutlineSliderPosition(pos);
}

/** Map slider position (0–100) back to stroke width. */
export function sliderToDrawStrokeWidth(slider: number): number {
  const pos = snapOutlineSliderPosition(slider);
  const def = DRAW_STROKE_WIDTH_DEFAULT;
  if (pos <= 50) {
    if (def <= DRAW_STROKE_WIDTH_MIN) return def;
    return clampDrawStrokeWidth(
      DRAW_STROKE_WIDTH_MIN + (pos / 50) * (def - DRAW_STROKE_WIDTH_MIN),
    );
  }
  if (DRAW_STROKE_WIDTH_MAX <= def) return def;
  return clampDrawStrokeWidth(
    def + ((pos - 50) / 50) * (DRAW_STROKE_WIDTH_MAX - def),
  );
}

/** After release: snap to default only when the thumb is near center. */
export function drawStrokeWidthFromSliderRelease(slider: number): number {
  const pos = snapOutlineSliderPosition(slider);
  if (Math.abs(pos - DRAW_OUTLINE_SLIDER_CENTER) <= DRAW_OUTLINE_CENTER_SNAP_THRESHOLD) {
    return DRAW_STROKE_WIDTH_DEFAULT;
  }
  return sliderToDrawStrokeWidth(pos);
}

export function drawStrokeWidthKeyboardDelta(
  e: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): number | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const steps = e.shiftKey ? 2 : 1;
  if (e.code === 'Equal' || e.code === 'NumpadAdd') return steps;
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') return -steps;
  return null;
}

export function stepDrawStrokeWidth(width: number, indexDelta: number): number {
  const index = outlineSliderIndexFromPosition(drawStrokeWidthToSlider(width));
  const next = Math.max(
    0,
    Math.min(DRAW_OUTLINE_SLIDER_DIVISIONS, index + indexDelta),
  );
  return sliderToDrawStrokeWidth(outlineSliderPositionFromIndex(next));
}

/** Draw tool hotkeys work on the map; outline slider is allowed so +/- still adjust width. */
export function allowDrawToolKeyboardShortcut(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return true;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea' || el.isContentEditable) return false;
  if (tag === 'input') {
    const input = el as HTMLInputElement;
    return input.type === 'range' && input.classList.contains('draw-outline-slider');
  }
  return true;
}
