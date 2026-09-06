import { Circle, Group, Image, Line, Rect } from 'react-konva';
import { memo, useEffect, useMemo, useState } from 'react';
import { usePeerTokenSelectionColors } from '../../hooks/usePeerSelections';
import { useRemoteMotionDisplay } from '../../hooks/useRemoteMotion';
import { defaultPlayerColor } from '../../lib/playerColor';
import { useImageOpaqueShape } from '../../hooks/useImageOpaqueBounds';
import { statusMeta } from '../../lib/statusEffects';
import { BLOODIED_ICON } from '../../lib/tokenVitality';
import {
  selectionCircleFromOpaqueShape,
  selectionRectFromOpaqueBounds,
} from '../../lib/imageOpaqueBounds';
import { tokenWorldTopLeft } from '../../lib/grid';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { GM_HIDDEN_TOKEN_OPACITY, isTokenVisibleToPlayers } from '../../lib/tokenVisibility';
import {
  imageTransformToLocalPx,
  outlineToLocalPx,
} from '../../lib/tokenImageFit';
import type { Token, TokenGridPlacement } from '../../lib/types';
import { TokenStyledNameText } from './TokenStyledNameText';
import { useStore } from '../../store/useStore';
const STATUS_ICON_SIZE = 22;
const STATUS_ICON_PAD = 3;

function StatusIconBadge({
  x,
  y,
  meta,
}: {
  x: number;
  y: number;
  meta: ReturnType<typeof statusMeta>;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!meta?.icon) return;
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setImg(image);
    image.src = meta.icon;
  }, [meta?.icon]);

  const half = STATUS_ICON_SIZE / 2;
  const inner = STATUS_ICON_SIZE - STATUS_ICON_PAD * 2;
  const innerOffset = -half + STATUS_ICON_PAD;

  return (
    <Group x={x} y={y} listening={false}>
      <Circle
        x={0}
        y={0}
        radius={half}
        fill="rgba(15, 23, 42, 0.88)"
        stroke={meta?.color ?? '#64748b'}
        strokeWidth={2}
      />
      {img ? (
        <Image
          image={img}
          x={innerOffset}
          y={innerOffset}
          width={inner}
          height={inner}
        />
      ) : (
        <Circle
          x={0}
          y={0}
          radius={half - STATUS_ICON_PAD}
          fill={meta?.color ?? '#64748b'}
          listening={false}
        />
      )}
    </Group>
  );
}

function useLoadedImage(src: string | undefined) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let cancelled = false;
    setImg(null);
    const image = new window.Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      if (!cancelled) setImg(image);
    };
    image.onerror = () => {
      if (!cancelled) setImg(null);
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);
  return img;
}

interface Props {
  tokens: Token[];
  assetUrls: Record<string, string>;
  selectedTokenIds: string[];
  /** Ephemeral measure preview: token id → outline stroke color (does not select). */
  measureHighlightColors?: ReadonlyMap<string, string>;
  peerTokenSelectionColors?: ReadonlyMap<string, string>;
  sessionSelectionColor: string;
  movePreviewPositions: Record<string, TokenGridPlacement> | null;
  scalePreviewById: Record<
    string,
    { footprint: { w: number; h: number }; placement: TokenGridPlacement }
  > | null;
  /** Hide tokens being dragged when the pointer leaves the map. */
  hideMovingOffMap?: boolean;
  /** GM view: render player-hidden tokens at reduced opacity. */
  gmShowsHiddenTokens?: boolean;
  /** When set, these tokens render at reduced opacity (e.g. already in initiative). */
  dimmedTokenIds?: ReadonlySet<string>;
  onTokenTap: (tokenId: string) => void;
  onTokenHover: (tokenId: string | null) => void;
}

function tokenPreviewEqual(
  a: TokenGridPlacement | null | undefined,
  b: TokenGridPlacement | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.gridPos.col === b.gridPos.col &&
    a.gridPos.row === b.gridPos.row &&
    (a.posOffset?.x ?? 0) === (b.posOffset?.x ?? 0) &&
    (a.posOffset?.y ?? 0) === (b.posOffset?.y ?? 0)
  );
}

const TokenSelectionOutline = memo(function TokenSelectionOutline({
  selectionCircle,
  selectionRect,
  imgUrl,
  stroke,
}: {
  selectionCircle: ReturnType<typeof selectionCircleFromOpaqueShape>;
  selectionRect: ReturnType<typeof selectionRectFromOpaqueBounds>;
  imgUrl?: string;
  stroke: string;
}) {
  if (selectionCircle) {
    return (
      <Circle
        x={selectionCircle.x}
        y={selectionCircle.y}
        radius={selectionCircle.radius}
        stroke={stroke}
        strokeWidth={3}
        listening={false}
      />
    );
  }
  return (
    <Rect
      x={selectionRect.x}
      y={selectionRect.y}
      width={selectionRect.width}
      height={selectionRect.height}
      stroke={stroke}
      strokeWidth={3}
      cornerRadius={imgUrl ? 0 : 6}
      listening={false}
    />
  );
});

function footprintEqual(
  a: { w: number; h: number } | null | undefined,
  b: { w: number; h: number } | null | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.w === b.w && a.h === b.h;
}

const TokenNode = memo(function TokenNode({
  token,
  assetUrls,
  selected,
  highlightColor,
  previewPlacement,
  previewFootprint,
  selectionColor,
  peerSelectionColor,
  gmShowsHiddenTokens,
  dimmed = false,
}: {
  token: Token;
  assetUrls: Record<string, string>;
  selected: boolean;
  highlightColor?: string;
  previewPlacement: TokenGridPlacement | null;
  previewFootprint: { w: number; h: number } | null;
  selectionColor: string;
  peerSelectionColor?: string;
  gmShowsHiddenTokens: boolean;
  dimmed?: boolean;
}) {
  const tl = previewPlacement
    ? tokenWorldTopLeft(previewPlacement)
    : tokenWorldTopLeft(token);
  const footprint = previewFootprint ?? token.footprint;
  const w = footprint.w * GRID_SIZE_PX;
  const h = footprint.h * GRID_SIZE_PX;
  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;
  const imgUrl = token.imageAssetId ? assetUrls[token.imageAssetId] : undefined;
  const tokenImg = useLoadedImage(imgUrl);
  const bloodiedImg = useLoadedImage(
    token.vitalityState === 'bloodied' ? BLOODIED_ICON : undefined,
  );
  const opaqueShape = useImageOpaqueShape(imgUrl, tokenImg);
  const hasImageShape = Boolean(imgUrl && opaqueShape);
  const explicitOutline = token.outline
    ? outlineToLocalPx(footprint, token.outline, 2)
    : null;
  const selectionCircle = explicitOutline
    ? explicitOutline.kind === 'circle'
      ? {
          x: explicitOutline.x,
          y: explicitOutline.y,
          radius: explicitOutline.radius,
        }
      : null
    : selectionCircleFromOpaqueShape(
        hasImageShape ? opaqueShape : null,
        w,
        h,
        2,
      );
  const selectionRect = explicitOutline
    ? explicitOutline.kind === 'rect'
      ? {
          x: explicitOutline.x,
          y: explicitOutline.y,
          width: explicitOutline.width,
          height: explicitOutline.height,
        }
      : {
          x: -4,
          y: -4,
          width: w + 8,
          height: h + 8,
        }
    : selectionRectFromOpaqueBounds(
        hasImageShape && opaqueShape?.kind === 'rect' ? opaqueShape.bounds : null,
        w,
        h,
        imgUrl ? 2 : 4,
      );
  const imageLocal = imageTransformToLocalPx(footprint, token.imageTransform);
  const statusEffects = token.statusEffects ?? [];
  const n = statusEffects.length;
  const ringR = Math.max(w, h) / 2 + STATUS_ICON_SIZE / 2 + 2;

  const deadPad = Math.min(w, h) * 0.12;
  const deadStroke = Math.max(3, Math.min(w, h) * 0.09);
  const deadOutline = deadStroke + 2;
  const deadX1 = deadPad;
  const deadY1 = deadPad;
  const deadX2 = w - deadPad;
  const deadY2 = h - deadPad;
  const bloodiedSize = Math.min(w, h) * 0.55;
  const bloodiedX = (w - bloodiedSize) / 2;
  const bloodiedY = (h - bloodiedSize) / 2;
  const ghostHidden =
    gmShowsHiddenTokens && !isTokenVisibleToPlayers(token);
  const baseOpacity = ghostHidden ? GM_HIDDEN_TOKEN_OPACITY : 1;
  const opacity = dimmed ? baseOpacity * 0.35 : baseOpacity;
  const outlineStroke = selected
    ? selectionColor
    : (peerSelectionColor ?? highlightColor);
  const showOutline =
    Boolean(outlineStroke) &&
    (Boolean(token.outline) ||
      !imgUrl ||
      hasImageShape ||
      selected ||
      Boolean(peerSelectionColor));
  // Placeholder while asset URL is missing, image is still loading, or load failed.
  const showPlaceholder = !tokenImg;

  return (
    <Group
      x={tl.x}
      y={tl.y}
      rotation={token.rotation ?? 0}
      offsetX={0}
      offsetY={0}
      opacity={opacity}
    >
      {showOutline ? (
        <TokenSelectionOutline
          selectionCircle={selectionCircle}
          selectionRect={selectionRect}
          imgUrl={imgUrl}
          stroke={outlineStroke!}
        />
      ) : null}
      {showPlaceholder ? (
        <Group listening={false}>
          <Rect
            width={w}
            height={h}
            fill={token.color || '#64748b'}
            opacity={0.85}
            cornerRadius={6}
            stroke="#0f172a"
            strokeWidth={2}
          />
          <TokenStyledNameText
            raw={token.name ?? ''}
            width={w}
            height={h}
            fontSize={Math.min(14, GRID_SIZE_PX * 0.35)}
          />
        </Group>
      ) : (
        <Image
          image={tokenImg}
          x={imageLocal.x}
          y={imageLocal.y}
          width={imageLocal.width}
          height={imageLocal.height}
          listening={false}
        />
      )}
      {token.vitalityState === 'dead' ? (
        <Group listening={false}>
          <Line
            points={[deadX1, deadY1, deadX2, deadY2]}
            stroke="#0f172a"
            strokeWidth={deadOutline}
            lineCap="round"
            opacity={0.65}
          />
          <Line
            points={[deadX2, deadY1, deadX1, deadY2]}
            stroke="#0f172a"
            strokeWidth={deadOutline}
            lineCap="round"
            opacity={0.65}
          />
          <Line
            points={[deadX1, deadY1, deadX2, deadY2]}
            stroke="#ef4444"
            strokeWidth={deadStroke}
            lineCap="round"
          />
          <Line
            points={[deadX2, deadY1, deadX1, deadY2]}
            stroke="#ef4444"
            strokeWidth={deadStroke}
            lineCap="round"
          />
        </Group>
      ) : null}
      {token.vitalityState === 'bloodied' && bloodiedImg ? (
        <Image
          image={bloodiedImg}
          x={bloodiedX}
          y={bloodiedY}
          width={bloodiedSize}
          height={bloodiedSize}
          listening={false}
        />
      ) : null}
      {statusEffects.map((sid, i) => {
        const meta = statusMeta(sid);
        const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
        const bx = cx - tl.x + Math.cos(angle) * ringR;
        const by = cy - tl.y + Math.sin(angle) * ringR;
        return <StatusIconBadge key={`${sid}-${i}`} x={bx} y={by} meta={meta} />;
      })}
      <Rect width={w} height={h} fill="rgba(0,0,0,0.001)" />
    </Group>
  );
}, (prev, next) =>
  prev.token === next.token &&
  prev.selected === next.selected &&
  prev.selectionColor === next.selectionColor &&
  prev.peerSelectionColor === next.peerSelectionColor &&
  prev.highlightColor === next.highlightColor &&
  prev.gmShowsHiddenTokens === next.gmShowsHiddenTokens &&
  prev.dimmed === next.dimmed &&
  prev.assetUrls === next.assetUrls &&
  tokenPreviewEqual(prev.previewPlacement, next.previewPlacement) &&
  footprintEqual(prev.previewFootprint, next.previewFootprint),
);

export function TokenLayer({
  tokens,
  assetUrls,
  selectedTokenIds,
  measureHighlightColors,
  peerTokenSelectionColors,
  sessionSelectionColor,
  movePreviewPositions,
  scalePreviewById,
  hideMovingOffMap = false,
  gmShowsHiddenTokens = false,
  dimmedTokenIds,
  onTokenTap,
  onTokenHover,
}: Props) {
  const selectedSet = new Set(selectedTokenIds);
  return (
    <Group>
      {tokens.map((token) => {
        const scalePreview = scalePreviewById?.[token.id] ?? null;
        const previewPlacement =
          scalePreview?.placement ?? movePreviewPositions?.[token.id] ?? null;
        const previewFootprint = scalePreview?.footprint ?? null;
        const movingSelected = previewPlacement != null && selectedSet.has(token.id);
        const isSelected = selectedSet.has(token.id);
        if (hideMovingOffMap && movingSelected && !scalePreview) return null;
        return (
        <Group
          key={token.id}
          onTap={() => onTokenTap(token.id)}
          onClick={() => onTokenTap(token.id)}
          onMouseEnter={() => onTokenHover(token.id)}
          onMouseLeave={() => onTokenHover(null)}
        >
          <TokenNode
            token={token}
            assetUrls={assetUrls}
            selected={isSelected}
            highlightColor={measureHighlightColors?.get(token.id)}
            previewPlacement={previewPlacement}
            previewFootprint={previewFootprint}
            selectionColor={sessionSelectionColor}
            peerSelectionColor={
              isSelected ? undefined : peerTokenSelectionColors?.get(token.id)
            }
            gmShowsHiddenTokens={gmShowsHiddenTokens}
            dimmed={dimmedTokenIds?.has(token.id) === true}
          />
        </Group>
        );
      })}
    </Group>
  );
}

type ConnectedTokenLayerProps = Omit<
  Props,
  | 'movePreviewPositions'
  | 'scalePreviewById'
  | 'hideMovingOffMap'
  | 'peerTokenSelectionColors'
  | 'sessionSelectionColor'
>;

export const ConnectedTokenLayer = memo(function ConnectedTokenLayer(
  props: ConnectedTokenLayerProps,
) {
  const movePreviewPositions = useStore((s) => s.movePreviewPositions);
  const scalePreviewById = useStore((s) => s.scalePreviewById);
  const hideMovingOffMap = useStore((s) => s.tokenDragOffMap);
  const activeSceneId = useStore((s) => s.activeSceneId);
  const playerName = useStore((s) => s.playerName);
  const drawHue = useStore((s) => s.drawHue);
  const initiativeTokenPickActive = useStore((s) => s.initiativeTokenPickActive);
  const initiativeLinkedTokenIds = useStore((s) => s.initiativeLinkedTokenIds);
  const sessionSelectionColor = useMemo(
    () => defaultPlayerColor(playerName, drawHue ?? 0),
    [playerName, drawHue],
  );
  const peerTokenSelectionColors = usePeerTokenSelectionColors(activeSceneId);
  const remoteMotion = useRemoteMotionDisplay();

  const dimmedTokenIds = useMemo(() => {
    if (!initiativeTokenPickActive || initiativeLinkedTokenIds.length === 0) {
      return undefined;
    }
    return new Set(initiativeLinkedTokenIds);
  }, [initiativeTokenPickActive, initiativeLinkedTokenIds]);

  const { mergedMovePreviews, mergedScalePreviews } = useMemo(() => {
    const move: Record<string, TokenGridPlacement> = { ...(movePreviewPositions ?? {}) };
    const scale: Record<
      string,
      { footprint: { w: number; h: number }; placement: TokenGridPlacement }
    > = { ...(scalePreviewById ?? {}) };

    for (const [id, placement] of Object.entries(remoteMotion.tokenPlacements)) {
      if (movePreviewPositions?.[id] || scalePreviewById?.[id]) continue;
      const token = props.tokens.find((t) => t.id === id);
      const remoteFootprint = remoteMotion.tokenFootprints[id];
      if (
        token &&
        remoteFootprint &&
        (remoteFootprint.w !== token.footprint.w || remoteFootprint.h !== token.footprint.h)
      ) {
        scale[id] = { footprint: remoteFootprint, placement };
      } else {
        move[id] = placement;
      }
    }

    return {
      mergedMovePreviews: Object.keys(move).length > 0 ? move : null,
      mergedScalePreviews: Object.keys(scale).length > 0 ? scale : null,
    };
  }, [
    movePreviewPositions,
    scalePreviewById,
    remoteMotion.tokenPlacements,
    remoteMotion.tokenFootprints,
    props.tokens,
  ]);

  return (
    <TokenLayer
      {...props}
      dimmedTokenIds={dimmedTokenIds ?? props.dimmedTokenIds}
      movePreviewPositions={mergedMovePreviews}
      scalePreviewById={mergedScalePreviews}
      peerTokenSelectionColors={peerTokenSelectionColors}
      sessionSelectionColor={sessionSelectionColor}
      hideMovingOffMap={hideMovingOffMap}
    />
  );
});

export function getTokenScreenCenter(
  token: Token,
  stagePos: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  const tl = tokenWorldTopLeft(token);
  const w = token.footprint.w * GRID_SIZE_PX;
  const h = token.footprint.h * GRID_SIZE_PX;
  const cx = tl.x + w / 2;
  const cy = tl.y + h / 2;
  return {
    x: cx * scale + stagePos.x,
    y: cy * scale + stagePos.y,
  };
}
