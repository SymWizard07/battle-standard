import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DrawStroke, Point } from '../lib/types';
import {
  drawStrokesGroupBounds,
  rotateDrawStrokes,
  scaleDrawStrokesFromCorner,
  shiftDrawStrokes,
  snapshotDrawStrokesForEdit,
  type StrokeBounds,
} from '../lib/drawShapes';
import type { MapCorner } from '../lib/mapGeometry';
import {
  rotationDegreesFromPointerDrag,
  rotatedRectBoxStyleScreen,
  rotatedRectCenterScreen,
  rotatedRectCornersScreen,
  rotatedRectHandleArmLengthScreen,
  rotatedRectRotationHandleScreen,
} from '../lib/rotationHandle';
import { DEFAULT_GRID_OFFSET } from '../lib/fixedGrid';
import { snapWorldPointWithStrength } from '../lib/gridSnap';
import { useStore } from '../store/useStore';
import { RotationHandleControl } from './RotationHandleControl';

const HANDLE_PX = 10;
const TRASH_PX = 28;
const CORNERS: MapCorner[] = ['nw', 'ne', 'se', 'sw'];

type Props = {
  strokes: DrawStroke[];
  stagePos: { x: number; y: number };
  viewScale: number;
  gridOffset?: Point;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onBringToFront: () => void;
  onUpdateAll: (next: DrawStroke[]) => void;
  onDelete: () => void;
};

type DragMode = { kind: 'move' } | { kind: 'resize'; corner: MapCorner } | { kind: 'rotate' };

function clientToLocal(clientX: number, clientY: number, container: HTMLDivElement) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function boundsFromCenter(center: Point, width: number, height: number): StrokeBounds {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

function boundsCenter(bounds: StrokeBounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function syncMarqueeFrameFromBounds(
  bounds: StrokeBounds,
  centerRef: React.MutableRefObject<Point>,
  sizeRef: React.MutableRefObject<{ width: number; height: number }>,
) {
  centerRef.current = boundsCenter(bounds);
  sizeRef.current = { width: bounds.width, height: bounds.height };
}

export function DrawStrokeEditOverlay({
  strokes,
  stagePos,
  viewScale,
  gridOffset = DEFAULT_GRID_OFFSET,
  containerRef,
  onBringToFront,
  onUpdateAll,
  onDelete,
}: Props) {
  const selectSnap = useStore((s) => s.selectSnap);
  const setDrawStrokeDragPreview = useStore((s) => s.setDrawStrokeDragPreview);
  const dragPreview = useStore((s) => s.drawStrokeDragPreview);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const stagePosRef = useRef(stagePos);
  stagePosRef.current = stagePos;
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;
  const onUpdateAllRef = useRef(onUpdateAll);
  onUpdateAllRef.current = onUpdateAll;

  const applyDragPreview = useCallback(
    (next: DrawStroke[]) => {
      setDrawStrokeDragPreview(next);
    },
    [setDrawStrokeDragPreview],
  );

  const selectionKey = strokes.map((s) => s.id).join(',');
  const marqueeCenterRef = useRef<Point>({ x: 0, y: 0 });
  const marqueeSizeRef = useRef({ width: 0, height: 0 });
  const rotateBaseStrokesRef = useRef<DrawStroke[] | null>(null);
  const [marqueeRotationDeg, setMarqueeRotationDeg] = useState(0);
  const armLengthPxRef = useRef(48);

  const boundsStartRef = useRef<StrokeBounds | null>(null);
  const dragModeRef = useRef<DragMode | null>(null);
  const moveStartRef = useRef<{
    clientX: number;
    clientY: number;
    strokes: DrawStroke[];
    center: Point;
  } | null>(null);
  const rotateStartRef = useRef<{
    pointer: { x: number; y: number };
    rotationDeg: number;
    centerScreen: { x: number; y: number };
    armLengthPx: number;
    pivotWorld: Point;
  } | null>(null);
  const windowDragPointerIdRef = useRef<number | null>(null);
  const onWindowPointerMoveRef = useRef<(e: PointerEvent) => void>(() => undefined);
  const onWindowPointerUpRef = useRef<(e: PointerEvent) => void>(() => undefined);

  const clearWindowDragListeners = useCallback(() => {
    window.removeEventListener('pointermove', onWindowPointerMoveRef.current);
    window.removeEventListener('pointerup', onWindowPointerUpRef.current);
    window.removeEventListener('pointercancel', onWindowPointerUpRef.current);
    windowDragPointerIdRef.current = null;
  }, []);

  const marqueeBounds = useCallback((): StrokeBounds => {
    const size = marqueeSizeRef.current;
    return boundsFromCenter(marqueeCenterRef.current, size.width, size.height);
  }, []);

  useLayoutEffect(() => {
    const b = drawStrokesGroupBounds(strokes);
    if (b) {
      syncMarqueeFrameFromBounds(b, marqueeCenterRef, marqueeSizeRef);
      armLengthPxRef.current = rotatedRectHandleArmLengthScreen(b, 0, stagePos, viewScale);
    }
    rotateBaseStrokesRef.current = snapshotDrawStrokesForEdit(strokes);
    setMarqueeRotationDeg(0);
    // Reset only when the selected stroke set changes, not on every geometry edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  // Keep marquee aligned when strokes change externally (e.g. keyboard nudge).
  useLayoutEffect(() => {
    if (dragModeRef.current) return;
    if (marqueeRotationDeg !== 0) return;
    const b = drawStrokesGroupBounds(strokes);
    if (!b) return;
    syncMarqueeFrameFromBounds(b, marqueeCenterRef, marqueeSizeRef);
  }, [strokes, marqueeRotationDeg]);

  const endDrag = useCallback(() => {
    const mode = dragModeRef.current;
    const wasResize = mode?.kind === 'resize';
    const wasRotate = mode?.kind === 'rotate';
    const wasMove = mode?.kind === 'move';
    dragModeRef.current = null;
    moveStartRef.current = null;
    boundsStartRef.current = null;
    rotateStartRef.current = null;
    clearWindowDragListeners();

    const preview = useStore.getState().drawStrokeDragPreview;
    if (preview && (wasMove || wasResize || wasRotate)) {
      onUpdateAllRef.current(preview);
    }
    setDrawStrokeDragPreview(null);

    const committed = preview ?? strokesRef.current;

    if (wasRotate || wasMove) {
      rotateBaseStrokesRef.current = snapshotDrawStrokesForEdit(committed);
    }

    if (wasResize) {
      const nextBounds = drawStrokesGroupBounds(committed);
      if (nextBounds) {
        syncMarqueeFrameFromBounds(nextBounds, marqueeCenterRef, marqueeSizeRef);
        setMarqueeRotationDeg(0);
        armLengthPxRef.current = rotatedRectHandleArmLengthScreen(
          nextBounds,
          0,
          stagePosRef.current,
          viewScaleRef.current,
        );
        rotateBaseStrokesRef.current = snapshotDrawStrokesForEdit(committed);
      }
    }

  }, [clearWindowDragListeners, setDrawStrokeDragPreview]);

  const processPointerDrag = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      const container = containerRef.current;
      if (!container) return;

      const mode = dragModeRef.current;
      if (!mode) return;

      if (mode.kind === 'rotate') {
        const start = rotateStartRef.current;
        const base = rotateBaseStrokesRef.current;
        if (!start || !base) return;

        const pointer = clientToLocal(clientX, clientY, container);
        const targetRotationDeg = rotationDegreesFromPointerDrag(
          start.centerScreen,
          pointer,
          start.pointer,
          start.rotationDeg,
          start.armLengthPx,
          shiftKey,
        );
        const deltaRad = ((targetRotationDeg - start.rotationDeg) * Math.PI) / 180;
        const next = rotateDrawStrokes(base, start.pivotWorld, deltaRad);
        applyDragPreview(next);
        setMarqueeRotationDeg(targetRotationDeg);
        armLengthPxRef.current = rotatedRectRotationHandleScreen(
          marqueeBounds(),
          targetRotationDeg,
          stagePosRef.current,
          viewScaleRef.current,
        ).armLengthPx;
        return;
      }

      if (mode.kind === 'move') {
        const start = moveStartRef.current;
        if (!start) return;
        const startLocal = clientToLocal(start.clientX, start.clientY, container);
        const currentLocal = clientToLocal(clientX, clientY, container);
        const scale = viewScaleRef.current;
        const dx = (currentLocal.x - startLocal.x) / scale;
        const dy = (currentLocal.y - startLocal.y) / scale;
        const targetCenter = { x: start.center.x + dx, y: start.center.y + dy };
        const snappedCenter = snapWorldPointWithStrength(
          targetCenter,
          selectSnap,
          gridOffset,
        );
        const snapDx = snappedCenter.x - start.center.x;
        const snapDy = snappedCenter.y - start.center.y;
        applyDragPreview(shiftDrawStrokes(start.strokes, { x: snapDx, y: snapDy }));
        marqueeCenterRef.current = snappedCenter;
        return;
      }

      const startBounds = boundsStartRef.current;
      if (!startBounds) return;
      const local = clientToLocal(clientX, clientY, container);
      const world = snapWorldPointWithStrength(
        {
          x: (local.x - stagePosRef.current.x) / viewScaleRef.current,
          y: (local.y - stagePosRef.current.y) / viewScaleRef.current,
        },
        selectSnap,
        gridOffset,
      );
      const base = moveStartRef.current?.strokes ?? strokesRef.current;
      const scaled = scaleDrawStrokesFromCorner(base, mode.corner, world, startBounds, gridOffset);
      applyDragPreview(scaled);

      const liveBounds = drawStrokesGroupBounds(scaled);
      if (liveBounds) {
        syncMarqueeFrameFromBounds(liveBounds, marqueeCenterRef, marqueeSizeRef);
      }
    },
    [applyDragPreview, containerRef, gridOffset, selectSnap],
  );

  const stopWindowDrag = useCallback(() => {
    endDrag();
  }, [endDrag]);

  const onWindowPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== windowDragPointerIdRef.current) return;
      if (!(e.buttons & 1)) {
        stopWindowDrag();
        return;
      }
      processPointerDrag(e.clientX, e.clientY, e.shiftKey);
    },
    [processPointerDrag, stopWindowDrag],
  );

  const onWindowPointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== windowDragPointerIdRef.current) return;
      stopWindowDrag();
    },
    [stopWindowDrag],
  );

  onWindowPointerMoveRef.current = onWindowPointerMove;
  onWindowPointerUpRef.current = onWindowPointerUp;

  useEffect(
    () => () => {
      clearWindowDragListeners();
    },
    [clearWindowDragListeners],
  );

  const strokeBounds = drawStrokesGroupBounds(strokes);
  const previewBounds = dragPreview ? drawStrokesGroupBounds(dragPreview) : null;
  const sessionBounds =
    dragModeRef.current?.kind === 'rotate'
      ? marqueeBounds()
      : previewBounds ??
        (dragModeRef.current != null
          ? marqueeBounds()
          : marqueeRotationDeg !== 0
            ? marqueeBounds()
            : strokeBounds ?? marqueeBounds());
  if (sessionBounds.width <= 0 || sessionBounds.height <= 0) return null;

  const boxStyle = rotatedRectBoxStyleScreen(
    sessionBounds,
    marqueeRotationDeg,
    stagePos,
    viewScale,
  );
  const screenW = sessionBounds.width * viewScale;
  const screenH = sessionBounds.height * viewScale;

  const cornerScreens = rotatedRectCornersScreen(
    sessionBounds,
    marqueeRotationDeg,
    stagePos,
    viewScale,
  );
  const { attachScreen, handleScreen: rotateHandleScreen, armLengthPx } =
    rotatedRectRotationHandleScreen(sessionBounds, marqueeRotationDeg, stagePos, viewScale);
  armLengthPxRef.current = armLengthPx;
  const deleteAnchor = cornerScreens.ne;

  const startWindowDrag = (e: React.PointerEvent) => {
    clearWindowDragListeners();
    e.preventDefault();
    e.stopPropagation();
    windowDragPointerIdRef.current = e.pointerId;
    window.addEventListener('pointermove', onWindowPointerMoveRef.current);
    window.addEventListener('pointerup', onWindowPointerUpRef.current);
    window.addEventListener('pointercancel', onWindowPointerUpRef.current);
  };

  const resetDragState = () => {
    clearWindowDragListeners();
    dragModeRef.current = null;
    moveStartRef.current = null;
    boundsStartRef.current = null;
    rotateStartRef.current = null;
  };

  const onBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onBringToFront();
    resetDragState();

    dragModeRef.current = { kind: 'move' };
    moveStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      strokes: snapshotDrawStrokesForEdit(strokesRef.current),
      center: { ...marqueeCenterRef.current },
    };
    startWindowDrag(e);
  };

  const onHandlePointerDown = (corner: MapCorner, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onBringToFront();
    resetDragState();

    const startBounds = drawStrokesGroupBounds(strokesRef.current);
    if (!startBounds) return;

    dragModeRef.current = { kind: 'resize', corner };
    boundsStartRef.current = startBounds;
    moveStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      strokes: snapshotDrawStrokesForEdit(strokesRef.current),
      center: { ...marqueeCenterRef.current },
    };
    startWindowDrag(e);
  };

  const onRotateHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onBringToFront();
    resetDragState();

    const container = containerRef.current;
    if (!container) return;

    rotateBaseStrokesRef.current = snapshotDrawStrokesForEdit(strokesRef.current);

    const frame = marqueeBounds();
    const cs = rotatedRectCenterScreen(frame, stagePosRef.current, viewScaleRef.current);
    const arm = rotatedRectRotationHandleScreen(
      frame,
      marqueeRotationDeg,
      stagePosRef.current,
      viewScaleRef.current,
    ).armLengthPx;
    armLengthPxRef.current = arm;

    dragModeRef.current = { kind: 'rotate' };
    rotateStartRef.current = {
      pointer: clientToLocal(e.clientX, e.clientY, container),
      rotationDeg: marqueeRotationDeg,
      centerScreen: cs,
      armLengthPx: arm,
      pivotWorld: { ...marqueeCenterRef.current },
    };
    startWindowDrag(e);
  };

  if (screenW < 2 || screenH < 2) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="pointer-events-auto absolute touch-none cursor-move"
        style={{ ...boxStyle, zIndex: 10 }}
        onPointerDown={onBodyPointerDown}
      />
      <div
        className="pointer-events-none absolute border-2 border-sky-400/90"
        style={{ ...boxStyle, zIndex: 11 }}
      />
      {CORNERS.map((corner) => {
        const screen = cornerScreens[corner];
        return (
          <div
            key={corner}
            className="pointer-events-auto absolute touch-none rounded-sm border-2 border-white bg-sky-500 shadow-md"
            style={{
              left: screen.x,
              top: screen.y,
              width: HANDLE_PX,
              height: HANDLE_PX,
              transform: 'translate(-50%, -50%)',
              cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              zIndex: 12,
            }}
            onPointerDown={(e) => onHandlePointerDown(corner, e)}
          />
        );
      })}
      <div className="absolute inset-0" style={{ zIndex: 30 }}>
        <RotationHandleControl
          attachPoint={attachScreen}
          handlePoint={rotateHandleScreen}
          onPointerDown={onRotateHandlePointerDown}
        />
      </div>
      <button
        type="button"
        className="pointer-events-auto absolute flex touch-none items-center justify-center rounded-md border border-red-300/80 bg-red-600/95 text-white shadow-md hover:bg-red-500"
        style={{
          left: deleteAnchor.x,
          top: deleteAnchor.y,
          width: TRASH_PX,
          height: TRASH_PX,
          transform: 'translate(25%, -125%)',
          zIndex: 12,
        }}
        title="Delete selection"
        aria-label="Delete selection"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      </button>
    </div>
  );
}
