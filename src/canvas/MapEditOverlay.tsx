import { useCallback, useEffect, useRef } from 'react';
import type { MapTransform } from '../lib/types';
import {
  mapControlAnchorsScreen,
  mapCornerWorldPoints,
  resizeMapFromCorner,
  rotateMapTransformTo,
  worldToScreen,
  type MapCorner,
} from '../lib/mapGeometry';
import {
  ROTATE_HANDLE_ARM_EXTRA_PX,
  mapRotationHandleScreen,
  rotationDegreesFromPointerDrag,
} from '../lib/rotationHandle';
import { useMapImage } from './hooks/useMapImage';
import { RotationHandleControl } from './RotationHandleControl';

const HANDLE_PX = 10;
const TRASH_PX = 28;
const CORNERS: MapCorner[] = ['nw', 'ne', 'se', 'sw'];

type Props = {
  mapUrl?: string;
  mapTransform: MapTransform;
  imageWidth?: number;
  imageHeight?: number;
  selected: boolean;
  stagePos: { x: number; y: number };
  viewScale: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onBringToFront: () => void;
  onTransform: (next: MapTransform) => void;
  onEditEnd?: () => void;
  onDelete: () => void;
};

type DragMode = { kind: 'move' } | { kind: 'resize'; corner: MapCorner } | { kind: 'rotate' };

function clientToLocal(clientX: number, clientY: number, container: HTMLDivElement) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function MapEditOverlay({
  mapUrl,
  mapTransform,
  imageWidth: imageWidthProp,
  imageHeight: imageHeightProp,
  selected,
  stagePos,
  viewScale,
  containerRef,
  onSelect,
  onBringToFront,
  onTransform,
  onEditEnd,
  onDelete,
}: Props) {
  const image = useMapImage(mapUrl);
  const mapTransformRef = useRef(mapTransform);
  mapTransformRef.current = mapTransform;

  const stagePosRef = useRef(stagePos);
  stagePosRef.current = stagePos;
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;
  const onTransformRef = useRef(onTransform);
  onTransformRef.current = onTransform;
  const onEditEndRef = useRef(onEditEnd);
  onEditEndRef.current = onEditEnd;

  const imageWidthRef = useRef(imageWidthProp ?? 800);
  const imageHeightRef = useRef(imageHeightProp ?? 600);

  const dragModeRef = useRef<DragMode | null>(null);
  const moveStartRef = useRef<{
    clientX: number;
    clientY: number;
    transform: MapTransform;
  } | null>(null);
  const rotateStartRef = useRef<{
    pointer: { x: number; y: number };
    transform: MapTransform;
    rotationDeg: number;
    centerScreen: { x: number; y: number };
    armLengthPx: number;
  } | null>(null);
  const resizeStartTransformRef = useRef<MapTransform | null>(null);
  const windowDragPointerIdRef = useRef<number | null>(null);
  const onWindowPointerMoveRef = useRef<(e: PointerEvent) => void>(() => undefined);
  const onWindowPointerUpRef = useRef<(e: PointerEvent) => void>(() => undefined);

  const imageWidth = image?.naturalWidth ?? imageWidthProp ?? 800;
  const imageHeight = image?.naturalHeight ?? imageHeightProp ?? 600;
  imageWidthRef.current = imageWidth;
  imageHeightRef.current = imageHeight;

  const corners = mapCornerWorldPoints(mapTransform, imageWidth, imageHeight);
  const nwScreen = worldToScreen(corners.nw, stagePos, viewScale);
  const screenW = imageWidth * mapTransform.scale * viewScale;
  const screenH = imageHeight * mapTransform.scale * viewScale;
  const rotatedBoxStyle = {
    left: nwScreen.x,
    top: nwScreen.y,
    width: screenW,
    height: screenH,
    transform: `rotate(${mapTransform.rotation}deg)`,
    transformOrigin: '0 0',
  };

  const { attachScreen, handleScreen: rotateHandleScreen } = mapRotationHandleScreen(
    mapTransform,
    imageWidth,
    imageHeight,
    stagePos,
    viewScale,
    ROTATE_HANDLE_ARM_EXTRA_PX,
  );

  const controlAnchors = mapControlAnchorsScreen(
    mapTransform,
    imageWidth,
    imageHeight,
    stagePos,
    viewScale,
  );

  const clearWindowDragListeners = useCallback(() => {
    window.removeEventListener('pointermove', onWindowPointerMoveRef.current);
    window.removeEventListener('pointerup', onWindowPointerUpRef.current);
    window.removeEventListener('pointercancel', onWindowPointerUpRef.current);
    windowDragPointerIdRef.current = null;
  }, []);

  const endDrag = useCallback(
    (invokeEditEnd: boolean) => {
      const hadDrag = dragModeRef.current != null;
      dragModeRef.current = null;
      moveStartRef.current = null;
      rotateStartRef.current = null;
      resizeStartTransformRef.current = null;
      clearWindowDragListeners();

      if (invokeEditEnd && hadDrag) {
        onEditEndRef.current?.();
      }
    },
    [clearWindowDragListeners],
  );

  const processPointerDrag = useCallback(
    (clientX: number, clientY: number, shiftKey: boolean) => {
      const container = containerRef.current;
      if (!container) return;

      const mode = dragModeRef.current;
      if (!mode) return;

      const imageW = imageWidthRef.current;
      const imageH = imageHeightRef.current;
      const scale = viewScaleRef.current;
      const stage = stagePosRef.current;

      if (mode.kind === 'rotate') {
        const start = rotateStartRef.current;
        if (!start) return;

        const pointer = clientToLocal(clientX, clientY, container);
        const rotationDeg = rotationDegreesFromPointerDrag(
          start.centerScreen,
          pointer,
          start.pointer,
          start.rotationDeg,
          start.armLengthPx,
          shiftKey,
        );
        const next = rotateMapTransformTo(
          start.transform,
          imageW,
          imageH,
          rotationDeg,
        );
        mapTransformRef.current = next;
        onTransformRef.current(next);
        return;
      }

      if (mode.kind === 'move') {
        const start = moveStartRef.current;
        if (!start) return;
        const startLocal = clientToLocal(start.clientX, start.clientY, container);
        const currentLocal = clientToLocal(clientX, clientY, container);
        const dx = (currentLocal.x - startLocal.x) / scale;
        const dy = (currentLocal.y - startLocal.y) / scale;
        const next = {
          ...start.transform,
          x: start.transform.x + dx,
          y: start.transform.y + dy,
        };
        mapTransformRef.current = next;
        onTransformRef.current(next);
        return;
      }

      const resizeBase = resizeStartTransformRef.current ?? mapTransformRef.current;
      const local = clientToLocal(clientX, clientY, container);
      const world = {
        x: (local.x - stage.x) / scale,
        y: (local.y - stage.y) / scale,
      };
      const next = resizeMapFromCorner(
        mode.corner,
        world,
        resizeBase,
        imageW,
        imageH,
      );
      mapTransformRef.current = next;
      onTransformRef.current(next);
    },
    [containerRef],
  );

  const stopWindowDrag = useCallback(
    (invokeEditEnd: boolean) => {
      endDrag(invokeEditEnd);
    },
    [endDrag],
  );

  const onWindowPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== windowDragPointerIdRef.current) return;
      if (!(e.buttons & 1)) {
        stopWindowDrag(true);
        return;
      }
      processPointerDrag(e.clientX, e.clientY, e.shiftKey);
    },
    [processPointerDrag, stopWindowDrag],
  );

  const onWindowPointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== windowDragPointerIdRef.current) return;
      stopWindowDrag(true);
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
    rotateStartRef.current = null;
    resizeStartTransformRef.current = null;
  };

  const onBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onSelect();
    onBringToFront();
    resetDragState();

    dragModeRef.current = { kind: 'move' };
    moveStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      transform: { ...mapTransformRef.current },
    };
    startWindowDrag(e);
  };

  const onHandlePointerDown = (corner: MapCorner, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onSelect();
    onBringToFront();
    resetDragState();

    dragModeRef.current = { kind: 'resize', corner };
    resizeStartTransformRef.current = { ...mapTransformRef.current };
    startWindowDrag(e);
  };

  const onRotateHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onSelect();
    onBringToFront();
    resetDragState();

    const container = containerRef.current;
    if (!container) return;

    const { centerScreen: cs, armLengthPx: arm } = mapRotationHandleScreen(
      mapTransformRef.current,
      imageWidthRef.current,
      imageHeightRef.current,
      stagePosRef.current,
      viewScaleRef.current,
      ROTATE_HANDLE_ARM_EXTRA_PX,
    );

    dragModeRef.current = { kind: 'rotate' };
    rotateStartRef.current = {
      pointer: clientToLocal(e.clientX, e.clientY, container),
      transform: { ...mapTransformRef.current },
      rotationDeg: mapTransformRef.current.rotation,
      centerScreen: cs,
      armLengthPx: arm,
    };
    startWindowDrag(e);
  };

  if (screenW < 2 || screenH < 2) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div
        className="pointer-events-auto absolute touch-none cursor-move"
        style={rotatedBoxStyle}
        onPointerDown={onBodyPointerDown}
      />
      {selected && (
        <div
          className="pointer-events-none absolute border-2 border-sky-400/90"
          style={rotatedBoxStyle}
        />
      )}
      {selected &&
        CORNERS.map((corner) => {
          const screen = worldToScreen(corners[corner], stagePos, viewScale);
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
              }}
              onPointerDown={(e) => onHandlePointerDown(corner, e)}
            />
          );
        })}
      {selected && (
        <RotationHandleControl
          attachPoint={attachScreen}
          handlePoint={rotateHandleScreen}
          onPointerDown={onRotateHandlePointerDown}
        />
      )}
      {selected && (
        <button
          type="button"
          className="pointer-events-auto absolute flex touch-none items-center justify-center rounded-md border border-red-300/80 bg-red-600/95 text-white shadow-md hover:bg-red-500"
          style={{
            left: controlAnchors.delete.x,
            top: controlAnchors.delete.y,
            width: TRASH_PX,
            height: TRASH_PX,
            transform: 'translate(25%, -125%)',
          }}
          title="Remove map"
          aria-label="Remove map"
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
      )}
    </div>
  );
}
