import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  computeOpaqueShapeFromImage,
  getCachedOpaqueShape,
  cacheOpaqueShape,
} from '../../lib/imageOpaqueBounds';
import {
  cellRectFromOutline,
  cellRectFromTransform,
  coverImageTransform,
  defaultImageTransform,
  isDefaultImageTransform,
  nudgeCellRect,
  outlineFromCellRect,
  outlineFromOpaqueShape,
  outlineToLocalPx,
  scaleCellRectFromMidEdge,
  transformFromCellRect,
  translateCellRect,
  type MidEdge,
} from '../../lib/tokenImageFit';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import type {
  Point,
  TokenImageTransform,
  TokenOutlineStyle,
} from '../../lib/types';

const EDGES: MidEdge[] = ['n', 'e', 's', 'w'];
const HANDLE_PX = 10;
/** Center cell ≈ this fraction of editor height at max zoom (≤0.5 so a 2× cover fit stays on-screen). */
const CENTER_CELL_HEIGHT_FRAC = 0.48;
/** View zoom: 1 = starting fit; higher values zoom in. */
const VIEW_ZOOM_MIN = 1;
const VIEW_ZOOM_MAX = 4;
const VIEW_ZOOM_FACTOR = 1.12;

function pxPerCellAtZoom(
  sizeH: number,
  zoom: number,
  realPerDisplay: number,
): number {
  if (sizeH <= 0 || realPerDisplay <= 0) return 0;
  return (sizeH * CENTER_CELL_HEIGHT_FRAC * zoom) / realPerDisplay;
}

function centeredFootprintOrigin(
  size: { w: number; h: number },
  footprint: { w: number; h: number },
  px: number,
): Point {
  return {
    x: (size.w - footprint.w * px) / 2,
    y: (size.h - footprint.h * px) / 2,
  };
}

/** World (cell) AABB covered by the viewport at the starting fit zoom. */
function originalViewWorldBounds(
  size: { w: number; h: number },
  footprint: { w: number; h: number },
  realPerDisplay: number,
): { left: number; top: number; right: number; bottom: number } {
  const px = pxPerCellAtZoom(size.h, VIEW_ZOOM_MIN, realPerDisplay);
  const origin = centeredFootprintOrigin(size, footprint, px);
  return {
    left: -origin.x / px,
    top: -origin.y / px,
    right: (size.w - origin.x) / px,
    bottom: (size.h - origin.y) / px,
  };
}

/**
 * Keep the camera inside the original fit view: at min zoom pan is zero;
 * when zoomed in, the visible region cannot leave that original world AABB.
 */
function clampViewPan(
  pan: Point,
  zoom: number,
  size: { w: number; h: number },
  footprint: { w: number; h: number },
  realPerDisplay: number,
): Point {
  if (zoom <= VIEW_ZOOM_MIN + 1e-9) return { x: 0, y: 0 };
  const px = pxPerCellAtZoom(size.h, zoom, realPerDisplay);
  if (px <= 0 || size.w <= 0) return { x: 0, y: 0 };

  const base = centeredFootprintOrigin(size, footprint, px);
  const bounds = originalViewWorldBounds(size, footprint, realPerDisplay);

  // origin = base + pan; visible [ -origin/px , (size-origin)/px ] ⊆ bounds
  const originMinX = size.w - bounds.right * px;
  const originMaxX = -bounds.left * px;
  const originMinY = size.h - bounds.bottom * px;
  const originMaxY = -bounds.top * px;

  let originX = base.x + pan.x;
  let originY = base.y + pan.y;
  if (originMinX <= originMaxX) {
    originX = Math.min(originMaxX, Math.max(originMinX, originX));
  } else {
    originX = (originMinX + originMaxX) / 2;
  }
  if (originMinY <= originMaxY) {
    originY = Math.min(originMaxY, Math.max(originMinY, originY));
  } else {
    originY = (originMinY + originMaxY) / 2;
  }

  return { x: originX - base.x, y: originY - base.y };
}

type Props = {
  imageUrl: string | undefined;
  footprint: { w: number; h: number };
  imageTransform: TokenImageTransform;
  outline: TokenOutlineStyle;
  editOutline: boolean;
  maintainAspect: boolean;
  label?: string;
  onImageTransformChange: (next: TokenImageTransform) => void;
  onOutlineChange: (next: TokenOutlineStyle) => void;
  onFootprintChange: (next: { w: number; h: number }) => void;
};

function clientToLocal(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): Point {
  const rect = el.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function gcdInt(a: number, b: number): number {
  let x = Math.max(1, Math.round(Math.abs(a)));
  let y = Math.max(1, Math.round(Math.abs(b)));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return Math.max(1, x);
}

/**
 * Reduce footprint to lowest terms for display (2×2→1×1, 4×2→2×1).
 * Real cell math still uses the full footprint; this only affects editor scale.
 */
export function displayFootprintScale(footprint: { w: number; h: number }): {
  /** Real cells represented by one display cell. */
  realPerDisplay: number;
  normalized: { w: number; h: number };
} {
  const g = gcdInt(footprint.w, footprint.h);
  return {
    realPerDisplay: g,
    normalized: { w: footprint.w / g, h: footprint.h / g },
  };
}

export type ImportsGridEditorHandle = {
  focus: () => void;
  /** Applies nudge/scale shortcuts. Returns true when handled. */
  handleKeyDown: (e: {
    key: string;
    code: string;
    shiftKey: boolean;
    preventDefault: () => void;
  }) => boolean;
};

export const ImportsGridEditor = forwardRef<ImportsGridEditorHandle, Props>(
  function ImportsGridEditor(
    {
      imageUrl,
      footprint,
      imageTransform,
      outline,
      editOutline,
      maintainAspect,
      label,
      onImageTransformChange,
      onOutlineChange,
      onFootprintChange: _onFootprintChange,
    },
    ref,
  ) {
  void _onFootprintChange;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewZoom, setViewZoom] = useState(VIEW_ZOOM_MIN);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [panelFocused, setPanelFocused] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const dragRef = useRef<
    | {
        kind: 'scale';
        edge: MidEdge;
        start: { offset: Point; size: { w: number; h: number } };
        originLocal: Point;
      }
    | {
        kind: 'translate';
        start: { offset: Point; size: { w: number; h: number } };
        originLocal: Point;
      }
    | {
        kind: 'viewPan';
        startPan: Point;
        originLocal: Point;
      }
    | null
  >(null);
  const viewRef = useRef({
    viewZoom,
    viewPan,
    size,
    realPerDisplay: 1,
    footprintW: footprint.w,
    footprintH: footprint.h,
  });

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Nudge hints follow Imports panel focus (any control), not only the grid.
  useEffect(() => {
    const sync = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        setPanelFocused(
          Boolean(active?.closest?.('[data-imports-panel]')),
        );
      });
    };
    sync();
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
    };
  }, []);

  // Non-passive wheel: zoom toward cursor; never mutates imageTransform / outline.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const v = viewRef.current;
      const zoomIn = e.deltaY < 0;
      const nextZoom = Math.min(
        VIEW_ZOOM_MAX,
        Math.max(
          VIEW_ZOOM_MIN,
          zoomIn ? v.viewZoom * VIEW_ZOOM_FACTOR : v.viewZoom / VIEW_ZOOM_FACTOR,
        ),
      );
      if (Math.abs(nextZoom - v.viewZoom) < 1e-9 || v.size.h <= 0) return;

      const footprint = { w: v.footprintW, h: v.footprintH };
      const local = clientToLocal(e.clientX, e.clientY, el);
      const pxOld = pxPerCellAtZoom(v.size.h, v.viewZoom, v.realPerDisplay);
      if (pxOld <= 0) return;
      const originOld = {
        x: centeredFootprintOrigin(v.size, footprint, pxOld).x + v.viewPan.x,
        y: centeredFootprintOrigin(v.size, footprint, pxOld).y + v.viewPan.y,
      };
      const worldX = (local.x - originOld.x) / pxOld;
      const worldY = (local.y - originOld.y) / pxOld;

      const pxNew = pxPerCellAtZoom(v.size.h, nextZoom, v.realPerDisplay);
      const baseNew = centeredFootprintOrigin(v.size, footprint, pxNew);
      const nextPan = clampViewPan(
        {
          x: local.x - worldX * pxNew - baseNew.x,
          y: local.y - worldY * pxNew - baseNew.y,
        },
        nextZoom,
        v.size,
        footprint,
        v.realPerDisplay,
      );
      setViewZoom(nextZoom);
      setViewPan(nextPan);
    };
    const preventMiddleAutoscroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    el.addEventListener('mousedown', preventMiddleAutoscroll);
    el.addEventListener('auxclick', preventMiddleAutoscroll);
    return () => {
      el.removeEventListener('wheel', onWheel, { capture: true });
      el.removeEventListener('mousedown', preventMiddleAutoscroll);
      el.removeEventListener('auxclick', preventMiddleAutoscroll);
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      setImg(null);
      return;
    }
    let cancelled = false;
    const image = new window.Image();
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.onerror = () => {
      if (!cancelled) setImg(null);
    };
    image.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Stretch-to-footprint defaults distort non-square art; switch to cover (natural aspect)
  // so mid-edge scaling stays uniform and overflow into neighbor cells is visible.
  useEffect(() => {
    if (!img || img.naturalHeight <= 0 || editOutline) return;
    if (!isDefaultImageTransform(footprint, imageTransform)) return;
    const naturalAspect = img.naturalWidth / img.naturalHeight;
    const fpAspect = footprint.w / Math.max(footprint.h, 1e-6);
    if (Math.abs(naturalAspect - fpAspect) < 1e-6) return;
    onImageTransformChange(coverImageTransform(footprint, naturalAspect));
  }, [
    editOutline,
    footprint.h,
    footprint.w,
    imageTransform,
    img,
    onImageTransformChange,
  ]);

  const { realPerDisplay } = useMemo(
    () => displayFootprintScale(footprint),
    [footprint.h, footprint.w],
  );

  /** One display cell in px at the current view zoom (1 = starting fit). */
  const cellPx =
    size.h > 0 ? size.h * CENTER_CELL_HEIGHT_FRAC * viewZoom : 0;
  /** Pixels per real footprint cell. */
  const pxPerRealCell = cellPx > 0 ? cellPx / realPerDisplay : 0;

  // Footprint AABB: centered fit + view pan (MMB / zoom-to-cursor).
  const footprintPx = {
    w: footprint.w * pxPerRealCell,
    h: footprint.h * pxPerRealCell,
  };
  const originPx = {
    x: (size.w - footprintPx.w) / 2 + viewPan.x,
    y: (size.h - footprintPx.h) / 2 + viewPan.y,
  };

  viewRef.current = {
    viewZoom,
    viewPan,
    size,
    realPerDisplay,
    footprintW: footprint.w,
    footprintH: footprint.h,
  };

  // Re-clamp after resize so the camera stays inside the original fit bounds.
  useEffect(() => {
    if (size.w <= 0 || size.h <= 0) return;
    setViewPan((pan) => {
      const next = clampViewPan(pan, viewZoom, size, footprint, realPerDisplay);
      if (Math.abs(next.x - pan.x) < 1e-9 && Math.abs(next.y - pan.y) < 1e-9) {
        return pan;
      }
      return next;
    });
  }, [footprint.h, footprint.w, realPerDisplay, size.h, size.w, viewZoom]);

  // Draw enough grid to fill the viewport given the current pan/zoom.
  const gridHaloReal = useMemo(() => {
    if (pxPerRealCell <= 0) return 1;
    const minCellX = -originPx.x / pxPerRealCell;
    const maxCellX = (size.w - originPx.x) / pxPerRealCell;
    const minCellY = -originPx.y / pxPerRealCell;
    const maxCellY = (size.h - originPx.y) / pxPerRealCell;
    return (
      Math.ceil(
        Math.max(
          -minCellX,
          maxCellX - footprint.w,
          -minCellY,
          maxCellY - footprint.h,
          1,
        ),
      ) + 1
    );
  }, [
    footprint.h,
    footprint.w,
    originPx.x,
    originPx.y,
    pxPerRealCell,
    size.h,
    size.w,
  ]);

  const activeRect = editOutline
    ? cellRectFromOutline(outline)
    : cellRectFromTransform(imageTransform);

  const applyRect = useCallback(
    (rect: { offset: Point; size: { w: number; h: number } }) => {
      if (editOutline) {
        onOutlineChange(outlineFromCellRect(rect, outline.shape));
        return;
      }
      // Image transform is always relative to the fixed footprint — never grow/shrink the token slot.
      onImageTransformChange(transformFromCellRect(rect));
    },
    [editOutline, onImageTransformChange, onOutlineChange, outline.shape],
  );

  const onPointerDownHandle = (edge: MidEdge, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!rootRef.current || pxPerRealCell <= 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'scale',
      edge,
      start: { offset: { ...activeRect.offset }, size: { ...activeRect.size } },
      originLocal: clientToLocal(e.clientX, e.clientY, rootRef.current),
    };
  };

  const onPointerDownBody = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (!rootRef.current || pxPerRealCell <= 0) return;
    rootRef.current.focus();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'translate',
      start: { offset: { ...activeRect.offset }, size: { ...activeRect.size } },
      originLocal: clientToLocal(e.clientX, e.clientY, rootRef.current),
    };
  };

  const onPointerDownRoot = (e: React.PointerEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    if (!rootRef.current || pxPerRealCell <= 0) return;
    rootRef.current.focus();
    rootRef.current.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: 'viewPan',
      startPan: { ...viewPan },
      originLocal: clientToLocal(e.clientX, e.clientY, rootRef.current),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !rootRef.current || pxPerRealCell <= 0) return;
    const local = clientToLocal(e.clientX, e.clientY, rootRef.current);
    const deltaPx = {
      x: local.x - drag.originLocal.x,
      y: local.y - drag.originLocal.y,
    };
    if (drag.kind === 'viewPan') {
      setViewPan(
        clampViewPan(
          {
            x: drag.startPan.x + deltaPx.x,
            y: drag.startPan.y + deltaPx.y,
          },
          viewZoom,
          size,
          footprint,
          realPerDisplay,
        ),
      );
      return;
    }
    const deltaCells = {
      x: deltaPx.x / pxPerRealCell,
      y: deltaPx.y / pxPerRealCell,
    };
    if (drag.kind === 'scale') {
      const naturalAspect =
        !editOutline && img && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : undefined;
      applyRect(
        scaleCellRectFromMidEdge(
          drag.start,
          drag.edge,
          deltaCells,
          maintainAspect,
          maintainAspect ? naturalAspect : undefined,
        ),
      );
    } else {
      applyRect(translateCellRect(drag.start, deltaCells));
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const keyStateRef = useRef({
    pxPerRealCell,
    activeRect,
    maintainAspect,
    editOutline,
    img,
    applyRect,
  });
  keyStateRef.current = {
    pxPerRealCell,
    activeRect,
    maintainAspect,
    editOutline,
    img,
    applyRect,
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      rootRef.current?.focus({ preventScroll: true });
    },
    handleKeyDown: (e) => {
      const {
        pxPerRealCell: px,
        activeRect: rect,
        maintainAspect: aspectOn,
        editOutline: outlineMode,
        img: image,
        applyRect: apply,
      } = keyStateRef.current;
      if (px <= 0) return false;

      const pixelStepCells = 1 / px;
      const isArrow =
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';
      const isSpace = e.key === ' ' || e.code === 'Space';

      if (isArrow) {
        e.preventDefault();
        apply(
          nudgeCellRect(
            rect,
            e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
            pixelStepCells,
          ),
        );
        return true;
      }

      if (!isSpace) return false;
      e.preventDefault();

      const dir = e.shiftKey ? -1 : 1;
      if (aspectOn) {
        const naturalAspect =
          !outlineMode && image && image.naturalHeight > 0
            ? image.naturalWidth / image.naturalHeight
            : undefined;
        const edgeDelta = (dir * pixelStepCells) / 2;
        apply(
          scaleCellRectFromMidEdge(
            rect,
            'e',
            { x: edgeDelta, y: 0 },
            true,
            naturalAspect,
          ),
        );
        return true;
      }

      const half = (dir * pixelStepCells) / 2;
      apply({
        offset: {
          x: rect.offset.x - half,
          y: rect.offset.y - half,
        },
        size: {
          w: rect.size.w + dir * pixelStepCells,
          h: rect.size.h + dir * pixelStepCells,
        },
      });
      return true;
    },
  }));

  const gridLines = useMemo(() => {
    if (pxPerRealCell <= 0 || size.w <= 0) return [];
    const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    const minCol = -gridHaloReal;
    const maxCol = footprint.w + gridHaloReal;
    const minRow = -gridHaloReal;
    const maxRow = footprint.h + gridHaloReal;
    for (let c = minCol; c <= maxCol; c++) {
      const x = originPx.x + c * pxPerRealCell;
      lines.push({
        key: `v${c}`,
        x1: x,
        y1: originPx.y + minRow * pxPerRealCell,
        x2: x,
        y2: originPx.y + maxRow * pxPerRealCell,
      });
    }
    for (let r = minRow; r <= maxRow; r++) {
      const y = originPx.y + r * pxPerRealCell;
      lines.push({
        key: `h${r}`,
        x1: originPx.x + minCol * pxPerRealCell,
        y1: y,
        x2: originPx.x + maxCol * pxPerRealCell,
        y2: y,
      });
    }
    return lines;
  }, [
    footprint.h,
    footprint.w,
    gridHaloReal,
    originPx.x,
    originPx.y,
    pxPerRealCell,
    size.w,
  ]);

  const outlinePx = {
    x: originPx.x + outline.offset.x * pxPerRealCell,
    y: originPx.y + outline.offset.y * pxPerRealCell,
    w: outline.size.w * pxPerRealCell,
    h: outline.size.h * pxPerRealCell,
  };

  // Same geometry as TokenLayer (outlineToLocalPx + strokeWidth 3 in grid px).
  const gridToEditor = pxPerRealCell / GRID_SIZE_PX;
  const mapOutline = outlineToLocalPx(footprint, outline, 2);
  const outlineStrokePx = Math.max(1.5, 3 * gridToEditor);
  const outlineDraw =
    mapOutline.kind === 'circle'
      ? {
          kind: 'circle' as const,
          cx: originPx.x + mapOutline.x * gridToEditor,
          cy: originPx.y + mapOutline.y * gridToEditor,
          r: mapOutline.radius * gridToEditor,
        }
      : {
          kind: 'rect' as const,
          x: originPx.x + mapOutline.x * gridToEditor,
          y: originPx.y + mapOutline.y * gridToEditor,
          w: mapOutline.width * gridToEditor,
          h: mapOutline.height * gridToEditor,
        };

  const handleRect = editOutline
    ? cellRectFromOutline(outline)
    : cellRectFromTransform(imageTransform);

  const handlePos = (edge: MidEdge): Point => {
    const r = handleRect;
    switch (edge) {
      case 'n':
        return { x: r.offset.x + r.size.w / 2, y: r.offset.y };
      case 'e':
        return { x: r.offset.x + r.size.w, y: r.offset.y + r.size.h / 2 };
      case 's':
        return { x: r.offset.x + r.size.w / 2, y: r.offset.y + r.size.h };
      case 'w':
        return { x: r.offset.x, y: r.offset.y + r.size.h / 2 };
    }
  };

  const fadeId = 'imports-grid-fade';
  // Center footprint stays fully opaque; fade toward the viewport edge so zoom-out stays useful.
  const fadeCx = originPx.x + footprintPx.w / 2;
  const fadeCy = originPx.y + footprintPx.h / 2;
  const centerHalf = Math.max(footprintPx.w, footprintPx.h) / 2;
  const viewRadius = Math.hypot(size.w / 2, size.h / 2);
  const outerHalf = Math.max(centerHalf + Math.max(cellPx, pxPerRealCell), viewRadius);
  const centerStopPct = outerHalf > 0 ? Math.min(99, (centerHalf / outerHalf) * 100) : 0;
  const fadeOutPct = 96;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="relative h-full w-full touch-none overflow-hidden bg-slate-950 outline-none"
      onPointerDown={onPointerDownRoot}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {pxPerRealCell > 0 && (
        <>
          <svg className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <radialGradient
                id={fadeId}
                gradientUnits="userSpaceOnUse"
                cx={fadeCx}
                cy={fadeCy}
                r={outerHalf}
              >
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset={`${centerStopPct}%`} stopColor="white" stopOpacity="1" />
                <stop
                  offset={`${(centerStopPct + fadeOutPct) / 2}%`}
                  stopColor="white"
                  stopOpacity="0.5"
                />
                <stop offset={`${fadeOutPct}%`} stopColor="white" stopOpacity="0" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id={`${fadeId}-mask`}>
                <rect width="100%" height="100%" fill={`url(#${fadeId})`} />
              </mask>
            </defs>
            <g mask={`url(#${fadeId}-mask)`}>
              <rect
                x={originPx.x}
                y={originPx.y}
                width={footprintPx.w}
                height={footprintPx.h}
                fill="rgba(30, 41, 59, 0.55)"
              />
              {gridLines.map((line) => (
                <line
                  key={line.key}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="rgba(148, 163, 184, 0.55)"
                  strokeWidth={1}
                />
              ))}
              <rect
                x={originPx.x}
                y={originPx.y}
                width={footprintPx.w}
                height={footprintPx.h}
                fill="none"
                stroke="rgba(226, 232, 240, 0.45)"
                strokeWidth={1.5}
              />
            </g>
          </svg>

          {/* Outline behind the image (TokenLayer draws selection under the token art). */}
          {editOutline && (
            <svg
              className="pointer-events-none absolute inset-0 z-0 h-full w-full"
              aria-hidden
            >
              {outlineDraw.kind === 'circle' ? (
                <circle
                  cx={outlineDraw.cx}
                  cy={outlineDraw.cy}
                  r={outlineDraw.r}
                  fill="none"
                  stroke="rgb(56, 189, 248)"
                  strokeWidth={outlineStrokePx}
                />
              ) : (
                <rect
                  x={outlineDraw.x}
                  y={outlineDraw.y}
                  width={outlineDraw.w}
                  height={outlineDraw.h}
                  fill="none"
                  stroke="rgb(56, 189, 248)"
                  strokeWidth={outlineStrokePx}
                />
              )}
            </svg>
          )}

          {img ? (
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className={`absolute z-[1] max-h-none max-w-none ${editOutline ? 'pointer-events-none' : 'cursor-move'}`}
              style={{
                left: originPx.x + imageTransform.offset.x * pxPerRealCell,
                top: originPx.y + imageTransform.offset.y * pxPerRealCell,
                width: imageTransform.size.w * pxPerRealCell,
                height: imageTransform.size.h * pxPerRealCell,
                maxWidth: 'none',
                maxHeight: 'none',
                objectFit: 'fill',
              }}
              onPointerDown={editOutline ? undefined : onPointerDownBody}
            />
          ) : (
            <div
              className="absolute z-[1] flex items-center justify-center bg-slate-800/80 text-xs text-slate-500"
              style={{
                left: originPx.x,
                top: originPx.y,
                width: footprintPx.w,
                height: footprintPx.h,
              }}
            >
              No image
            </div>
          )}

          {!editOutline &&
            EDGES.map((edge) => {
              const p = handlePos(edge);
              return (
                <button
                  key={edge}
                  type="button"
                  aria-label={`Scale ${edge}`}
                  className="absolute z-10 rounded-full border-2 border-sky-300 bg-slate-950"
                  style={{
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                    left: originPx.x + p.x * pxPerRealCell - HANDLE_PX / 2,
                    top: originPx.y + p.y * pxPerRealCell - HANDLE_PX / 2,
                    cursor: edge === 'n' || edge === 's' ? 'ns-resize' : 'ew-resize',
                  }}
                  onPointerDown={(e) => onPointerDownHandle(edge, e)}
                />
              );
            })}

          {editOutline &&
            (outline.shape === 'circle' ? (
              <div
                className="absolute z-[3] cursor-move rounded-full"
                style={{
                  left: outlinePx.x,
                  top: outlinePx.y,
                  width: outlinePx.w,
                  height: outlinePx.h,
                }}
                onPointerDown={onPointerDownBody}
              />
            ) : (
              <div
                className="absolute z-[3] cursor-move"
                style={{
                  left: outlinePx.x,
                  top: outlinePx.y,
                  width: outlinePx.w,
                  height: outlinePx.h,
                }}
                onPointerDown={onPointerDownBody}
              />
            ))}

          {editOutline &&
            EDGES.map((edge) => {
              const p = handlePos(edge);
              return (
                <button
                  key={edge}
                  type="button"
                  aria-label={`Scale ${edge}`}
                  className="absolute z-10 rounded-full border-2 border-sky-300 bg-slate-950"
                  style={{
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                    left: originPx.x + p.x * pxPerRealCell - HANDLE_PX / 2,
                    top: originPx.y + p.y * pxPerRealCell - HANDLE_PX / 2,
                    cursor: edge === 'n' || edge === 's' ? 'ns-resize' : 'ew-resize',
                  }}
                  onPointerDown={(e) => onPointerDownHandle(edge, e)}
                />
              );
            })}
        </>
      )}

      <div className="pointer-events-none absolute inset-0 z-20">
        {label ? (
          <div className="absolute left-2 top-2 max-w-[70%] truncate rounded bg-slate-950/75 px-1.5 py-0.5 text-[11px] text-slate-200">
            {label}
          </div>
        ) : null}
        {panelFocused ? (
          <div className="absolute bottom-2 left-2 max-w-[75%] rounded bg-slate-950/75 px-1.5 py-0.5 text-[10px] leading-snug text-slate-300">
            <div>Arrows nudge · Space scale up · Shift+Space scale down</div>
            <div>Scroll zoom (cursor) · MMB pan</div>
          </div>
        ) : null}
        <div className="absolute bottom-2 right-2 rounded bg-slate-950/75 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-slate-200">
          {formatFootprint(imageTransform.size.w)}×
          {formatFootprint(imageTransform.size.h)} cells
        </div>
      </div>
    </div>
  );
});

function formatFootprint(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Build initial outline for an image URL + footprint. */
export function initialOutlineForImage(
  imageUrl: string | undefined,
  img: HTMLImageElement | null,
  footprint: { w: number; h: number },
): TokenOutlineStyle {
  if (imageUrl && img) {
    let shape = getCachedOpaqueShape(imageUrl);
    if (!shape) {
      try {
        shape = computeOpaqueShapeFromImage(img) ?? undefined;
        if (shape) cacheOpaqueShape(imageUrl, shape);
      } catch {
        shape = undefined;
      }
    }
    return outlineFromOpaqueShape(shape, footprint);
  }
  return outlineFromOpaqueShape(null, footprint);
}

export function initialImageTransform(footprint: {
  w: number;
  h: number;
}): TokenImageTransform {
  return defaultImageTransform(footprint);
}
