export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function normalizeRect(a: Rect): Rect {
  const x2 = a.x + a.w;
  const y2 = a.y + a.h;
  const x = Math.min(a.x, x2);
  const y = Math.min(a.y, y2);
  return { x, y, w: Math.abs(a.w), h: Math.abs(a.h) };
}

export function rectIntersects(a: Rect, b: Rect, pad = 0): boolean {
  const A = normalizeRect(a);
  const B = normalizeRect(b);
  return !(
    A.x + A.w < B.x - pad ||
    B.x + B.w < A.x - pad ||
    A.y + A.h < B.y - pad ||
    B.y + B.h < A.y - pad
  );
}

export function rectUnion(a: Rect, b: Rect): Rect {
  const A = normalizeRect(a);
  const B = normalizeRect(b);
  const x1 = Math.min(A.x, B.x);
  const y1 = Math.min(A.y, B.y);
  const x2 = Math.max(A.x + A.w, B.x + B.w);
  const y2 = Math.max(A.y + A.h, B.y + B.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Subtract b from a. Returns 0-4 rectangles. */
export function rectSubtract(a: Rect, b: Rect): Rect[] {
  const A = normalizeRect(a);
  const B = normalizeRect(b);
  if (!rectIntersects(A, B)) return [A];

  const ax1 = A.x;
  const ay1 = A.y;
  const ax2 = A.x + A.w;
  const ay2 = A.y + A.h;
  const bx1 = Math.max(B.x, ax1);
  const by1 = Math.max(B.y, ay1);
  const bx2 = Math.min(B.x + B.w, ax2);
  const by2 = Math.min(B.y + B.h, ay2);

  // b fully covers a
  if (bx1 <= ax1 && by1 <= ay1 && bx2 >= ax2 && by2 >= ay2) return [];

  const out: Rect[] = [];

  // top
  if (by1 > ay1) out.push({ x: ax1, y: ay1, w: ax2 - ax1, h: by1 - ay1 });
  // bottom
  if (by2 < ay2) out.push({ x: ax1, y: by2, w: ax2 - ax1, h: ay2 - by2 });
  // left
  if (bx1 > ax1) out.push({ x: ax1, y: by1, w: bx1 - ax1, h: by2 - by1 });
  // right
  if (bx2 < ax2) out.push({ x: bx2, y: by1, w: ax2 - bx2, h: by2 - by1 });

  return out.filter((r) => r.w > 0.5 && r.h > 0.5);
}

/** Merge overlapping/touching rects. */
export function mergeRects(rects: Rect[], pad = 0): Rect[] {
  const work = rects.map(normalizeRect);
  const out: Rect[] = [];

  while (work.length) {
    let cur = work.pop()!;
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = work.length - 1; i >= 0; i--) {
        if (rectIntersects(cur, work[i], pad)) {
          cur = rectUnion(cur, work[i]);
          work.splice(i, 1);
          merged = true;
        }
      }
    }
    out.push(cur);
  }

  return out;
}

