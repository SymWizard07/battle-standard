import type { ReactElement } from 'react';
import { useMemo, useRef } from 'react';
import { Group, Line } from 'react-konva';
import { getVisibleWorldBounds } from '../../lib/grid';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import type { Point, WorldBounds } from '../../lib/types';

interface Props {
  visible: boolean;
  gridOffset: Point;
  previewSizePx?: number | null;
  previewOffset?: { x: number; y: number } | null;
  stageWidth: number;
  stageHeight: number;
  stagePos: { x: number; y: number };
  scale: number;
}

/** Snap a world coordinate so the line lands on a device pixel after stage transform. */
function pixelAlignWorld(world: number, scale: number, stagePos: number): number {
  const screen = world * scale + stagePos;
  return (Math.round(screen) - stagePos) / scale;
}

function buildLines(
  bounds: WorldBounds,
  stroke: string,
  strokeWidth: number,
  sizePx: number,
  offsetX: number,
  offsetY: number,
  scale: number,
  stagePos: { x: number; y: number },
): ReactElement[] {
  const lines: ReactElement[] = [];
  const startCol = Math.floor((bounds.minX - offsetX) / sizePx);
  const endCol = Math.ceil((bounds.maxX - offsetX) / sizePx);
  const startRow = Math.floor((bounds.minY - offsetY) / sizePx);
  const endRow = Math.ceil((bounds.maxY - offsetY) / sizePx);

  const minY = pixelAlignWorld(bounds.minY, scale, stagePos.y);
  const maxY = pixelAlignWorld(bounds.maxY, scale, stagePos.y);
  const minX = pixelAlignWorld(bounds.minX, scale, stagePos.x);
  const maxX = pixelAlignWorld(bounds.maxX, scale, stagePos.x);

  for (let c = startCol; c <= endCol; c++) {
    const x = pixelAlignWorld(offsetX + c * sizePx, scale, stagePos.x);
    lines.push(
      <Line
        key={`v-${c}-${stroke}`}
        points={[x, minY, x, maxY]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        perfectDrawEnabled={false}
        listening={false}
      />,
    );
  }
  for (let r = startRow; r <= endRow; r++) {
    const y = pixelAlignWorld(offsetY + r * sizePx, scale, stagePos.y);
    lines.push(
      <Line
        key={`h-${r}-${stroke}`}
        points={[minX, y, maxX, y]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        perfectDrawEnabled={false}
        listening={false}
      />,
    );
  }
  return lines;
}

function contains(outer: WorldBounds, inner: WorldBounds): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
}

function expandBounds(
  visible: WorldBounds,
  stageWidth: number,
  stageHeight: number,
  scale: number,
): WorldBounds {
  const padX = stageWidth / scale;
  const padY = stageHeight / scale;
  return {
    minX: visible.minX - padX,
    minY: visible.minY - padY,
    maxX: visible.maxX + padX,
    maxY: visible.maxY + padY,
  };
}

export function GridLayer({
  visible,
  gridOffset,
  previewSizePx,
  previewOffset,
  stageWidth,
  stageHeight,
  stagePos,
  scale,
}: Props) {
  const cacheRef = useRef<{ scale: number; bounds: WorldBounds } | null>(null);

  const renderBounds = useMemo(() => {
    const visible = getVisibleWorldBounds(stageWidth, stageHeight, stagePos, scale);
    const cached = cacheRef.current;
    if (cached && cached.scale === scale && contains(cached.bounds, visible)) {
      return cached.bounds;
    }
    const expanded = expandBounds(visible, stageWidth, stageHeight, scale);
    cacheRef.current = { scale, bounds: expanded };
    return expanded;
  }, [stageWidth, stageHeight, stagePos.x, stagePos.y, scale]);

  const mainLines = useMemo(
    () =>
      buildLines(
        renderBounds,
        'rgba(148,163,184,0.35)',
        1,
        GRID_SIZE_PX,
        gridOffset.x,
        gridOffset.y,
        scale,
        stagePos,
      ),
    [renderBounds, gridOffset.x, gridOffset.y, scale, stagePos.x, stagePos.y],
  );

  const previewLines = useMemo(() => {
    if (previewSizePx == null) return null;
    const previewOffsetX = previewOffset?.x ?? gridOffset.x;
    const previewOffsetY = previewOffset?.y ?? gridOffset.y;
    return buildLines(
      renderBounds,
      'rgba(56,189,248,0.75)',
      2,
      Math.max(2, previewSizePx),
      previewOffsetX,
      previewOffsetY,
      scale,
      stagePos,
    );
  }, [
    renderBounds,
    previewSizePx,
    previewOffset?.x,
    previewOffset?.y,
    gridOffset.x,
    gridOffset.y,
    scale,
    stagePos.x,
    stagePos.y,
  ]);

  if (!visible) return null;

  return (
    <Group listening={false}>
      {mainLines}
      {previewLines}
    </Group>
  );
}
