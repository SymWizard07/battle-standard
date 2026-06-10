import { useCallback, useEffect, useRef } from 'react';
import { canEditToken } from '../sync/yjsProvider';
import { DEFAULT_GRID_OFFSET } from '../lib/fixedGrid';
import { screenToWorld } from '../lib/grid';
import type { MapCorner } from '../lib/mapGeometry';
import type { Point, Token, TokenGridPlacement } from '../lib/types';
import {
  boundsToScreen,
  cornerCursor,
  cornerHandleScreen,
  cornerHandleWorld,
  footprintAndPlacementFromCornerDrag,
  oppositeScaleCorner,
  tokenImageAspectRatio,
  tokenSelectionMarqueeWorldBounds,
  unionWorldBounds,
  type TokenScaleCorner,
  type TokenFootprint,
  type TokenWorldBounds,
} from '../lib/tokenScale';
import { useStore } from '../store/useStore';

const HANDLE_PX = 10;
/** Invisible grab area around each visible handle (touch-friendly). */
const HANDLE_HIT_PX = 36;
const CLICK_THRESHOLD = 5;
const CORNERS: TokenScaleCorner[] = ['nw', 'ne', 'se', 'sw'];

type Props = {
  tokens: Token[];
  assetUrls: Record<string, string>;
  stagePos: Point;
  viewScale: number;
  gridOffset?: Point;
  containerRef: React.RefObject<HTMLDivElement | null>;
};

function clientToLocal(clientX: number, clientY: number, container: HTMLDivElement) {
  const rect = container.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function TokenScaleOverlay({
  tokens,
  assetUrls,
  stagePos,
  viewScale,
  gridOffset = DEFAULT_GRID_OFFSET,
  containerRef,
}: Props) {
  const activeSceneId = useStore((s) => s.activeSceneId);
  const selectedTokenIds = useStore((s) => s.selectedTokenIds);
  const scalePreviewById = useStore((s) => s.scalePreviewById);
  const setScalePreviewById = useStore((s) => s.setScalePreviewById);
  const commitTokenScale = useStore((s) => s.commitTokenScale);
  const cancelTokenScale = useStore((s) => s.cancelTokenScale);

  const stagePosRef = useRef(stagePos);
  stagePosRef.current = stagePos;
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;
  const gridOffsetRef = useRef(gridOffset);
  gridOffsetRef.current = gridOffset;
  const assetUrlsRef = useRef(assetUrls);
  assetUrlsRef.current = assetUrls;

  const scaleIds = selectedTokenIds.filter((id) => {
    const t = tokens.find((tok) => tok.id === id);
    return t && canEditToken(t);
  });
  const scaleIdsRef = useRef(scaleIds);
  scaleIdsRef.current = scaleIds;

  const startFootprintsRef = useRef<Record<string, TokenFootprint>>({});
  const startMarqueeBoundsRef = useRef<Record<string, TokenWorldBounds>>({});
  const imageAspectByIdRef = useRef<Record<string, number | null>>({});
  const imageUrlByIdRef = useRef<Record<string, string | undefined>>({});
  const fixedMarqueeCornerRef = useRef<Record<string, Point>>({});
  const dragCornerRef = useRef<TokenScaleCorner | null>(null);
  const backdropDownRef = useRef<Point | null>(null);
  const handleDragRef = useRef(false);

  useEffect(() => {
    const starts: Record<string, TokenFootprint> = {};
    const marquees: Record<string, TokenWorldBounds> = {};
    const aspects: Record<string, number | null> = {};
    const urlsById: Record<string, string | undefined> = {};
    const off = gridOffsetRef.current;
    const urls = assetUrlsRef.current;

    for (const id of scaleIdsRef.current) {
      const t = tokens.find((tok) => tok.id === id)!;
      starts[id] = { ...t.footprint };
      const imageUrl = t.imageAssetId ? urls[t.imageAssetId] : undefined;
      urlsById[id] = imageUrl;
      aspects[id] = tokenImageAspectRatio(imageUrl);
      marquees[id] = tokenSelectionMarqueeWorldBounds(off, t.footprint, t, imageUrl);
    }
    startFootprintsRef.current = starts;
    startMarqueeBoundsRef.current = marquees;
    imageAspectByIdRef.current = aspects;
    imageUrlByIdRef.current = urlsById;
    fixedMarqueeCornerRef.current = {};

    setScalePreviewById(null);
  }, []);

  const tokenForBounds = useCallback(
    (token: Token) => {
      const preview = scalePreviewById?.[token.id];
      if (!preview) return token;
      return {
        ...token,
        footprint: preview.footprint,
        gridPos: preview.placement.gridPos,
        posOffset: preview.placement.posOffset,
      };
    },
    [scalePreviewById],
  );

  const currentUnionBounds = useCallback((): TokenWorldBounds | null => {
    const off = gridOffsetRef.current;
    const urls = assetUrlsRef.current;
    const bounds = scaleIds
      .map((id) => tokens.find((t) => t.id === id))
      .filter((t): t is Token => t != null)
      .map((t) => {
        const live = tokenForBounds(t);
        const imageUrl = live.imageAssetId ? urls[live.imageAssetId] : undefined;
        return tokenSelectionMarqueeWorldBounds(
          off,
          live.footprint,
          live,
          imageUrl,
        );
      });
    return unionWorldBounds(bounds);
  }, [scaleIds, tokens, tokenForBounds]);

  const applyCornerDrag = useCallback(
    (corner: TokenScaleCorner, pointerWorld: Point) => {
      const snap = useStore.getState().selectSnap;
      const off = gridOffsetRef.current;

      const previews: Record<
        string,
        { footprint: { w: number; h: number }; placement: TokenGridPlacement }
      > = {};

      for (const id of scaleIdsRef.current) {
        const startFp = startFootprintsRef.current[id];
        const fixedMarquee = fixedMarqueeCornerRef.current[id];
        if (!startFp || !fixedMarquee) continue;
        const { footprint, placement } = footprintAndPlacementFromCornerDrag(
          corner,
          fixedMarquee,
          pointerWorld,
          imageUrlByIdRef.current[id],
          startFp,
          imageAspectByIdRef.current[id] ?? null,
          snap,
          off,
        );
        previews[id] = { footprint, placement };
      }
      if (Object.keys(previews).length > 0) {
        setScalePreviewById(previews);
      }
    },
    [setScalePreviewById],
  );

  const applyCornerDragRef = useRef(applyCornerDrag);
  applyCornerDragRef.current = applyCornerDrag;

  const finishScale = useCallback(() => {
    if (!activeSceneId) {
      cancelTokenScale();
      return;
    }
    commitTokenScale(activeSceneId);
  }, [activeSceneId, commitTokenScale, cancelTokenScale]);

  const onWindowPointerMoveRef = useRef<(e: PointerEvent) => void>(() => undefined);
  const onWindowPointerUpRef = useRef<(e: PointerEvent) => void>(() => undefined);

  const detachWindowListeners = useCallback(() => {
    window.removeEventListener('pointermove', onWindowPointerMoveRef.current);
    window.removeEventListener('pointerup', onWindowPointerUpRef.current);
    window.removeEventListener('pointercancel', onWindowPointerUpRef.current);
  }, []);

  const resetDragState = useCallback(() => {
    detachWindowListeners();
    dragCornerRef.current = null;
    fixedMarqueeCornerRef.current = {};
    handleDragRef.current = false;
  }, [detachWindowListeners]);

  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    const corner = dragCornerRef.current;
    const container = containerRef.current;
    if (!corner || !container) return;
    const ptr = clientToLocal(e.clientX, e.clientY, container);
    const world = screenToWorld(ptr, stagePosRef.current, viewScaleRef.current);
    applyCornerDragRef.current(corner, world);
  }, [containerRef]);

  const onWindowPointerUp = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  onWindowPointerMoveRef.current = onWindowPointerMove;
  onWindowPointerUpRef.current = onWindowPointerUp;

  const startWindowDrag = useCallback(
    (e: React.PointerEvent) => {
      detachWindowListeners();
      e.preventDefault();
      e.stopPropagation();
      backdropDownRef.current = null;
      handleDragRef.current = true;
      window.addEventListener('pointermove', onWindowPointerMoveRef.current);
      window.addEventListener('pointerup', onWindowPointerUpRef.current);
      window.addEventListener('pointercancel', onWindowPointerUpRef.current);
    },
    [detachWindowListeners],
  );

  useEffect(() => () => resetDragState(), [resetDragState]);

  useEffect(() => {
    if (scaleIds.length === 0) {
      cancelTokenScale();
    }
  }, [scaleIds.length, cancelTokenScale]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (useStore.getState().interactionMode !== 'scaling') return;
      e.preventDefault();
      cancelTokenScale();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelTokenScale]);

  const onBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    backdropDownRef.current = { x: e.clientX, y: e.clientY };
  };

  const onBackdropPointerUp = (e: React.PointerEvent) => {
    if (handleDragRef.current) return;
    const down = backdropDownRef.current;
    backdropDownRef.current = null;
    if (!down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (dist < CLICK_THRESHOLD) {
      finishScale();
    }
  };

  const onHandlePointerDown = (corner: MapCorner, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const fixedById: Record<string, Point> = {};
    for (const id of scaleIdsRef.current) {
      const marquee = startMarqueeBoundsRef.current[id];
      if (!marquee) continue;
      fixedById[id] = cornerHandleWorld(oppositeScaleCorner(corner), marquee);
    }
    if (Object.keys(fixedById).length === 0) return;

    fixedMarqueeCornerRef.current = fixedById;
    dragCornerRef.current = corner;
    startWindowDrag(e);

    const container = containerRef.current;
    if (container) {
      const ptr = clientToLocal(e.clientX, e.clientY, container);
      const world = screenToWorld(ptr, stagePosRef.current, viewScaleRef.current);
      applyCornerDragRef.current(corner, world);
    }
  };

  const union = currentUnionBounds();
  if (!union || scaleIds.length === 0) return null;

  const box = boundsToScreen(union, stagePos, viewScale);
  if (box.width < 2 || box.height < 2) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      <div
        className="pointer-events-auto absolute inset-0 touch-none"
        style={{ zIndex: 10 }}
        onPointerDown={onBackdropPointerDown}
        onPointerUp={onBackdropPointerUp}
      />
      <div
        className="pointer-events-none absolute border-2 border-sky-400/90"
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          zIndex: 11,
        }}
      />
      {CORNERS.map((corner) => {
        const screen = cornerHandleScreen(corner, union, stagePos, viewScale);
        return (
          <div
            key={corner}
            className="pointer-events-auto absolute touch-none"
            style={{
              left: screen.x,
              top: screen.y,
              width: HANDLE_HIT_PX,
              height: HANDLE_HIT_PX,
              transform: 'translate(-50%, -50%)',
              cursor: cornerCursor(corner),
              zIndex: 12,
            }}
            onPointerDown={(e) => onHandlePointerDown(corner, e)}
          >
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-sm border-2 border-white bg-sky-500 shadow-md"
              style={{
                width: HANDLE_PX,
                height: HANDLE_PX,
                transform: 'translate(-50%, -50%)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
