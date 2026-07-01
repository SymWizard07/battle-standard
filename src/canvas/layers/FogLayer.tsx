import { useEffect, useMemo, useState } from 'react';
import { Circle, Group, Line, Rect } from 'react-konva';
import { isFogFullyClear } from '../../lib/fog';
import type { FogPolygon, FogPreview, FogState, Point, WorldBounds } from '../../lib/types';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { gridCellToWorldCenter } from '../../lib/grid';
import { ConeShape } from '../ConeShape';
import { useStore, seesAsPlayer } from '../../store/useStore';

interface Props {
  fog: FogState;
  fogPreview: FogPreview | null;
  gridOffset: Point;
  /** Scene deck snapshot — render fog as players see it (opaque, no tool preview). */
  renderAsPlayer?: boolean;
  /** Lock noise UVs (no drift); used for scene deck thumbnails. */
  fixedFogPattern?: boolean;
}

const FOG_TEXTURE_SIZE = 512;
const FOG_PATTERN_SCALE = 1.25;
const FOG_WORLD_HALF_EXTENT = 1_000_000;

function positiveMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function fullGridFogBounds(gridOffset: Point): WorldBounds {
  return {
    minX: gridOffset.x - FOG_WORLD_HALF_EXTENT,
    minY: gridOffset.y - FOG_WORLD_HALF_EXTENT,
    maxX: gridOffset.x + FOG_WORLD_HALF_EXTENT,
    maxY: gridOffset.y + FOG_WORLD_HALF_EXTENT,
  };
}

function patternOffset(worldOrigin: Point, drift: { x: number; y: number }): Point {
  return {
    x: positiveMod(drift.x - worldOrigin.x * FOG_PATTERN_SCALE, FOG_TEXTURE_SIZE),
    y: positiveMod(drift.y - worldOrigin.y * FOG_PATTERN_SCALE, FOG_TEXTURE_SIZE),
  };
}

function fogPatternProps(
  noiseImage: HTMLImageElement,
  drift: { x: number; y: number },
  worldOrigin: Point,
): {
  fillPatternImage: HTMLImageElement;
  fillPatternRepeat: 'repeat';
  fillPatternScaleX: number;
  fillPatternScaleY: number;
  fillPatternOffsetX: number;
  fillPatternOffsetY: number;
} {
  const off = patternOffset(worldOrigin, drift);
  return {
    fillPatternImage: noiseImage,
    fillPatternRepeat: 'repeat',
    fillPatternScaleX: FOG_PATTERN_SCALE,
    fillPatternScaleY: FOG_PATTERN_SCALE,
    fillPatternOffsetX: off.x,
    fillPatternOffsetY: off.y,
  };
}

function FullGridFogBackdrop({
  bounds,
  fill,
  noiseImage,
  drift,
  worldOrigin,
}: {
  bounds: WorldBounds;
  fill: string;
  noiseImage?: HTMLImageElement | null;
  drift?: { x: number; y: number };
  worldOrigin: Point;
}) {
  const pattern =
    noiseImage && drift ? fogPatternProps(noiseImage, drift, worldOrigin) : null;
  const shapeFill = pattern ?? { fill };
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  return (
    <Rect
      x={bounds.minX}
      y={bounds.minY}
      width={w}
      height={h}
      listening={false}
      {...shapeFill}
    />
  );
}

function polygonToRect(points: Point[]): { x: number; y: number; w: number; h: number } | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function getRings(p: FogPolygon | any): Point[][] {
  if (p?.rings && Array.isArray(p.rings)) return p.rings as Point[][];
  if (p?.points && Array.isArray(p.points)) return [p.points as Point[]];
  return [];
}

function polygonWorldOrigin(polygon: FogPolygon): Point {
  const outer = getRings(polygon)[0] ?? [];
  if (outer.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  for (const p of outer) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  return { x: minX, y: minY };
}

function FogShape({
  polygon,
  fill,
  stroke,
  listening = false,
  noiseImage,
  drift,
  patternWorldOrigin,
}: {
  polygon: FogPolygon;
  fill: string;
  stroke?: string;
  listening?: boolean;
  noiseImage?: HTMLImageElement | null;
  drift?: { x: number; y: number };
  patternWorldOrigin?: Point;
}) {
  const rings = getRings(polygon);
  const outer = rings[0] ?? [];
  const origin = patternWorldOrigin ?? polygonWorldOrigin(polygon);
  const pattern =
    noiseImage && drift ? fogPatternProps(noiseImage, drift, origin) : null;
  const shapeFill = pattern ?? { fill };

  // Legacy / degenerate: treat 2 points as a rect bounds.
  if (outer.length === 2) {
    const rect = polygonToRect(outer);
    if (!rect) return null;
    return (
      <Rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        {...shapeFill}
        stroke={stroke}
        strokeWidth={stroke ? 2 : 0}
        listening={listening}
      />
    );
  }
  if (outer.length < 3) return null;

  const outerPts: number[] = [];
  for (const p of outer) outerPts.push(p.x, p.y);

  const holes = rings.slice(1).filter((r) => r.length >= 3);
  if (holes.length === 0) {
    return (
      <Line
        points={outerPts}
        closed
        {...shapeFill}
        stroke={stroke}
        strokeWidth={stroke ? 2 : 0}
        listening={listening}
      />
    );
  }

  return (
    <Group listening={listening}>
      <Line
        points={outerPts}
        closed
        {...shapeFill}
        stroke={stroke}
        strokeWidth={stroke ? 2 : 0}
        listening={listening}
      />
      <Group globalCompositeOperation="destination-out" listening={false}>
        {holes.map((ring, idx) => {
          const holePts: number[] = [];
          for (const p of ring) holePts.push(p.x, p.y);
          return <Line key={`${polygon.id}-h${idx}`} points={holePts} closed fill="black" />;
        })}
      </Group>
    </Group>
  );
}

function PreviewStroke({ preview, stroke }: { preview: FogPreview; stroke: string }) {
  const ptsSrc = preview.points ?? [];
  if (ptsSrc.length < 2) return null;
  const pts: number[] = [];
  for (const p of ptsSrc) pts.push(p.x, p.y);
  return (
    <Line
      points={pts}
      stroke={stroke}
      strokeWidth={Math.max(2, (preview.radius ?? 4) * 2)}
      lineCap="round"
      lineJoin="round"
      opacity={0.5}
      listening={false}
    />
  );
}

function PreviewRect({ preview, stroke }: { preview: FogPreview; stroke: string }) {
  if (!preview.from || !preview.to) return null;
  if (preview.from.x === preview.to.x && preview.from.y === preview.to.y) return null;
  const x = Math.min(preview.from.x, preview.to.x);
  const y = Math.min(preview.from.y, preview.to.y);
  const w = Math.abs(preview.to.x - preview.from.x);
  const h = Math.abs(preview.to.y - preview.from.y);
  if (w < 1 && h < 1) return null;
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="rgba(56,189,248,0.18)"
      stroke={stroke}
      strokeWidth={2}
      dash={[6, 4]}
      listening={false}
    />
  );
}

function PreviewCone({ preview, stroke }: { preview: FogPreview; stroke: string }) {
  if (!preview.origin) return null;
  if (typeof preview.direction !== 'number' || typeof preview.lengthCells !== 'number') return null;
  return (
    <ConeShape
      params={{
        origin: preview.origin,
        direction: preview.direction,
        lengthCells: preview.lengthCells,
        lengthWorld: preview.lengthWorld,
        angleDeg: preview.angleDeg ?? 60,
        style: preview.style ?? 'vtt',
      }}
      color={stroke}
      fill="rgba(56,189,248,0.18)"
      strokeWidth={2}
    />
  );
}

function PreviewSphere({ preview, stroke }: { preview: FogPreview; stroke: string }) {
  if (!preview.center || typeof preview.radiusCells !== 'number') return null;
  const c = gridCellToWorldCenter(preview.center);
  const r = (preview.radiusCells + 0.5) * GRID_SIZE_PX;
  return (
    <Circle
      x={c.x}
      y={c.y}
      radius={r}
      fill="rgba(56,189,248,0.18)"
      stroke={stroke}
      strokeWidth={2}
      listening={false}
    />
  );
}

function RevealCutouts({ fog }: { fog: FogState }) {
  if (fog.revealedMask.length === 0) return null;
  return (
    <Group globalCompositeOperation="destination-out">
      {fog.revealedMask.map((p) => {
        const rings = getRings(p);
        const outer = rings[0] ?? [];
        if (outer.length === 2) {
          const rect = polygonToRect(outer);
          if (!rect) return null;
          return (
            <Rect
              key={p.id}
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              fill="black"
              listening={false}
            />
          );
        }
        if (outer.length < 3) return null;
        const pts: number[] = [];
        for (const pt of outer) pts.push(pt.x, pt.y);
        return <Line key={p.id} points={pts} closed fill="black" listening={false} />;
      })}
    </Group>
  );
}

type ClipCtx = {
  beginPath: () => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
  clip: (fillRule?: CanvasFillRule) => void;
};

function appendPolygonRing(ctx: ClipCtx, ring: Point[]) {
  if (ring.length < 3) return;
  ctx.moveTo(ring[0]!.x, ring[0]!.y);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i]!.x, ring[i]!.y);
  ctx.closePath();
}

/** Clip full-grid fog to everywhere except revealed holes (works with pattern fills). */
function fullGridFogClipFunc(bounds: WorldBounds, revealed: FogPolygon[]) {
  return (ctx: ClipCtx) => {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    ctx.beginPath();
    ctx.rect(bounds.minX, bounds.minY, w, h);
    for (const p of revealed) {
      const outer = getRings(p)[0] ?? [];
      if (outer.length === 2) {
        const rect = polygonToRect(outer);
        if (rect) ctx.rect(rect.x, rect.y, rect.w, rect.h);
        continue;
      }
      appendPolygonRing(ctx, outer);
    }
    ctx.clip('evenodd');
  };
}

const FOG_FILL = '#0f172a';

function gmFogGroupOpacity(opaqueHiddenFog: boolean, defaultHidden: boolean): number {
  if (opaqueHiddenFog) return 1;
  return defaultHidden ? 0.4 : 0.72;
}

function useLoadedImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setImg(null);
    im.src = src;
    return () => setImg(null);
  }, [src]);
  return img;
}

const FOG_NOISE_SRC = `${import.meta.env.BASE_URL}textures/fog-noise.png`;
const FIXED_FOG_PATTERN_ORIGIN: Point = { x: 0, y: 0 };
const FIXED_FOG_DRIFT: Point = { x: 0, y: 0 };

export function FogLayer({
  fog,
  fogPreview,
  gridOffset,
  renderAsPlayer = false,
  fixedFogPattern = false,
}: Props) {
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const fogOpaquePreview = useStore((s) => s.fogOpaquePreview);
  const fogMode = useStore((s) => s.fogMode);
  const asPlayer = renderAsPlayer || seesAsPlayer(role, playerView);
  const noiseImage = useLoadedImage(FOG_NOISE_SRC);
  const [animatedDrift, setAnimatedDrift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (fixedFogPattern) return;
    const id = window.setInterval(() => {
      setAnimatedDrift((o) => ({
        x: (o.x + 0.55) % FOG_TEXTURE_SIZE,
        y: (o.y + 0.25) % FOG_TEXTURE_SIZE,
      }));
    }, 50);
    return () => window.clearInterval(id);
  }, [fixedFogPattern]);

  const drift = fixedFogPattern ? FIXED_FOG_DRIFT : animatedDrift;
  const patternWorldOrigin = fixedFogPattern ? FIXED_FOG_PATTERN_ORIGIN : gridOffset;

  const fogShapeProps = useMemo(
    () => ({
      noiseImage,
      drift,
      patternWorldOrigin: fixedFogPattern ? FIXED_FOG_PATTERN_ORIGIN : undefined,
    }),
    [noiseImage, drift, fixedFogPattern],
  );

  const fullGridBounds = useMemo(
    () => (fog.defaultHidden ? fullGridFogBounds(gridOffset) : null),
    [fog.defaultHidden, gridOffset],
  );

  const positiveFogMask = fog.defaultHidden ? [] : fog.unexploredMask;

  const fullGridClipFunc = useMemo(() => {
    if (!fullGridBounds) return null;
    return fullGridFogClipFunc(fullGridBounds, fog.revealedMask);
  }, [fullGridBounds, fog.revealedMask]);

  const renderFogBody = (shapeListening: boolean) => (
    <>
      {fullGridBounds && fullGridClipFunc && (
        <Group clipFunc={fullGridClipFunc} listening={false}>
          <FullGridFogBackdrop
            bounds={fullGridBounds}
            fill={FOG_FILL}
            noiseImage={noiseImage}
            drift={drift}
            worldOrigin={patternWorldOrigin}
          />
        </Group>
      )}
      {positiveFogMask.map((p) => (
        <FogShape
          key={p.id}
          polygon={p}
          fill={FOG_FILL}
          listening={shapeListening}
          {...fogShapeProps}
        />
      ))}
      {!fog.defaultHidden && <RevealCutouts fog={fog} />}
    </>
  );

  if (isFogFullyClear(fog) && !fogPreview) {
    return null;
  }

  const opaqueHiddenFog = asPlayer || fogOpaquePreview;
  const fogGroupOpacity = gmFogGroupOpacity(opaqueHiddenFog, fog.defaultHidden);

  if (!asPlayer) {
    return (
      <Group listening={false}>
        <Group opacity={fogGroupOpacity}>{renderFogBody(false)}</Group>
        {fogPreview && (
          <>
            {fogPreview.kind === 'stroke' && (
              <PreviewStroke preview={fogPreview} stroke={fogMode === 'hide' ? '#ef4444' : '#38bdf8'} />
            )}
            {fogPreview.kind === 'rect' && (
              <PreviewRect preview={fogPreview} stroke={fogMode === 'hide' ? '#ef4444' : '#38bdf8'} />
            )}
            {fogPreview.kind === 'cone' && (
              <PreviewCone preview={fogPreview} stroke={fogMode === 'hide' ? '#ef4444' : '#38bdf8'} />
            )}
            {fogPreview.kind === 'sphere' && (
              <PreviewSphere preview={fogPreview} stroke={fogMode === 'hide' ? '#ef4444' : '#38bdf8'} />
            )}
          </>
        )}
      </Group>
    );
  }

  return (
    <Group listening={false}>
      <Group opacity={fogGroupOpacity}>{renderFogBody(true)}</Group>
    </Group>
  );
}
