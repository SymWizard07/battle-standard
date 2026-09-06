import type Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import {
  findMeasurementAtCell,
  findTokenAtWorld,
  findTokensInScreenRect,
  gridCellToWorldCenter,
  screenToWorld,
  tokenWorldTopLeft,
  viewportWorldBounds,
  worldToGridCell,
} from '../lib/grid';
import {
  GRID_SNAP_KEYBOARD_TOOLS,
  gridSnapStrokeMinStep,
  moveTokenPlacementByWorldDelta,
  nextGridSnapCycleValue,
  snapScreenPointWithStrength,
  snapScreenToGridCell,
} from '../lib/gridSnap';
import { cone5eFogPolygons, conePolygonPoints } from '../lib/measure';
import type { GridCell, MapTransform, MeasureDisplayStyle, Point, TokenGridPlacement, ConeMeasureParams } from '../lib/types';
import { resolveSceneEditTool } from '../lib/sceneEdit';
import { hitMapLayerAt, referenceMapLayer, sceneMaps } from '../lib/sceneMaps';
import { resolveMapLayerForWorldPoint, tokenAnchorWorld } from '../lib/mapObjectParent';
import { useRemoteMotionDisplay } from '../hooks/useRemoteMotion';
import { pinEphemeralMeasurement, useActiveScene, useStore, seesAsPlayer } from '../store/useStore';
import { confirmAction } from '../features/confirm/confirmDialogStore';
import { shouldIgnoreGlobalHotkey } from '../lib/keyboardTarget';
import { isWorldPointHiddenFromPlayer, isTokenPlacementCompletelyHiddenFromPlayer } from '../lib/playerFogHit';

import { TokenScaleOverlay } from './TokenScaleOverlay';
import { scrollLibraryNearPointer } from '../hooks/useLibraryDragScroll';
import { fogShapeForKey, measureKindForKey, drawShapeForKey, isMeasurePinToggleKey, isShiftKey } from '../features/toolbar/toolShapeShortcuts';
import { isValidDrawPreview, isValidMeasurePreview, isTokenInMeasurement, measureParamsFromDrag, drawRectParamsFromDrag, drawCircleParamsFromDrag, resolveDrawColor, eraserRadiusWorld, drawStrokeIdsHitByEraser, hitDrawStrokeAt, shiftDrawStrokes, findDrawStrokesInScreenRect } from '../lib/drawShapes';
import { DrawStrokeEditOverlay } from './DrawStrokeEditOverlay';
import { colorFromHue, defaultPlayerColor } from '../lib/playerColor';
import type { DrawPreview } from '../lib/types';
import {
  canEditFog,
  canMoveToken,
  canSessionMoveDrawStrokes,
} from '../sync/syncProvider';
import { PeerDrawSelectionOverlay } from './PeerDrawSelectionOverlay';
import { filterMeasurementsForViewer } from '../lib/measureVisibility';
import { filterTokensForViewer, isTokenSelectableByPlayer } from '../lib/tokenVisibility';
import { DEFAULT_GRID_OFFSET, getGridOffset, GRID_SIZE_PX, setGridOffset } from '../lib/fixedGrid';
import {
  allowDrawToolKeyboardShortcut,
  drawStrokeWidthKeyboardDelta,
  stepDrawStrokeWidth,
} from '../lib/drawConstants';
import { loadImageDimensions } from '../lib/mapAlign';
import { mapLocalToWorld, worldToMapLocal } from '../lib/mapGeometry';
import { newId } from '../lib/ids';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { MapEditOverlay } from './MapEditOverlay';
import { ConnectedDrawLayer } from './layers/DrawLayer';
import {
  DrawTextCursorPlaceholder,
  DrawTextEditOverlay,
  DrawTextInputHost,
  beginEphemeralDrawText,
  commitOrDiscardEphemeralDrawText,
  handleDrawTextStyleShortcut,
  useDrawTextCaretBlink,
} from './DrawTextEditOverlay';
import { drawTextFontSize, pointInDrawTextBounds } from '../lib/drawText';
import { FogLayer } from './layers/FogLayer';
import { GridLayer } from './layers/GridLayer';
import { MeasurementLabelsLayer, MeasurementLayer } from './layers/MeasurementLayer';
import { isDismissibleMeasureLabelHit } from './MeasureLabel';
import { ConnectedTokenLayer } from './layers/TokenLayer';
import { SnapControl } from './SnapControl';

function snapWorldToGridCorner(world: Point): Point {
  const gridOffset = getGridOffset();
  const col = Math.round((world.x - gridOffset.x) / GRID_SIZE_PX);
  const row = Math.round((world.y - gridOffset.y) / GRID_SIZE_PX);
  return {
    x: gridOffset.x + col * GRID_SIZE_PX,
    y: gridOffset.y + row * GRID_SIZE_PX,
  };
}

function movePlacementsEqual(
  a: Record<string, TokenGridPlacement> | null,
  b: Record<string, TokenGridPlacement>,
): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  for (const id of keys) {
    const pa = a[id];
    const pb = b[id];
    if (!pa || !pb) return false;
    if (pa.gridPos.col !== pb.gridPos.col || pa.gridPos.row !== pb.gridPos.row) return false;
    if ((pa.posOffset?.x ?? 0) !== (pb.posOffset?.x ?? 0)) return false;
    if ((pa.posOffset?.y ?? 0) !== (pb.posOffset?.y ?? 0)) return false;
  }
  return true;
}

export function MapViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [gridPreviewSizePx, setGridPreviewSizePx] = useState<number | null>(null);

  const scene = useActiveScene();
  const gridOffset = scene?.gridOffset ?? DEFAULT_GRID_OFFSET;
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const asPlayer = seesAsPlayer(role, playerView);
  const isGm = role === 'gm' && !playerView;
  const viewerTokens = useMemo(
    () => (scene ? filterTokensForViewer(scene.tokens, asPlayer) : []),
    [scene, asPlayer],
  );
  const playerName = useStore((s) => s.playerName);
  const viewerMeasurements = useMemo(
    () =>
      scene
        ? filterMeasurementsForViewer(scene.measurements, role, playerName, asPlayer)
        : [],
    [scene, role, playerName, asPlayer],
  );
  const remoteMotion = useRemoteMotionDisplay();
  const viewerRemoteEphemeral = useMemo(() => {
    const remote = remoteMotion.ephemeralMeasure;
    if (!remote) return null;
    if (!asPlayer) return remote;
    if (!remote.visibleToPlayers) return null;
    return remote;
  }, [remoteMotion.ephemeralMeasure, asPlayer]);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const assetUrls = useStore((s) => s.assetUrls);
  const maps = scene ? sceneMaps(scene) : [];
  const selectedMapLayerId = useStore((s) => s.selectedMapLayerId);
  const setSelectedMapLayerId = useStore((s) => s.setSelectedMapLayerId);
  const updateMapLayerTransform = useStore((s) => s.updateMapLayerTransform);
  const bringMapLayerToFront = useStore((s) => s.bringMapLayerToFront);
  const removeMapLayer = useStore((s) => s.removeMapLayer);
  const recenterGridToMaps = useStore((s) => s.recenterGridToMaps);
  const setViewportSize = useStore((s) => s.setViewportSize);
  const scale = useStore((s) => s.scale);
  const stageX = useStore((s) => s.x);
  const stageY = useStore((s) => s.y);
  const setViewport = useStore((s) => s.setViewport);
  const setGestureViewport = useStore((s) => s.setGestureViewport);
  const activeTool = useStore((s) => s.activeTool);
  const sceneEditMode = useStore((s) => s.sceneEditMode);
  const editTool = resolveSceneEditTool(activeTool, sceneEditMode);
  const selectSnap = useStore((s) => s.selectSnap);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const selectedDrawStrokeIds = useStore((s) => s.selectedDrawStrokeIds);
  const selectDrawShapes = useStore((s) => s.selectDrawShapes);
  const interactionMode = useStore((s) => s.interactionMode);
  const setTokenDragOffMap = useStore((s) => s.setTokenDragOffMap);
  const setTokenLibraryDragOver = useStore((s) => s.setTokenLibraryDragOver);
  const ephemeralMeasure = useStore((s) => s.ephemeralMeasure);
  const alternatingDiagonals = useStore((s) => s.alternatingDiagonals);
  const fogMode = useStore((s) => s.fogMode);
  const fogBrushCells = useStore((s) => s.fogBrushCells);
  const fogShape = useStore((s) => s.fogShape);
  const coneAngleDeg = useStore((s) => s.coneAngleDeg);
  const measureDisplayStyle = useStore((s) => s.measureDisplayStyle);
  const measureDebugDualView = useStore((s) => s.measureDebugDualView);
  const drawHue = useStore((s) => s.drawHue ?? 0);
  const measureColor = useMemo(
    () => defaultPlayerColor(playerName, drawHue),
    [playerName, drawHue],
  );
  const measureTokenHighlightColors = useMemo((): ReadonlyMap<string, string> | undefined => {
    if (activeTool !== 'measure' || !ephemeralMeasure) return undefined;
    const style: MeasureDisplayStyle =
      ephemeralMeasure.displayStyle ??
      (ephemeralMeasure.kind === 'cone'
        ? (ephemeralMeasure.params as ConeMeasureParams).style
        : undefined) ??
      measureDisplayStyle;
    const color = measureColor;
    const map = new Map<string, string>();
    for (const token of viewerTokens) {
      if (
        isTokenInMeasurement(
          token,
          ephemeralMeasure.kind,
          ephemeralMeasure.params,
          style,
          gridOffset,
        )
      ) {
        map.set(token.id, color);
      }
    }
    return map.size > 0 ? map : undefined;
  }, [
    activeTool,
    ephemeralMeasure,
    viewerTokens,
    gridOffset,
    measureDisplayStyle,
    measureColor,
  ]);
  const initiativeHoveredTokenId = useStore((s) => s.initiativeHoveredTokenId);
  const tokenHighlightColors = useMemo((): ReadonlyMap<string, string> | undefined => {
    if (!initiativeHoveredTokenId && !measureTokenHighlightColors) return undefined;
    const map = new Map<string, string>(measureTokenHighlightColors);
    if (initiativeHoveredTokenId) {
      map.set(initiativeHoveredTokenId, '#38bdf8');
    }
    return map.size > 0 ? map : undefined;
  }, [initiativeHoveredTokenId, measureTokenHighlightColors]);
  const setFogPreview = useStore((s) => s.setFogPreview);
  const drawColor = colorFromHue(drawHue);
  const drawStrokeWidth = useStore((s) => s.drawStrokeWidth);
  const drawShape = useStore((s) => s.drawShape);
  const drawTextFont = useStore((s) => s.drawTextFont);
  const drawTextBold = useStore((s) => s.drawTextBold);
  const drawTextItalic = useStore((s) => s.drawTextItalic);
  const drawTextUnderline = useStore((s) => s.drawTextUnderline);
  const drawPreview = useStore((s) => s.drawPreview);
  const setDrawPreview = useStore((s) => s.setDrawPreview);
  const ephemeralDrawText = useStore((s) => s.ephemeralDrawText);
  const setEphemeralDrawText = useStore((s) => s.setEphemeralDrawText);
  const addDrawStroke = useStore((s) => s.addDrawStroke);
  const textCaretVisible = useDrawTextCaretBlink(!!ephemeralDrawText);
  const [drawTextSelection, setDrawTextSelection] = useState({ start: 0, end: 0 });
  const removeDrawStrokes = useStore((s) => s.removeDrawStrokes);
  const updateScene = useStore((s) => s.updateScene);
  const selectToken = useStore((s) => s.selectToken);
  const selectTokens = useStore((s) => s.selectTokens);
  const toggleTokenInSelection = useStore((s) => s.toggleTokenInSelection);
  const selectMeasurement = useStore((s) => s.selectMeasurement);
  const selectDrawStroke = useStore((s) => s.selectDrawStroke);
  const selectDrawStrokes = useStore((s) => s.selectDrawStrokes);
  const toggleDrawStrokeInSelection = useStore((s) => s.toggleDrawStrokeInSelection);
  const updateDrawStrokes = useStore((s) => s.updateDrawStrokes);
  const duplicateSelection = useStore((s) => s.duplicateSelection);
  const deleteSelection = useStore((s) => s.deleteSelection);
  const bringDrawStrokesToFront = useStore((s) => s.bringDrawStrokesToFront);
  const setInteractionMode = useStore((s) => s.setInteractionMode);
  const setMovePreviewPositions = useStore((s) => s.setMovePreviewPositions);
  const setEphemeralMeasure = useStore((s) => s.setEphemeralMeasure);
  const clearSelection = useStore((s) => s.clearSelection);
  const updateToken = useStore((s) => s.updateToken);
  const applyFogStroke = useStore((s) => s.applyFogStroke);
  const applyFogMulti = useStore((s) => s.applyFogMulti);
  const setHoveredTokenId = useStore((s) => s.setHoveredTokenId);
  const gridVisible = useStore((s) => s.gridVisible);
  const resetViewport = useStore((s) => s.resetViewport);
  const setMapLayerImageSize = useStore((s) => s.setMapLayerImageSize);

  const panStart = useRef<{ x: number; y: number; stageX: number; stageY: number } | null>(
    null,
  );
  const middlePan = useRef(false);
  const gridAnchor = useRef<Point | null>(null);
  const gridAnchorScreen = useRef<Point | null>(null);
  const lastPointerScreen = useRef<Point | null>(null);
  const [measurePointerScreen, setMeasurePointerScreen] = useState<Point | null>(null);
  const measurePointerPending = useRef<Point | null>(null);
  const measurePointerRaf = useRef(0);
  const gridAnchorMapLocal = useRef<Point | null>(null);
  const fogStart = useRef<Point | null>(null);
  const fogPath = useRef<Point[]>([]);
  const fogRectStart = useRef<Point | null>(null);
  const fogConeOrigin = useRef<Point | null>(null);
  const fogSphereCenter = useRef<GridCell | null>(null);
  const measureStart = useRef<Point | null>(null);
  const drawStart = useRef<Point | null>(null);
  const drawPath = useRef<Point[]>([]);
  const erasedStrokeIds = useRef<Set<string>>(new Set());
  const eraseLastWorld = useRef<Point | null>(null);
  const canvasGesturePointerId = useRef<number | null>(null);
  const canvasGestureFinishGuard = useRef(false);
  const canvasGestureToolRef = useRef<'draw' | 'measure' | 'fog' | null>(null);
  const finishCanvasGestureRef = useRef<(source: 'stage' | 'window' | 'container') => void>(() => {});
  const pointerCount = useRef(0);
  const confirmDeleteMapLayer = useCallback(
    async (layerId: string) => {
      if (!activeSceneId) return;
      const confirmed = await confirmAction({
        title: 'Remove map',
        message: 'Remove this map from the scene?',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!confirmed) return;
      removeMapLayer(activeSceneId, layerId);
    },
    [activeSceneId, removeMapLayer],
  );

  const mapEditOverlays = editTool === 'mapEdit' ? maps : [];
  const lastPinchDist = useRef<number | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadingMeasurements = useStore((s) => s.fadingMeasurements);
  const fadeAndRemoveMeasurement = useStore((s) => s.fadeAndRemoveMeasurement);
  const marqueeStart = useRef<Point | null>(null);
  const marqueeShiftKey = useRef(false);
  const moveDragStartWorld = useRef<Point | null>(null);
  const moveStartPlacements = useRef<Record<string, TokenGridPlacement>>({});
  const tokenDragPending = useRef<{ screen: Point; world: Point } | null>(null);
  const [marquee, setMarquee] = useState<{ from: Point; to: Point } | null>(null);
  const initiativeTokenPickActive = useStore((s) => s.initiativeTokenPickActive);
  const importsTokenPickActive = useStore((s) => s.importsTokenPickActive);
  const tokenPickActive = initiativeTokenPickActive || importsTokenPickActive;

  useEffect(() => {
    if (tokenPickActive) return;
    if (!marqueeStart.current) return;
    marqueeStart.current = null;
    setMarquee(null);
  }, [tokenPickActive]);
  const [erasePreview, setErasePreview] = useState<{ center: Point; radius: number } | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const homedSceneRef = useRef<string | null>(null);

  const MARQUEE_CLICK_THRESHOLD = 5;

  const [gestureView, setGestureView] = useState<{ x: number; y: number; scale: number } | null>(
    null,
  );
  const viewRef = useRef({ x: stageX, y: stageY, scale });
  const view = gestureView ?? { x: stageX, y: stageY, scale };
  viewRef.current = view;
  const viewportGestureRef = useRef(false);

  const applyGestureView = useCallback(
    (
      next:
        | { x: number; y: number; scale: number }
        | null
        | ((
            prev: { x: number; y: number; scale: number } | null,
          ) => { x: number; y: number; scale: number } | null),
    ) => {
      if (typeof next === 'function') {
        setGestureView((prev) => {
          const resolved = next(prev);
          setGestureViewport(resolved);
          return resolved;
        });
        return;
      }
      setGestureView(next);
      setGestureViewport(next);
    },
    [setGestureViewport],
  );

  const stagePos = { x: view.x, y: view.y };
  const viewScale = view.scale;
  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches;

  useEffect(() => {
    if (!scene || !activeSceneId) return;
    let cancelled = false;
    for (const layer of sceneMaps(scene)) {
      if (layer.imageWidth && layer.imageHeight) continue;
      const url = assetUrls[layer.assetId];
      if (!url) continue;
      loadImageDimensions(url)
        .then(({ width, height }) => {
          if (cancelled) return;
          setMapLayerImageSize(activeSceneId, layer.id, width, height);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [scene, activeSceneId, assetUrls, setMapLayerImageSize]);

  const endViewportGesture = useCallback(
    (commit: boolean) => {
      const wasGesturing = viewportGestureRef.current;
      viewportGestureRef.current = false;
      applyGestureView(null);
      if (!commit || !wasGesturing) return;
      const v = viewRef.current;
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.scale)) return;
      setViewport({ x: v.x, y: v.y, scale: v.scale });
    },
    [setViewport, applyGestureView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      setSize({ width, height });
      setViewportSize(width, height);
      setViewportReady(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setViewportSize]);

  useEffect(() => {
    if (!activeSceneId) {
      homedSceneRef.current = null;
      return;
    }
    if (!viewportReady) return;
    if (homedSceneRef.current === activeSceneId) return;
    homedSceneRef.current = activeSceneId;
    resetViewport();
  }, [activeSceneId, viewportReady, resetViewport]);

  useLayoutEffect(() => {
    setGridOffset(gridOffset);
  }, [gridOffset.x, gridOffset.y, activeSceneId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventAux = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener('auxclick', preventAux);
    return () => el.removeEventListener('auxclick', preventAux);
  }, []);

  const getPointer = useCallback((): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    return pos ? { x: pos.x, y: pos.y } : null;
  }, []);

  const publishMeasurePointer = useCallback((ptr: Point | null) => {
    lastPointerScreen.current = ptr;
    measurePointerPending.current = ptr;
    if (measurePointerRaf.current) return;
    measurePointerRaf.current = requestAnimationFrame(() => {
      measurePointerRaf.current = 0;
      const next = measurePointerPending.current;
      setMeasurePointerScreen((prev) => {
        if (prev == null && next == null) return prev;
        if (prev && next && prev.x === next.x && prev.y === next.y) return prev;
        return next ? { x: next.x, y: next.y } : null;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (measurePointerRaf.current) cancelAnimationFrame(measurePointerRaf.current);
    };
  }, []);

  const syncPointerFromClientEvent = useCallback(
    (e: MouseEvent | PointerEvent | TouchEvent): Point | null => {
      const el = containerRef.current;
      if (!el) return null;
      let clientX: number | undefined;
      let clientY: number | undefined;
      if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0]!.clientX;
        clientY = e.changedTouches[0]!.clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      if (clientX == null || clientY == null) return null;
      const rect = el.getBoundingClientRect();
      const ptr = { x: clientX - rect.left, y: clientY - rect.top };
      publishMeasurePointer(ptr);
      return ptr;
    },
    [publishMeasurePointer],
  );

  const releaseCanvasPointerCapture = useCallback((pointerId: number | null) => {
    const el = containerRef.current;
    if (!el || pointerId == null) return;
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  }, []);

  const isCanvasToolActive = useCallback((tool: string) => {
    return tool === 'draw' || tool === 'measure' || tool === 'fog';
  }, []);

  const isKonvaStageTarget = useCallback((target: EventTarget | null) => {
    const konvaContainer = stageRef.current?.container();
    return !!(konvaContainer && target instanceof Node && konvaContainer.contains(target));
  }, []);

  const getWorld = useCallback(
    (screen: Point) => screenToWorld(screen, stagePos, viewScale),
    [stagePos, viewScale],
  );

  const noopTokenTap = useCallback(() => {}, []);

  const getSnappedWorld = useCallback(
    (screen: Point) => {
      if (!scene) return getWorld(screen);
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      return snapScreenPointWithStrength(
        screen,
        stagePos,
        viewScale,
        selectSnap,
        gridOffset,
        'corner',
      );
    },
    [scene, getWorld, selectSnap, stagePos, viewScale],
  );

  const getMeasureSnappedWorld = useCallback(
    (screen: Point) => {
      if (!scene) return getWorld(screen);
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      return snapScreenPointWithStrength(
        screen,
        stagePos,
        viewScale,
        selectSnap,
        gridOffset,
        'center',
      );
    },
    [scene, getWorld, selectSnap, stagePos, viewScale],
  );

  const getFogSnappedWorld = useCallback(
    (screen: Point) => {
      if (!scene) return getWorld(screen);
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      return snapScreenPointWithStrength(
        screen,
        stagePos,
        viewScale,
        selectSnap,
        gridOffset,
        'corner',
      );
    },
    [scene, getWorld, selectSnap, stagePos, viewScale],
  );

  const getFogGridCell = useCallback(
    (screen: Point) => {
      if (!scene) return { col: 0, row: 0 };
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      const world = getFogSnappedWorld(screen);
      return worldToGridCell(world, gridOffset);
    },
    [getFogSnappedWorld, scene],
  );

  const getGridCell = useCallback(
    (screen: Point) => {
      if (!scene) return { col: 0, row: 0 };
      return snapScreenToGridCell(screen, stagePos, viewScale, selectSnap);
    },
    [scene, selectSnap, stagePos, viewScale],
  );

  const startFadeEphemeral = useCallback(() => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
    let op = 1;
    fadeTimer.current = setInterval(() => {
      op -= 0.08;
      const em = useStore.getState().ephemeralMeasure;
      if (!em || op <= 0) {
        if (fadeTimer.current) clearInterval(fadeTimer.current);
        setEphemeralMeasure(null);
        return;
      }
      setEphemeralMeasure({ ...em, opacity: op });
    }, 32);
  }, [setEphemeralMeasure]);

  const applyMovePreviews = useCallback(
    (pointerWorld: Point) => {
      const startWorld = moveDragStartWorld.current;
      if (!startWorld || !scene) return;
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      const snap = useStore.getState().selectSnap;
      const { role, playerView } = useStore.getState();
      const movingAsPlayer = seesAsPlayer(role, playerView);
      const dx = pointerWorld.x - startWorld.x;
      const dy = pointerWorld.y - startWorld.y;
      const next: Record<string, TokenGridPlacement> = {};
      for (const [id, start] of Object.entries(moveStartPlacements.current)) {
        const candidate = moveTokenPlacementByWorldDelta(
          start,
          dx,
          dy,
          snap,
          gridOffset,
        );
        if (movingAsPlayer) {
          const token = scene.tokens.find((t) => t.id === id);
          if (
            token &&
            isTokenPlacementCompletelyHiddenFromPlayer(
              token,
              candidate,
              scene.fog,
              scene,
              gridOffset,
            )
          ) {
            next[id] = start;
            continue;
          }
        }
        next[id] = candidate;
      }
      const prev = useStore.getState().movePreviewPositions;
      if (movePlacementsEqual(prev, next)) return;
      setMovePreviewPositions(next);
    },
    [scene, setMovePreviewPositions],
  );

  const beginTokenMove = useCallback(
    (pointerWorld: Point) => {
      if (!scene) return;
      const starts: Record<string, TokenGridPlacement> = {};
      for (const id of useStore.getState().selectedTokenIds) {
        const t = scene.tokens.find((tok) => tok.id === id);
        if (t && canMoveToken(t)) {
          starts[id] = {
            gridPos: { ...t.gridPos },
            posOffset: t.posOffset ? { ...t.posOffset } : undefined,
          };
        }
      }
      if (Object.keys(starts).length === 0) return;
      moveDragStartWorld.current = pointerWorld;
      moveStartPlacements.current = starts;
      setInteractionMode('moving');
    },
    [scene, setInteractionMode],
  );

  const armTokenDrag = useCallback(
    (pointerScreen: Point, pointerWorld: Point) => {
      if (!scene || isCoarsePointer) return;
      const ids = useStore.getState().selectedTokenIds;
      const hasEditable = ids.some((id) => {
        const t = scene.tokens.find((tok) => tok.id === id);
        return t && canMoveToken(t);
      });
      if (!hasEditable) return;
      tokenDragPending.current = { screen: pointerScreen, world: pointerWorld };
    },
    [isCoarsePointer, scene],
  );

  const selectTokenForDrag = useCallback(
    (tokenId: string, pointerScreen: Point, pointerWorld: Point) => {
      if (!scene) return;
      if (isCoarsePointer) {
        selectToken(tokenId);
        return;
      }
      if (!useStore.getState().selectedTokenIds.includes(tokenId)) {
        selectToken(tokenId);
      }
      armTokenDrag(pointerScreen, pointerWorld);
    },
    [armTokenDrag, isCoarsePointer, scene, selectToken],
  );

  const tryStartTokenDrag = useCallback(
    (pointerScreen: Point, pointerWorld: Point) => {
      const pending = tokenDragPending.current;
      if (!pending || useStore.getState().interactionMode === 'moving') return false;
      const dist = Math.hypot(
        pointerScreen.x - pending.screen.x,
        pointerScreen.y - pending.screen.y,
      );
      if (dist < MARQUEE_CLICK_THRESHOLD) return false;
      tokenDragPending.current = null;
      beginTokenMove(pending.world);
      applyMovePreviews(pointerWorld);
      return true;
    },
    [applyMovePreviews, beginTokenMove],
  );

  const commitTokenMove = useCallback(() => {
    const positions = useStore.getState().movePreviewPositions;
    if (!activeSceneId || !positions || !scene) return;
    const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
    const { role, playerView } = useStore.getState();
    if (seesAsPlayer(role, playerView)) {
      for (const [id, placement] of Object.entries(positions)) {
        const token = scene.tokens.find((t) => t.id === id);
        if (!token) continue;
        if (
          isTokenPlacementCompletelyHiddenFromPlayer(
            token,
            placement,
            scene.fog,
            scene,
            gridOffset,
          )
        ) {
          setMovePreviewPositions(null);
          setInteractionMode('selected');
          moveDragStartWorld.current = null;
          moveStartPlacements.current = {};
          return;
        }
      }
    }
    updateScene(activeSceneId, (s) => ({
      ...s,
      tokens: s.tokens.map((t) => {
        const placement = positions[t.id];
        if (!placement || !canMoveToken(t)) return t;
        const next = {
          ...t,
          gridPos: placement.gridPos,
          posOffset: placement.posOffset,
        };
        const oldTl = tokenWorldTopLeft(t, gridOffset);
        const newTl = tokenWorldTopLeft(placement, gridOffset);
        if (oldTl.x !== newTl.x || oldTl.y !== newTl.y) {
          return {
            ...next,
            mapLayerId: resolveMapLayerForWorldPoint(
              tokenAnchorWorld(next, gridOffset),
              s,
            ),
          };
        }
        return next;
      }),
    }));
    setMovePreviewPositions(null);
    setInteractionMode('selected');
    moveDragStartWorld.current = null;
    moveStartPlacements.current = {};
  }, [
    activeSceneId,
    scene,
    updateScene,
    setMovePreviewPositions,
    setInteractionMode,
  ]);

  const commitFogStroke = (pts: Point[]) => {
    if (!activeSceneId) return;
    const radius = (GRID_SIZE_PX * fogBrushCells) / 2;
    applyFogStroke(activeSceneId, pts, radius, fogMode);
  };

  const commitFogRect = (a: Point, b: Point) => {
    if (!activeSceneId) return;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 1 && h < 1) return;
    useStore.getState().applyFogRect(activeSceneId, { x, y, w, h }, fogMode);
  };

  const commitFogCone = (
    origin: Point,
    direction: number,
    lengthCells: number,
    style: MeasureDisplayStyle,
    lengthWorld?: number,
  ) => {
    if (!activeSceneId) return;
    if (style === '5e') {
      const mp = cone5eFogPolygons(origin, direction, lengthCells, gridOffset);
      if (mp.length === 0) return;
      applyFogMulti(activeSceneId, mp, fogMode);
      return;
    }
    const pts = conePolygonPoints({
      origin,
      direction,
      lengthCells,
      lengthWorld,
      angleDeg: coneAngleDeg,
      style,
    });
    if (pts.length < 4) return;
    const ring: [number, number][] = [];
    for (let i = 0; i < pts.length; i += 2) ring.push([pts[i]!, pts[i + 1]!]);
    const mp = [[ring]]; // MultiPolygon -> Polygon -> Ring
    applyFogMulti(activeSceneId, mp, fogMode);
  };

  const commitFogSphere = (center: GridCell, radiusCells: number) => {
    if (!activeSceneId) return;
    const c = gridCellToWorldCenter(center);
    const r = (radiusCells + 0.5) * GRID_SIZE_PX;
    const steps = 32;
    const ring: [number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI * i) / steps;
      ring.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r]);
    }
    ring.push(ring[0]!);
    const mp = [[ring]];
    applyFogMulti(activeSceneId, mp, fogMode);
  };

  const updateMeasurePreview = (start: Point, end: Point) => {
    if (!scene) return;
    const state = useStore.getState();
    const paramStyle = state.measureDebugDualView ? 'vtt' : state.measureDisplayStyle;
    const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
    const params = measureParamsFromDrag(
      state.measureKind,
      start,
      end,
      state.coneAngleDeg,
      paramStyle,
      gridOffset,
    );
    if (!isValidMeasurePreview(state.measureKind, params)) {
      setEphemeralMeasure(null);
      return;
    }
    setEphemeralMeasure({
      kind: state.measureKind,
      opacity: 1,
      displayStyle: state.measureDisplayStyle,
      params,
    });
  };

  const updateDrawPreview = (start: Point, end: Point, shiftKey = false) => {
    const shape = useStore.getState().drawShape;
    const state = useStore.getState();
    if (shape === 'stroke' || shape === 'erase' || shape === 'text') return;
    if (shape === 'rect') {
      setDrawPreview({
        kind: 'rect',
        params: drawRectParamsFromDrag(start, end, shiftKey),
        color: drawColor,
        strokeWidth: state.drawStrokeWidth,
      });
      return;
    }
    if (shape === 'sphere') {
      const gridOffset = scene?.gridOffset ?? DEFAULT_GRID_OFFSET;
      setDrawPreview({
        kind: 'sphere',
        params: drawCircleParamsFromDrag(start, end, gridOffset),
        color: drawColor,
        strokeWidth: state.drawStrokeWidth,
      });
      return;
    }
    setDrawPreview({
      kind: shape,
      params: measureParamsFromDrag(
        shape,
        start,
        end,
        state.coneAngleDeg,
        state.measureDisplayStyle,
      ),
      color: drawColor,
      strokeWidth: state.drawStrokeWidth,
    });
  };

  const commitDrawPreview = (preview: DrawPreview) => {
    const state = useStore.getState();
    const sceneId = state.activeSceneId;
    let previewToCommit = preview;
    if (
      preview.kind === 'stroke' &&
      (preview.points?.length ?? 0) < 2 &&
      drawPath.current.length >= 2
    ) {
      previewToCommit = {
        ...preview,
        points: drawPath.current,
        strokeWidth: state.drawStrokeWidth,
      };
    }
    const valid = isValidDrawPreview(previewToCommit);
    if (!sceneId || !valid) return;
    addDrawStroke(sceneId, {
      id: newId(),
      kind: previewToCommit.kind,
      color: resolveDrawColor(previewToCommit.color),
      strokeWidth: previewToCommit.strokeWidth,
      points: previewToCommit.points,
      params: previewToCommit.params,
    });
  };

  const applyEraseAt = useCallback(
    (world: Point) => {
      if (!activeSceneId) return;
      const latestScene = useStore.getState().campaign?.scenes[activeSceneId];
      if (!latestScene) return;
      const radius = eraserRadiusWorld(viewRef.current.scale);
      const ids = drawStrokeIdsHitByEraser(
        latestScene.drawStrokes ?? [],
        world,
        radius,
        erasedStrokeIds.current,
      );
      if (ids.length > 0) {
        removeDrawStrokes(activeSceneId, ids);
        for (const id of ids) erasedStrokeIds.current.add(id);
      }
      setErasePreview({ center: world, radius });
    },
    [activeSceneId, removeDrawStrokes],
  );

  const updateErasePreviewAt = useCallback((world: Point) => {
    setErasePreview({ center: world, radius: eraserRadiusWorld(viewRef.current.scale) });
  }, []);

  const applyEraseAlong = useCallback(
    (from: Point, to: Point) => {
      const radius = eraserRadiusWorld(viewRef.current.scale);
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(2, radius / 2);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        applyEraseAt({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        });
      }
    },
    [applyEraseAt],
  );

  const commitMeasure = () => {
    const state = useStore.getState();
    const sceneId = state.activeSceneId;
    const hasScene = !!(sceneId && state.campaign?.scenes[sceneId]);
    const em = state.ephemeralMeasure;
    const valid = em ? isValidMeasurePreview(em.kind, em.params) : false;
    if (!sceneId || !hasScene) return;
    if (!em || !valid) return;
    if (state.measurePinMode) {
      pinEphemeralMeasurement(sceneId, em.kind, em.params, em.displayStyle);
      setEphemeralMeasure(null);
    } else {
      startFadeEphemeral();
    }
  };

  const startCanvasToolGesture = useCallback(
    (ptr: Point, shiftKey: boolean) => {
      if (!scene || !activeSceneId) return false;
      lastPointerScreen.current = ptr;
      const world = getWorld(ptr);
      const tool = useStore.getState().activeTool;

      if (tool === 'fog' && canEditFog()) {
        const snapWorld = getFogSnappedWorld(ptr);
        canvasGestureToolRef.current = 'fog';
        fogStart.current = snapWorld;
        if (fogShape === 'stroke') {
          fogPath.current = [snapWorld];
          setFogPreview({
            kind: 'stroke',
            points: [snapWorld],
            radius: (GRID_SIZE_PX * fogBrushCells) / 2,
          });
        } else if (fogShape === 'rect') {
          fogRectStart.current = snapWorld;
          setFogPreview({
            kind: 'rect',
            from: snapWorld,
            to: snapWorld,
          });
        } else if (fogShape === 'cone') {
          fogConeOrigin.current = snapWorld;
          setFogPreview({
            kind: 'cone',
            origin: snapWorld,
            direction: 0,
            lengthCells: 1,
            angleDeg: coneAngleDeg,
            style: measureDisplayStyle,
          });
        } else if (fogShape === 'sphere') {
          const c = getFogGridCell(ptr);
          fogSphereCenter.current = c;
          setFogPreview({ kind: 'sphere', center: c, radiusCells: 0 });
        }
        return true;
      }

      if (tool === 'measure') {
        const snapped = getMeasureSnappedWorld(ptr);
        measureStart.current = snapped;
        canvasGestureToolRef.current = 'measure';
        updateMeasurePreview(snapped, snapped);
        return true;
      }

      if (tool === 'draw') {
        if (drawShape === 'text') {
          const existing = useStore.getState().ephemeralDrawText;
          if (existing) {
            const world = getWorld(ptr);
            if (
              !pointInDrawTextBounds(world, existing.params, existing.strokeWidth)
            ) {
              if (activeSceneId) {
                commitOrDiscardEphemeralDrawText(activeSceneId, existing);
              } else {
                setEphemeralDrawText(null);
              }
            }
            return false;
          }
          const snapped = getSnappedWorld(ptr);
          const {
            drawTextFont,
            drawTextBold,
            drawTextItalic,
            drawTextUnderline,
          } = useStore.getState();
          setEphemeralDrawText(
            beginEphemeralDrawText(snapped, drawColor, drawStrokeWidth, {
              fontFamily: drawTextFont,
              bold: drawTextBold,
              italic: drawTextItalic,
              underline: drawTextUnderline,
            }),
          );
          return false;
        }
        canvasGestureToolRef.current = 'draw';
        if (drawShape === 'erase') {
          drawStart.current = world;
          erasedStrokeIds.current = new Set();
          eraseLastWorld.current = world;
          applyEraseAt(world);
        } else if (drawShape === 'stroke') {
          const snapped = getSnappedWorld(ptr);
          drawStart.current = snapped;
          drawPath.current = [snapped];
          setDrawPreview({
            kind: 'stroke',
            points: [snapped],
            color: drawColor,
            strokeWidth: drawStrokeWidth,
          });
        } else {
          const snapped = getSnappedWorld(ptr);
          drawStart.current = snapped;
          updateDrawPreview(snapped, snapped, shiftKey);
        }
        return true;
      }

      return false;
    },
    [
      activeSceneId,
      applyEraseAt,
      coneAngleDeg,
      drawColor,
      drawShape,
      drawStrokeWidth,
      fogBrushCells,
      fogShape,
      getFogGridCell,
      getFogSnappedWorld,
      getMeasureSnappedWorld,
      getSnappedWorld,
      getWorld,
      measureDisplayStyle,
      scene,
      setDrawPreview,
      setEphemeralDrawText,
      setFogPreview,
      updateDrawPreview,
      updateMeasurePreview,
    ],
  );

  const onPointerDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const evt = e.evt as MouseEvent;
    if (evt.type === 'mousedown' && evt.button !== 0) return;
    if (useStore.getState().interactionMode === 'scaling') return;
    const ptr = getPointer();
    if (ptr && isDismissibleMeasureLabelHit(stageRef.current, ptr)) return;
    if (isCanvasToolActive(useStore.getState().activeTool)) return;

    const isTouch = evt.type.startsWith('touch');
    if (isTouch && 'touches' in evt) {
      pointerCount.current = (evt as unknown as TouchEvent).touches.length;
    } else {
      pointerCount.current = 1;
    }
    if (pointerCount.current >= 2) return;

    if (!ptr || !scene || !activeSceneId) return;
    lastPointerScreen.current = ptr;
    const world = getWorld(ptr);

    const pickState = useStore.getState();
    if (pickState.initiativeTokenPickActive || pickState.importsTokenPickActive) {
      let tokenHit = findTokenAtWorld(world, viewerTokens, gridOffset);
      if (tokenHit && asPlayer && scene) {
        const token = viewerTokens.find((t) => t.id === tokenHit);
        if (
          !token ||
          !isTokenSelectableByPlayer(token, scene.fog, scene, gridOffset) ||
          isWorldPointHiddenFromPlayer(world, scene.fog, scene)
        ) {
          tokenHit = null;
        }
      }
      if (tokenHit) {
        if (pickState.importsTokenPickActive) {
          pickState.submitImportsTokenPick(tokenHit);
        } else {
          pickState.submitInitiativeTokenPick(tokenHit);
        }
      } else {
        marqueeStart.current = ptr;
        setMarquee({ from: ptr, to: ptr });
      }
      return;
    }

    if (editTool === 'gridEdit') {
      gridAnchor.current = world;
      gridAnchorScreen.current = ptr;
      const refMap = referenceMapLayer(scene, selectedMapLayerId);
      if (refMap) gridAnchorMapLocal.current = worldToMapLocal(world, refMap.transform);
      setGridPreviewSizePx(GRID_SIZE_PX);
      return;
    }

    if (editTool === 'mapEdit') {
      if (!hitMapLayerAt(world, maps)) {
        setSelectedMapLayerId(null);
      }
      return;
    }

    if (activeTool === 'select' || activeTool === 'transform') {
      const cell = getGridCell(ptr);
      const shiftKey =
        'shiftKey' in evt && (evt as MouseEvent).shiftKey;
      let tokenHit = findTokenAtWorld(world, viewerTokens, gridOffset);
      if (tokenHit && asPlayer && scene) {
        const token = viewerTokens.find((t) => t.id === tokenHit);
        if (
          !token ||
          !isTokenSelectableByPlayer(token, scene.fog, scene, gridOffset) ||
          isWorldPointHiddenFromPlayer(world, scene.fog, scene)
        ) {
          tokenHit = null;
        }
      }

      if (tokenHit) {
        if (activeTool === 'transform') {
          selectTokenForDrag(tokenHit, ptr, world);
          return;
        }

        // Select tool
        if (shiftKey) {
          toggleTokenInSelection(tokenHit);
          return;
        }
        selectTokenForDrag(tokenHit, ptr, world);
        return;
      }

      const measureHit = findMeasurementAtCell(viewerMeasurements, cell);
      if (activeTool === 'select' && selectDrawShapes) {
        const drawHit = hitDrawStrokeAt(world, scene.drawStrokes ?? [], 8, gridOffset);
        if (drawHit) {
          tokenDragPending.current = null;
          if (shiftKey) {
            toggleDrawStrokeInSelection(drawHit.id);
          } else {
            selectDrawStroke(drawHit.id);
          }
          if (activeSceneId) bringDrawStrokesToFront(activeSceneId, [drawHit.id]);
          return;
        }
      }

      if (measureHit) {
        tokenDragPending.current = null;
        selectMeasurement(measureHit);
        return;
      }

      if (activeTool === 'select') {
        tokenDragPending.current = null;
        marqueeShiftKey.current = shiftKey;
        marqueeStart.current = ptr;
        setMarquee({ from: ptr, to: ptr });
        return;
      }

      tokenDragPending.current = null;
      clearSelection();
      return;
    }

    if (activeTool === 'pan' || activeTool === 'players') {
      panStart.current = { x: ptr.x, y: ptr.y, stageX: view.x, stageY: view.y };
    }
  };

  const onPointerMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (useStore.getState().interactionMode === 'scaling') return;
    if (canvasGesturePointerId.current != null) return;
    const evt = e.evt;
    const isTouch = evt.type.startsWith('touch');
    if (isTouch) {
      const te = evt as TouchEvent;
      pointerCount.current = te.touches.length;
      if (te.touches.length >= 2) {
        const t0 = te.touches[0];
        const t1 = te.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        if (lastPinchDist.current != null) {
          viewportGestureRef.current = true;
          const ratio = dist / lastPinchDist.current;
          const newScale = Math.min(4, Math.max(0.15, viewScale * ratio));
          applyGestureView((gv) => {
            const base = gv ?? viewRef.current;
            return { ...base, scale: newScale };
          });
        }
        lastPinchDist.current = dist;
        return;
      }
      lastPinchDist.current = null;
    }

    const ptr = getPointer();
    if (ptr) publishMeasurePointer(ptr);
    if (!ptr || !scene) return;

    const world = getWorld(ptr);

    if (
      (useStore.getState().initiativeTokenPickActive ||
        useStore.getState().importsTokenPickActive) &&
      marqueeStart.current
    ) {
      lastPointerScreen.current = ptr;
      setMarquee({ from: marqueeStart.current, to: ptr });
      return;
    }

    if (editTool === 'gridEdit' && gridAnchor.current) {
      const aLocal = gridAnchorMapLocal.current;
      const refMap = referenceMapLayer(scene, selectedMapLayerId);
      if (aLocal && refMap && scene) {
        const bLocal = worldToMapLocal(world, refMap.transform);
        const distLocal = Math.hypot(bLocal.x - aLocal.x, bLocal.y - aLocal.y);
        const sizePx = Math.max(2, distLocal * refMap.transform.scale);
        setGridPreviewSizePx(sizePx);
      }
      return;
    }

    if (activeTool === 'fog' && fogStart.current) {
      const snapWorld = getFogSnappedWorld(ptr);
      if (fogShape === 'stroke') {
        const path = fogPath.current;
        const last = path[path.length - 1];
        const minStep = gridSnapStrokeMinStep(
          selectSnap,
          Math.max(2, (GRID_SIZE_PX * fogBrushCells) / 4),
        );
        if (!last || Math.hypot(snapWorld.x - last.x, snapWorld.y - last.y) >= minStep) {
          fogPath.current = [...path, snapWorld];
        }
        setFogPreview({
          kind: 'stroke',
          points: fogPath.current,
          radius: (GRID_SIZE_PX * fogBrushCells) / 2,
        });
      } else if (fogShape === 'rect' && fogRectStart.current) {
        setFogPreview({
          kind: 'rect',
          from: fogRectStart.current,
          to: snapWorld,
        });
      } else if (fogShape === 'cone' && fogConeOrigin.current) {
        const o = fogConeOrigin.current;
        const dir = Math.atan2(snapWorld.y - o.y, snapWorld.x - o.x);
        const lenWorld = Math.max(
          0,
          (snapWorld.x - o.x) * Math.cos(dir) + (snapWorld.y - o.y) * Math.sin(dir),
        );
        const len = Math.max(0, Math.round(lenWorld / GRID_SIZE_PX));
        setFogPreview({
          kind: 'cone',
          origin: o,
          direction: dir,
          lengthCells: len,
          lengthWorld: lenWorld,
          angleDeg: coneAngleDeg,
          style: measureDisplayStyle,
        });
      } else if (fogShape === 'sphere' && fogSphereCenter.current) {
        const c = fogSphereCenter.current;
        const wc = getFogGridCell(ptr);
        const r = Math.round(Math.hypot(wc.col - c.col, wc.row - c.row));
        setFogPreview({ kind: 'sphere', center: c, radiusCells: r });
      }
      return;
    }

    if (activeTool === 'measure' && measureStart.current) {
      const snapped = getMeasureSnappedWorld(ptr);
      updateMeasurePreview(measureStart.current, snapped);
      return;
    }

    if (activeTool === 'draw' && drawShape === 'erase') {
      updateErasePreviewAt(world);
      if (drawStart.current) {
        const last = eraseLastWorld.current ?? drawStart.current;
        if (last) applyEraseAlong(last, world);
        eraseLastWorld.current = world;
      }
      return;
    }

    if (activeTool === 'draw' && drawStart.current) {
      if (drawShape === 'stroke') {
        const snapped = getSnappedWorld(ptr);
        const path = drawPath.current;
        const last = path[path.length - 1];
        const minStep = Math.max(2, drawStrokeWidth / 2);
        if (!last || Math.hypot(snapped.x - last.x, snapped.y - last.y) >= minStep) {
          drawPath.current = [...path, snapped];
        }
        setDrawPreview({
          kind: 'stroke',
          points: drawPath.current,
          color: drawColor,
          strokeWidth: drawStrokeWidth,
        });
      } else {
        const snapped = getSnappedWorld(ptr);
        const shiftKey = 'shiftKey' in evt && (evt as MouseEvent).shiftKey;
        updateDrawPreview(drawStart.current, snapped, shiftKey);
      }
      return;
    }

    if (
      (activeTool === 'select' || activeTool === 'transform') &&
      tryStartTokenDrag(ptr, world)
    ) {
      return;
    }

    if (activeTool === 'select' && marqueeStart.current) {
      setMarquee({ from: marqueeStart.current, to: ptr });
      return;
    }

    if (
      (activeTool === 'pan' || activeTool === 'players') &&
      panStart.current &&
      pointerCount.current < 2
    ) {
      const start = panStart.current;
      viewportGestureRef.current = true;
      applyGestureView({
        x: start.stageX + (ptr.x - start.x),
        y: start.stageY + (ptr.y - start.y),
        scale: viewRef.current.scale,
      });
    }
  };

  const refreshCanvasGesturePreviewBeforeCommit = () => {
    const ptr = lastPointerScreen.current;
    if (!ptr) return;
    const state = useStore.getState();
    const tool = state.activeTool;
    const shape = state.drawShape;
    if (tool === 'measure' && measureStart.current) {
      updateMeasurePreview(measureStart.current, getMeasureSnappedWorld(ptr));
      return;
    }
    if (tool === 'draw' && drawStart.current) {
      if (shape === 'stroke') {
        const snapped = getSnappedWorld(ptr);
        const path = drawPath.current;
        const last = path[path.length - 1];
        const minStep = Math.max(2, state.drawStrokeWidth / 2);
        if (
          path.length < 2 ||
          !last ||
          Math.hypot(snapped.x - last.x, snapped.y - last.y) >= minStep
        ) {
          drawPath.current = [...path, snapped];
        }
        setDrawPreview({
          kind: 'stroke',
          points: drawPath.current,
          color: drawColor,
          strokeWidth: state.drawStrokeWidth,
        });
      } else if (shape !== 'erase') {
        updateDrawPreview(drawStart.current, getSnappedWorld(ptr), false);
      }
    }
  };

  const updateCanvasGestureAtScreen = (ptr: Point, shiftKey = false) => {
    if (!scene) return;
    publishMeasurePointer(ptr);
    const world = getWorld(ptr);
    const state = useStore.getState();
    const tool = state.activeTool;
    const shape = state.drawShape;

    if (tool === 'fog' && fogStart.current) {
      const snapWorld = getFogSnappedWorld(ptr);
      if (state.fogShape === 'stroke') {
        const path = fogPath.current;
        const last = path[path.length - 1];
        const minStep = gridSnapStrokeMinStep(
          state.selectSnap,
          Math.max(2, (GRID_SIZE_PX * state.fogBrushCells) / 4),
        );
        if (!last || Math.hypot(snapWorld.x - last.x, snapWorld.y - last.y) >= minStep) {
          fogPath.current = [...path, snapWorld];
        }
        setFogPreview({
          kind: 'stroke',
          points: fogPath.current,
          radius: (GRID_SIZE_PX * state.fogBrushCells) / 2,
        });
      } else if (state.fogShape === 'rect' && fogRectStart.current) {
        setFogPreview({
          kind: 'rect',
          from: fogRectStart.current,
          to: snapWorld,
        });
      } else if (state.fogShape === 'cone' && fogConeOrigin.current) {
        const o = fogConeOrigin.current;
        const dir = Math.atan2(snapWorld.y - o.y, snapWorld.x - o.x);
        const lenWorld = Math.max(
          0,
          (snapWorld.x - o.x) * Math.cos(dir) + (snapWorld.y - o.y) * Math.sin(dir),
        );
        const len = Math.max(0, Math.round(lenWorld / GRID_SIZE_PX));
        setFogPreview({
          kind: 'cone',
          origin: o,
          direction: dir,
          lengthCells: len,
          lengthWorld: lenWorld,
          angleDeg: state.coneAngleDeg,
          style: state.measureDisplayStyle,
        });
      } else if (state.fogShape === 'sphere' && fogSphereCenter.current) {
        const c = fogSphereCenter.current;
        const wc = getFogGridCell(ptr);
        const r = Math.round(Math.hypot(wc.col - c.col, wc.row - c.row));
        setFogPreview({ kind: 'sphere', center: c, radiusCells: r });
      }
      return;
    }

    if (tool === 'measure' && measureStart.current) {
      updateMeasurePreview(measureStart.current, getMeasureSnappedWorld(ptr));
      return;
    }

    if (tool === 'draw' && shape === 'erase') {
      updateErasePreviewAt(world);
      if (drawStart.current) {
        const last = eraseLastWorld.current ?? drawStart.current;
        if (last) applyEraseAlong(last, world);
        eraseLastWorld.current = world;
      }
      return;
    }

    if (tool === 'draw' && drawStart.current) {
      if (shape === 'stroke') {
        const snapped = getSnappedWorld(ptr);
        const path = drawPath.current;
        const last = path[path.length - 1];
        const minStep = Math.max(2, state.drawStrokeWidth / 2);
        if (!last || Math.hypot(snapped.x - last.x, snapped.y - last.y) >= minStep) {
          drawPath.current = [...path, snapped];
        }
        setDrawPreview({
          kind: 'stroke',
          points: drawPath.current,
          color: drawColor,
          strokeWidth: state.drawStrokeWidth,
        });
      } else {
        updateDrawPreview(drawStart.current, getSnappedWorld(ptr), shiftKey);
      }
    }
  };

  const onPointerUp = (source: 'stage' | 'window' | 'container' = 'stage') => {
    const stateAtUp = useStore.getState();
    const hasCanvasGesture =
      !!drawStart.current || !!measureStart.current || !!fogStart.current;
    if (hasCanvasGesture) {
      if (canvasGestureFinishGuard.current) return;
      canvasGestureFinishGuard.current = true;
    } else if (source !== 'stage') {
      return;
    }

    let tool = stateAtUp.activeTool;
    try {
      tokenDragPending.current = null;
      refreshCanvasGesturePreviewBeforeCommit();

      const state = useStore.getState();
      tool = canvasGestureToolRef.current ?? state.activeTool;
      const shape = state.drawShape;
      const sceneId = state.activeSceneId;
      const currentFogPreview = state.fogPreview;

    if (editTool === 'gridEdit' && gridAnchor.current) {
      const aScreen = gridAnchorScreen.current;
      const bScreen = lastPointerScreen.current ?? getPointer();

      // Commit by adjusting the MAP transform (not the viewport).
      // Goal: the map square under the anchor becomes exactly 1 fixed-grid cell.
      // Keep the anchor pinned to the same screen location (so camera doesn't "jump").
      if (aScreen && bScreen && scene && activeSceneId) {
        const refMap = referenceMapLayer(scene, selectedMapLayerId);
        if (refMap) {
          const prev = refMap.transform;
          const anchorWorldNow = getWorld(aScreen);
          const anchorWorldSnapped = snapWorldToGridCorner(anchorWorldNow);
          const aLocal = gridAnchorMapLocal.current ?? worldToMapLocal(anchorWorldNow, prev);
          const bWorld = getWorld(bScreen);
          const bLocal = worldToMapLocal(bWorld, prev);

          const distLocal = Math.hypot(bLocal.x - aLocal.x, bLocal.y - aLocal.y);
          if (distLocal >= 2) {
            const nextScale = Math.min(8, Math.max(0.05, GRID_SIZE_PX / distLocal));

            const next: MapTransform = { ...prev, scale: nextScale, x: 0, y: 0 };
            const aWorldNoTranslate = mapLocalToWorld(aLocal, { ...next, x: 0, y: 0 });
            const nextX = anchorWorldSnapped.x - aWorldNoTranslate.x;
            const nextY = anchorWorldSnapped.y - aWorldNoTranslate.y;

            updateMapLayerTransform(activeSceneId, refMap.id, {
              x: nextX,
              y: nextY,
              scale: nextScale,
            });
          }
        }
      }

      gridAnchor.current = null;
      gridAnchorScreen.current = null;
      gridAnchorMapLocal.current = null;
      setGridPreviewSizePx(null);
    }

    if (tool === 'fog' && fogStart.current && currentFogPreview && sceneId) {
      if (currentFogPreview.kind === 'stroke') {
        commitFogStroke(currentFogPreview.points ?? []);
      } else if (currentFogPreview.kind === 'rect' && currentFogPreview.from && currentFogPreview.to) {
        const { from, to } = currentFogPreview;
        if (from.x !== to.x || from.y !== to.y) {
          commitFogRect(from, to);
        }
      } else if (
        currentFogPreview.kind === 'cone' &&
        currentFogPreview.origin &&
        typeof currentFogPreview.direction === 'number' &&
        typeof currentFogPreview.lengthCells === 'number'
      ) {
        commitFogCone(
          currentFogPreview.origin,
          currentFogPreview.direction,
          currentFogPreview.lengthCells,
          currentFogPreview.style ?? state.measureDisplayStyle,
          currentFogPreview.lengthWorld,
        );
      } else if (
        currentFogPreview.kind === 'sphere' &&
        currentFogPreview.center &&
        typeof currentFogPreview.radiusCells === 'number'
      ) {
        commitFogSphere(currentFogPreview.center, currentFogPreview.radiusCells);
      }
      fogStart.current = null;
      fogPath.current = [];
      fogRectStart.current = null;
      fogConeOrigin.current = null;
      fogSphereCenter.current = null;
      setFogPreview(null);
    }

    if (tool === 'measure' && measureStart.current) {
      commitMeasure();
      measureStart.current = null;
    }

    if (tool === 'draw' && drawStart.current) {
      if (shape === 'erase') {
        const ptr = lastPointerScreen.current;
        if (ptr) updateErasePreviewAt(getWorld(ptr));
      } else {
        let preview = useStore.getState().drawPreview;
        if (
          preview?.kind === 'stroke' &&
          (preview.points?.length ?? 0) < 2 &&
          drawPath.current.length >= 2
        ) {
          preview = {
            ...preview,
            points: drawPath.current,
            strokeWidth: state.drawStrokeWidth,
          };
        }
        if (preview) commitDrawPreview(preview);
        setDrawPreview(null);
      }
      drawStart.current = null;
      drawPath.current = [];
      erasedStrokeIds.current = new Set();
      eraseLastWorld.current = null;
    }

    canvasGestureToolRef.current = null;
    } finally {
      if (hasCanvasGesture) {
        canvasGestureFinishGuard.current = false;
      }
    }

    if (
      (stateAtUp.initiativeTokenPickActive || stateAtUp.importsTokenPickActive) &&
      marqueeStart.current &&
      scene
    ) {
      const start = marqueeStart.current;
      const end = lastPointerScreen.current ?? start;
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      marqueeStart.current = null;
      setMarquee(null);
      if (dist >= MARQUEE_CLICK_THRESHOLD) {
        const linked = stateAtUp.initiativeTokenPickActive
          ? new Set(stateAtUp.initiativeLinkedTokenIds)
          : null;
        const ids = findTokensInScreenRect(
          viewerTokens,
          start,
          end,
          stagePos,
          viewScale,
        ).filter((id) => {
          if (linked?.has(id)) return false;
          if (!asPlayer || !scene) return true;
          const token = viewerTokens.find((t) => t.id === id);
          return (
            token != null &&
            isTokenSelectableByPlayer(token, scene.fog, scene, gridOffset)
          );
        });
        if (ids.length > 0) {
          if (stateAtUp.importsTokenPickActive) {
            stateAtUp.submitImportsTokenPick(ids);
          } else {
            stateAtUp.submitInitiativeTokenPick(ids);
          }
        }
      }
      return;
    }

    if (tool === 'select' && marqueeStart.current && scene) {
      const start = marqueeStart.current;
      const end = lastPointerScreen.current ?? start;
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      if (dist < MARQUEE_CLICK_THRESHOLD) {
        if (!marqueeShiftKey.current) clearSelection();
      } else if (selectDrawShapes) {
        const ids = findDrawStrokesInScreenRect(
          scene.drawStrokes ?? [],
          start,
          end,
          stagePos,
          viewScale,
          gridOffset,
        );
        if (marqueeShiftKey.current) {
          const current = useStore.getState().selectedDrawStrokeIds;
          selectDrawStrokes([...new Set([...current, ...ids])]);
        } else {
          selectDrawStrokes(ids);
        }
      } else {
        const ids = findTokensInScreenRect(
          viewerTokens,
          start,
          end,
          stagePos,
          viewScale,
        ).filter((id) => {
          if (!asPlayer || !scene) return true;
          const token = viewerTokens.find((t) => t.id === id);
          return (
            token != null &&
            isTokenSelectableByPlayer(token, scene.fog, scene, gridOffset)
          );
        });
        if (marqueeShiftKey.current) {
          const current = useStore.getState().selectedTokenIds;
          selectTokens([...new Set([...current, ...ids])]);
        } else {
          selectTokens(ids);
        }
      }
      marqueeShiftKey.current = false;
      marqueeStart.current = null;
      setMarquee(null);
    }

    if (interactionMode === 'scaling') {
      return;
    }

    if (interactionMode === 'moving') {
      return;
    }

    endViewportGesture(true);
    panStart.current = null;
    pointerCount.current = 0;
    lastPinchDist.current = null;
  };

  finishCanvasGestureRef.current = onPointerUp;

  const onContainerPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (useStore.getState().interactionMode === 'scaling') return;
      const tool = useStore.getState().activeTool;
      if (!isCanvasToolActive(tool)) return;
      if (tool === 'fog' && !canEditFog()) return;
      if (!isKonvaStageTarget(e.target)) return;

    const ptr = syncPointerFromClientEvent(e.nativeEvent);
    if (!ptr) return;
    if (isDismissibleMeasureLabelHit(stageRef.current, ptr)) return;
    if (!startCanvasToolGesture(ptr, e.shiftKey)) return;

      e.preventDefault();
      e.stopPropagation();
      canvasGesturePointerId.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [isCanvasToolActive, isKonvaStageTarget, startCanvasToolGesture, syncPointerFromClientEvent],
  );

  const onContainerPointerMoveCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (canvasGesturePointerId.current !== e.pointerId) return;
      if (!drawStart.current && !measureStart.current && !fogStart.current) return;
      const ptr = syncPointerFromClientEvent(e.nativeEvent);
      if (!ptr) return;
      e.preventDefault();
      e.stopPropagation();
      updateCanvasGestureAtScreen(ptr, e.shiftKey);
    },
    [syncPointerFromClientEvent, updateCanvasGestureAtScreen],
  );

  const onContainerPointerUpCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (canvasGesturePointerId.current !== e.pointerId) return;
      if (!drawStart.current && !measureStart.current && !fogStart.current) return;
      syncPointerFromClientEvent(e.nativeEvent);
      e.preventDefault();
      e.stopPropagation();
      const pointerId = e.pointerId;
      canvasGesturePointerId.current = null;
      finishCanvasGestureRef.current('container');
      releaseCanvasPointerCapture(pointerId);
    },
    [releaseCanvasPointerCapture, syncPointerFromClientEvent],
  );

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    // Shift+wheel adjusts draw outline instead of zooming.
    if (e.shiftKey && useStore.getState().activeTool === 'draw') {
      if (e.deltaY === 0 && e.deltaX === 0) return;
      const primary =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const indexDelta = primary < 0 ? 1 : -1;
      const { drawStrokeWidth, setDrawStrokeWidth } = useStore.getState();
      setDrawStrokeWidth(stepDrawStrokeWidth(drawStrokeWidth, indexDelta));
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const ptr = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const v = viewRef.current;
    const oldScale = v.scale;
    const zoomFactor = Math.pow(1.0015, -e.deltaY);
    const newScale = Math.min(4, Math.max(0.15, oldScale * zoomFactor));
    const mousePointTo = {
      x: (ptr.x - v.x) / oldScale,
      y: (ptr.y - v.y) / oldScale,
    };
    const next = {
      scale: newScale,
      x: ptr.x - mousePointTo.x * newScale,
      y: ptr.y - mousePointTo.y * newScale,
    };
    setViewport(next);
  }, [setViewport]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [onWheel]);

  useEffect(() => {
    if (interactionMode !== 'moving') {
      setTokenDragOffMap(false);
      setTokenLibraryDragOver(false);
      return;
    }

    const container = containerRef.current;
    const tokenLibraryEl = document.querySelector('[data-token-library]');
    const pointerInEl = (clientX: number, clientY: number, target: Element | null) => {
      if (!target) return false;
      const r = target.getBoundingClientRect();
      return (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      );
    };

    const onWindowPointerMove = (e: PointerEvent) => {
      if (useStore.getState().interactionMode !== 'moving') return;

      const libEl = tokenLibraryEl;
      const overLibrary = pointerInEl(e.clientX, e.clientY, libEl);
      setTokenLibraryDragOver(overLibrary);
      if (overLibrary) scrollLibraryNearPointer(e.clientX, e.clientY);

      const overMap = pointerInEl(e.clientX, e.clientY, container);
      setTokenDragOffMap(!overMap);

      if (overMap && container) {
        const rect = container.getBoundingClientRect();
        const ptr = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        publishMeasurePointer(ptr);
        applyMovePreviews(getWorld(ptr));
      }
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (useStore.getState().interactionMode !== 'moving') return;

      const libEl = tokenLibraryEl;
      const overLibrary = pointerInEl(e.clientX, e.clientY, libEl);

      setTokenDragOffMap(false);
      setTokenLibraryDragOver(false);
      useStore.getState().clearTokenLibraryDrop();

      if (!overLibrary) {
        commitTokenMove();
      }
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
    };
  }, [
    interactionMode,
    applyMovePreviews,
    getGridCell,
    commitTokenMove,
    setTokenDragOffMap,
    setTokenLibraryDragOver,
    publishMeasurePointer,
    getWorld,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const pointerInContainer = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const endMiddlePan = () => {
      if (!middlePan.current) return;
      endViewportGesture(true);
      middlePan.current = false;
      panStart.current = null;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      const ptr = pointerInContainer(e.clientX, e.clientY);
      publishMeasurePointer(ptr);
      const v = viewRef.current;
      middlePan.current = true;
      panStart.current = { x: ptr.x, y: ptr.y, stageX: v.x, stageY: v.y };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!middlePan.current || !panStart.current) return;
      if (!(e.buttons & 4)) {
        endMiddlePan();
        return;
      }
      const ptr = pointerInContainer(e.clientX, e.clientY);
      publishMeasurePointer(ptr);
      const start = panStart.current;
      viewportGestureRef.current = true;
      applyGestureView({
        x: start.stageX + (ptr.x - start.x),
        y: start.stageY + (ptr.y - start.y),
        scale: viewRef.current.scale,
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 1) return;
      endMiddlePan();
    };

    el.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [endViewportGesture, applyGestureView, publishMeasurePointer]);

  const nudgeGridPan = useCallback(
    (dxScreen: number, dyScreen: number) => {
      if (!scene || !activeSceneId) return;
      const nextStageX = stageX + dxScreen;
      const nextStageY = stageY + dyScreen;
      const dxWorld = dxScreen / scale;
      const dyWorld = dyScreen / scale;

      setViewport({ x: nextStageX, y: nextStageY });
      updateScene(activeSceneId, (s) => ({
        ...s,
        maps: sceneMaps(s).map((m) => ({
          ...m,
          transform: {
            ...m.transform,
            x: m.transform.x - dxWorld,
            y: m.transform.y - dyWorld,
          },
        })),
      }));
    },
    [activeSceneId, scene, scale, setViewport, stageX, stageY, updateScene],
  );

  const nudgeGridZoom = useCallback(
    (factor: number) => {
      if (!scene || !activeSceneId) return;
      const oldScale = scale;
      const nextScale = Math.min(4, Math.max(0.15, oldScale * factor));
      if (nextScale === oldScale) return;

      const pivotScreen = { x: size.width / 2, y: size.height / 2 };
      const pivotWorld = screenToWorld(pivotScreen, stagePos, oldScale);
      const nextStageX = pivotScreen.x - pivotWorld.x * nextScale;
      const nextStageY = pivotScreen.y - pivotWorld.y * nextScale;

      updateScene(activeSceneId, (s) => ({
        ...s,
        maps: sceneMaps(s).map((m) => {
          const prevMt = m.transform;
          const oldMapOriginScreenX = prevMt.x * oldScale + stageX;
          const oldMapOriginScreenY = prevMt.y * oldScale + stageY;
          return {
            ...m,
            transform: {
              ...prevMt,
              x: (oldMapOriginScreenX - nextStageX) / nextScale,
              y: (oldMapOriginScreenY - nextStageY) / nextScale,
              scale: (prevMt.scale * oldScale) / nextScale,
            },
          };
        }),
      }));

      setViewport({ scale: nextScale, x: nextStageX, y: nextStageY });
    },
    [
      activeSceneId,
      scene,
      scale,
      setViewport,
      size.height,
      size.width,
      stagePos,
      stageX,
      stageY,
      updateScene,
    ],
  );

  const selectedDrawStrokes =
    scene && selectedDrawStrokeIds.length > 0
      ? (scene.drawStrokes ?? []).filter((s) => selectedDrawStrokeIds.includes(s.id))
      : [];

  useEffect(() => {
    if (activeTool !== 'select' || !activeSceneId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      if (e.key === 'Delete') {
        const { selectedTokenIds, selectedDrawStrokeIds, selectedMeasurementId, selectDrawShapes } =
          useStore.getState();
        const hasSelection =
          selectedTokenIds.length > 0 ||
          (selectDrawShapes && selectedDrawStrokeIds.length > 0) ||
          selectedMeasurementId != null;
        if (!hasSelection) return;
        e.preventDefault();
        deleteSelection(activeSceneId);
        return;
      }

      if (selectedDrawStrokeIds.length === 0) return;

      const selectSnap = useStore.getState().selectSnap;
      const baseStep = selectSnap <= 0 ? 1 : GRID_SIZE_PX * selectSnap;
      const step = baseStep * (e.shiftKey ? 5 : 1);
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      const currentScene = useStore.getState().campaign?.scenes[activeSceneId];
      if (!currentScene) return;
      const strokes = selectedDrawStrokeIds
        .map((id) => currentScene.drawStrokes?.find((s) => s.id === id))
        .filter((stroke): stroke is NonNullable<typeof stroke> => stroke != null);
      if (strokes.length === 0) return;
      if (!canSessionMoveDrawStrokes(selectedDrawStrokeIds)) return;
      updateDrawStrokes(activeSceneId, shiftDrawStrokes(strokes, { x: dx, y: dy }));
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSceneId, activeTool, deleteSelection, selectedDrawStrokeIds, updateDrawStrokes]);

  useEffect(() => {
    if (activeTool !== 'select' || !activeSceneId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      if (!e.shiftKey || (e.key !== 'd' && e.key !== 'D')) return;

      e.preventDefault();
      duplicateSelection(activeSceneId);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSceneId, activeTool, duplicateSelection]);

  useEffect(() => {
    if (
      !GRID_SNAP_KEYBOARD_TOOLS.includes(activeTool as (typeof GRID_SNAP_KEYBOARD_TOOLS)[number]) &&
      interactionMode !== 'scaling'
    ) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;
      if (useStore.getState().ephemeralDrawText) return;

      if (e.code !== 'Space') return;

      e.preventDefault();
      const { selectSnap, setSelectSnap } = useStore.getState();
      setSelectSnap(nextGridSnapCycleValue(selectSnap));
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, interactionMode]);

  useEffect(() => {
    if (editTool !== 'mapEdit') return;
    if (!selectedMapLayerId || !activeSceneId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      if (e.key === 'Delete') {
        e.preventDefault();
        confirmDeleteMapLayer(selectedMapLayerId);
        return;
      }

      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -GRID_SIZE_PX;
      else if (e.key === 'ArrowRight') dx = GRID_SIZE_PX;
      else if (e.key === 'ArrowUp') dy = -GRID_SIZE_PX;
      else if (e.key === 'ArrowDown') dy = GRID_SIZE_PX;
      else return;

      const currentScene = useStore.getState().campaign?.scenes[activeSceneId];
      const layer = currentScene
        ? sceneMaps(currentScene).find((m) => m.id === selectedMapLayerId)
        : null;
      if (!layer) return;

      e.preventDefault();
      updateMapLayerTransform(
        activeSceneId,
        selectedMapLayerId,
        {
          x: layer.transform.x + dx,
          y: layer.transform.y + dy,
        },
        { recenter: true },
      );
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSceneId,
    confirmDeleteMapLayer,
    editTool,
    selectedMapLayerId,
    updateMapLayerTransform,
  ]);

  useEffect(() => {
    if (editTool !== 'gridEdit') return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't steal keys while typing.
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      // Nudge in screen pixels for consistent feel.
      const baseScreenPx = 1;
      const step = e.shiftKey ? baseScreenPx * 10 : baseScreenPx;

      let dx = 0;
      let dy = 0;
      // Pan camera; map is counter-adjusted so grid appears to move.
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      nudgeGridPan(dx, dy);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editTool, nudgeGridPan]);

  useEffect(() => {
    if (activeTool !== 'select' && activeTool !== 'transform') return;
    if (selectedTokenIds.length === 0) return;
    if (!scene || !activeSceneId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      const selectSnap = useStore.getState().selectSnap;
      const { role, playerView } = useStore.getState();
      const movingAsPlayer = seesAsPlayer(role, playerView);
      const gridOffset = scene.gridOffset ?? DEFAULT_GRID_OFFSET;
      const baseStep = selectSnap <= 0 ? 1 : GRID_SIZE_PX * selectSnap;
      const step = baseStep * (e.shiftKey ? 5 : 1);
      let dcol = 0;
      let drow = 0;
      if (e.key === 'ArrowLeft') dcol = -step;
      else if (e.key === 'ArrowRight') dcol = step;
      else if (e.key === 'ArrowUp') drow = -step;
      else if (e.key === 'ArrowDown') drow = step;
      else return;

      e.preventDefault();
      for (const id of useStore.getState().selectedTokenIds) {
        const token = scene.tokens.find((t) => t.id === id);
        if (!token || !canMoveToken(token)) continue;
        const start: TokenGridPlacement = {
          gridPos: token.gridPos,
          posOffset: token.posOffset ? { ...token.posOffset } : undefined,
        };
        const placement = moveTokenPlacementByWorldDelta(
          start,
          dcol,
          drow,
          selectSnap,
          gridOffset,
        );
        if (
          movingAsPlayer &&
          isTokenPlacementCompletelyHiddenFromPlayer(
            token,
            placement,
            scene.fog,
            scene,
            gridOffset,
          )
        ) {
          continue;
        }
        updateToken(activeSceneId, id, {
          gridPos: placement.gridPos,
          posOffset: placement.posOffset,
        });
      }
      setMovePreviewPositions(null);
      setInteractionMode('selected');
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSceneId,
    activeTool,
    scene,
    selectedTokenIds,
    setInteractionMode,
    setMovePreviewPositions,
    updateToken,
  ]);

  useEffect(() => {
    if (activeTool !== 'draw') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowDrawToolKeyboardShortcut(e.target)) return;
      if (useStore.getState().ephemeralDrawText) return;

      const { drawShape, cycleDrawTextFont } = useStore.getState();
      if (drawShape === 'text' && e.key === 'Tab') {
        e.preventDefault();
        cycleDrawTextFont();
        return;
      }
      if (drawShape === 'text' && handleDrawTextStyleShortcut(e)) return;

      const shape = drawShapeForKey(e.key, e.code);
      if (shape) {
        e.preventDefault();
        useStore.getState().setDrawShape(shape);
        return;
      }

      const delta = drawStrokeWidthKeyboardDelta(e);
      if (delta == null) return;

      e.preventDefault();
      const { drawStrokeWidth, setDrawStrokeWidth } = useStore.getState();
      setDrawStrokeWidth(stepDrawStrokeWidth(drawStrokeWidth, delta));
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== 'draw' || drawShape !== 'erase') setErasePreview(null);
  }, [activeTool, drawShape]);

  useEffect(() => {
    if (activeTool !== 'draw' || drawShape !== 'erase') return;
    setErasePreview((prev) =>
      prev ? { ...prev, radius: eraserRadiusWorld(viewScale) } : prev,
    );
  }, [activeTool, drawShape, viewScale]);

  useEffect(() => {
    if (activeTool !== 'fog' && activeTool !== 'measure') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalHotkey(e.target)) return;

      if (activeTool === 'fog') {
        if (!canEditFog()) return;

        if (e.key === 'Tab') {
          e.preventDefault();
          const { fogMode, setFogMode } = useStore.getState();
          setFogMode(fogMode === 'hide' ? 'reveal' : 'hide');
          return;
        }

        const shape = fogShapeForKey(e.key, e.code);
        if (!shape) return;
        e.preventDefault();
        useStore.getState().setFogShape(shape);
        return;
      }

      if (isMeasurePinToggleKey(e.key)) {
        if (e.repeat) return;
        e.preventDefault();
        const { measurePinMode, setMeasurePinMode } = useStore.getState();
        setMeasurePinMode(!measurePinMode);
        return;
      }

      const kind = measureKindForKey(e.key, e.code);
      if (!kind) return;
      e.preventDefault();
      useStore.getState().setMeasureKind(kind);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool]);

  useEffect(() => {
    if (activeTool !== 'fog' || !canEditFog()) return;

    let previewBeforeShift: boolean | null = null;

    const restorePreview = () => {
      if (previewBeforeShift === null) return;
      useStore.getState().setFogOpaquePreview(previewBeforeShift);
      previewBeforeShift = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isShiftKey(e.key) || e.repeat || shouldIgnoreGlobalHotkey(e.target)) return;
      const { fogOpaquePreview, setFogOpaquePreview } = useStore.getState();
      previewBeforeShift = fogOpaquePreview;
      if (!fogOpaquePreview) setFogOpaquePreview(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isShiftKey(e.key)) return;
      restorePreview();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', restorePreview);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', restorePreview);
      restorePreview();
    };
  }, [activeTool]);

  useEffect(() => {
    if (activeTool === 'transform' && selectedTokenIds.length === 0) {
      useStore.getState().setTool('select');
    }
  }, [activeTool, selectedTokenIds]);

  if (!scene) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Select or create a scene
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-slate-950"
      style={{ touchAction: 'none' }}
      onPointerDownCapture={onContainerPointerDownCapture}
      onPointerMoveCapture={onContainerPointerMoveCapture}
      onPointerUpCapture={onContainerPointerUpCapture}
      onPointerCancelCapture={onContainerPointerUpCapture}
      onMouseLeave={() => {
        publishMeasurePointer(null);
        if (activeTool === 'draw' && drawShape === 'erase' && !drawStart.current) {
          setErasePreview(null);
        }
      }}
    >
      <SnapControl />
      {marquee && (
        <div
          className="pointer-events-none absolute z-30 border border-sky-400 bg-sky-400/15"
          style={{
            left: Math.min(marquee.from.x, marquee.to.x),
            top: Math.min(marquee.from.y, marquee.to.y),
            width: Math.abs(marquee.to.x - marquee.from.x),
            height: Math.abs(marquee.to.y - marquee.from.y),
          }}
        />
      )}
      {editTool === 'mapEdit' &&
        activeSceneId &&
        mapEditOverlays.map((layer) => (
          <MapEditOverlay
            key={layer.id}
            mapUrl={assetUrls[layer.assetId]}
            mapTransform={layer.transform}
            imageWidth={layer.imageWidth}
            imageHeight={layer.imageHeight}
            selected={layer.id === selectedMapLayerId}
            stagePos={stagePos}
            viewScale={viewScale}
            containerRef={containerRef}
            onSelect={() => setSelectedMapLayerId(layer.id)}
            onBringToFront={() => bringMapLayerToFront(activeSceneId, layer.id)}
            onTransform={(next) =>
              updateMapLayerTransform(activeSceneId, layer.id, next)
            }
            onEditEnd={() => recenterGridToMaps(activeSceneId)}
            onDelete={() => confirmDeleteMapLayer(layer.id)}
          />
        ))}
      {scene && (
        <PeerDrawSelectionOverlay
          strokes={scene.drawStrokes ?? []}
          stagePos={stagePos}
          viewScale={viewScale}
          gridOffset={gridOffset}
          showLocalMarquee={
            selectedDrawStrokeIds.length > 0 &&
            !(activeTool === 'select' && selectDrawShapes)
          }
        />
      )}
      {activeTool === 'select' &&
        selectDrawShapes &&
        activeSceneId &&
        selectedDrawStrokes.length > 0 && (
          <DrawStrokeEditOverlay
            key={selectedDrawStrokeIds.join(',')}
            strokes={selectedDrawStrokes}
            stagePos={stagePos}
            viewScale={viewScale}
            gridOffset={gridOffset}
            containerRef={containerRef}
            onBringToFront={() => bringDrawStrokesToFront(activeSceneId, selectedDrawStrokeIds)}
            onUpdateAll={(next) => updateDrawStrokes(activeSceneId, next)}
            onDelete={() => removeDrawStrokes(activeSceneId, [...selectedDrawStrokeIds])}
          />
        )}
      {editTool === 'gridEdit' && (
        <div className="pointer-events-auto absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg bg-slate-900/80 p-2 backdrop-blur">
          <button
            type="button"
            className="h-9 w-9 rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600"
            onClick={() => nudgeGridZoom(1 / 1.01)}
            title="Nudge grid smaller"
          >
            −
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-md bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600"
            onClick={() => nudgeGridZoom(1.01)}
            title="Nudge grid larger"
          >
            +
          </button>
        </div>
      )}
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={viewScale}
        scaleY={viewScale}
        x={view.x}
        y={view.y}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={() => onPointerUp('stage')}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={() => onPointerUp('stage')}
      >
        <Layer>
          {maps.map((layer) => (
            <BackgroundLayer
              key={layer.id}
              mapUrl={assetUrls[layer.assetId]}
              mapTransform={layer.transform}
            />
          ))}
        </Layer>
        <Layer listening={false}>
          <GridLayer
            visible={gridVisible}
            gridOffset={gridOffset}
            previewSizePx={gridPreviewSizePx}
            previewOffset={
              gridPreviewSizePx != null && gridAnchor.current
                ? { x: gridAnchor.current.x, y: gridAnchor.current.y }
                : null
            }
            stageWidth={size.width}
            stageHeight={size.height}
            stagePos={stagePos}
            scale={viewScale}
          />
        </Layer>
        <Layer>
          <ConnectedTokenLayer
            tokens={viewerTokens}
            assetUrls={assetUrls}
            selectedTokenIds={selectedTokenIds}
            measureHighlightColors={tokenHighlightColors}
            gmShowsHiddenTokens={isGm}
            onTokenTap={noopTokenTap}
            onTokenHover={(id) => {
              if (id && asPlayer && scene) {
                const token = viewerTokens.find((t) => t.id === id);
                if (
                  !token ||
                  !isTokenSelectableByPlayer(token, scene.fog, scene, gridOffset)
                ) {
                  setHoveredTokenId(null);
                  return;
                }
                const ptr = getPointer();
                if (ptr) {
                  const world = getWorld(ptr);
                  if (isWorldPointHiddenFromPlayer(world, scene.fog, scene)) {
                    setHoveredTokenId(null);
                    return;
                  }
                }
              }
              setHoveredTokenId(id);
            }}
          />
        </Layer>
        <Layer listening={!asPlayer}>
            <FogLayer
              fog={scene.fog}
              gridOffset={gridOffset}
              scene={scene}
              viewWorldBounds={viewportWorldBounds(stagePos, viewScale, size)}
            />
        </Layer>
        <Layer listening={false}>
          <MeasurementLayer
            measurements={viewerMeasurements}
            ephemeral={ephemeralMeasure}
            remoteEphemeral={viewerRemoteEphemeral}
            alternatingDiagonals={alternatingDiagonals}
            debugDualView={measureDebugDualView}
            viewScale={viewScale}
            fadingMeasurements={fadingMeasurements}
            sessionColor={measureColor}
          />
        </Layer>
        <Layer listening={false}>
          <ConnectedDrawLayer
            strokes={scene.drawStrokes ?? []}
            preview={drawPreview}
            erasePreview={erasePreview}
            hideLocalEphemeralText={!!ephemeralDrawText}
          />
          {ephemeralDrawText && (
            <DrawTextEditOverlay
              ephemeral={ephemeralDrawText}
              caretVisible={textCaretVisible}
              selection={drawTextSelection}
            />
          )}
          {activeTool === 'draw' &&
            drawShape === 'text' &&
            !ephemeralDrawText &&
            measurePointerScreen && (
              <DrawTextCursorPlaceholder
                world={screenToWorld(measurePointerScreen, stagePos, viewScale)}
                color={drawColor}
                fontSize={drawTextFontSize(drawStrokeWidth)}
                fontFamily={drawTextFont}
                bold={drawTextBold}
                italic={drawTextItalic}
                underline={drawTextUnderline}
                visible
              />
            )}
        </Layer>
        <Layer>
          <MeasurementLabelsLayer
            measurements={viewerMeasurements}
            ephemeral={ephemeralMeasure}
            remoteEphemeral={viewerRemoteEphemeral}
            alternatingDiagonals={alternatingDiagonals}
            viewScale={viewScale}
            stagePos={stagePos}
            pointerScreen={measurePointerScreen}
            fadingMeasurements={fadingMeasurements}
            onDismissMeasurement={(id) => {
              if (activeSceneId) fadeAndRemoveMeasurement(activeSceneId, id);
            }}
          />
        </Layer>
      </Stage>
      {ephemeralDrawText && activeSceneId && (
        <DrawTextInputHost
          ephemeral={ephemeralDrawText}
          activeSceneId={activeSceneId}
          onSelectionChange={setDrawTextSelection}
        />
      )}
      {interactionMode === 'scaling' && activeSceneId && (
        <TokenScaleOverlay
          tokens={scene.tokens}
          assetUrls={assetUrls}
          stagePos={stagePos}
          viewScale={viewScale}
          gridOffset={gridOffset}
          containerRef={containerRef}
        />
      )}
    </div>
  );
}
