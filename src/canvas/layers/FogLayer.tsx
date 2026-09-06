import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Circle, Group, Image as KonvaImage, Line, Rect } from 'react-konva';
import { isFogFullyClear, isFogFullyCovered } from '../../lib/fog';
import {
  expandWorldBounds,
  fogMaskSetChunkBounds,
  fogMaskToClearPunchCanvas,
  fogMaskWorldBounds,
  fogOpsFingerprint,
  stitchFogMaskSetToCanvas,
  type FogMaskChunk,
  type FogMaskSet,
} from '../../lib/fogMask';
import { getFogMaskSetForScene } from '../../lib/fogMaskCache';
import type { FogPreview, FogState, Point, Scene, WorldBounds } from '../../lib/types';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { gridCellToWorldCenter } from '../../lib/grid';
import { ConeShape } from '../ConeShape';
import { useStore, seesAsPlayer } from '../../store/useStore';

interface Props {
  fog: FogState;
  gridOffset: Point;
  scene: Scene;
  /** Scene deck snapshot — render fog as players see it (opaque, no tool preview). */
  renderAsPlayer?: boolean;
  /** Lock noise UVs (no drift); used for scene deck thumbnails. */
  fixedFogPattern?: boolean;
  /** When false, hide stroke/rect tool ghost (scene deck). Default true. */
  showToolPreview?: boolean;
  /**
   * Visible world AABB. Grows world-fixed full-fog coverage when the camera
   * nears the fog edge — does not track the viewport every pan.
   */
  viewWorldBounds?: WorldBounds | null;
}

/**
 * World-anchored full-fog coverage. Fixed while panning so fog moves with the
 * map; expands only when the view approaches the current edge.
 * Pass `previous` so coverage never shrinks during a pan session.
 */
function fullFogCoverageBounds(
  scene: Scene,
  fog: FogState,
  viewWorldBounds: WorldBounds | null | undefined,
  previous: WorldBounds | null,
): WorldBounds {
  const mapBounds = fogMaskWorldBounds(scene, fog);
  const mapSpan = Math.max(
    mapBounds.maxX - mapBounds.minX,
    mapBounds.maxY - mapBounds.minY,
    GRID_SIZE_PX * 80,
  );
  let bounds = expandWorldBounds(mapBounds, mapSpan * 3);
  if (previous) {
    bounds = {
      minX: Math.min(bounds.minX, previous.minX),
      minY: Math.min(bounds.minY, previous.minY),
      maxX: Math.max(bounds.maxX, previous.maxX),
      maxY: Math.max(bounds.maxY, previous.maxY),
    };
  }

  if (viewWorldBounds) {
    const viewSpan = Math.max(
      viewWorldBounds.maxX - viewWorldBounds.minX,
      viewWorldBounds.maxY - viewWorldBounds.minY,
      GRID_SIZE_PX * 40,
    );
    const margin = viewSpan * 1.25;
    const needsGrow =
      viewWorldBounds.minX < bounds.minX + margin ||
      viewWorldBounds.minY < bounds.minY + margin ||
      viewWorldBounds.maxX > bounds.maxX - margin ||
      viewWorldBounds.maxY > bounds.maxY - margin;
    if (needsGrow) {
      bounds = {
        minX: Math.min(bounds.minX, viewWorldBounds.minX - margin * 2),
        minY: Math.min(bounds.minY, viewWorldBounds.minY - margin * 2),
        maxX: Math.max(bounds.maxX, viewWorldBounds.maxX + margin * 2),
        maxY: Math.max(bounds.maxY, viewWorldBounds.maxY + margin * 2),
      };
    }
  }

  return bounds;
}

const FOG_TEXTURE_SIZE = 2048;
const FOG_PATTERN_SCALE = 3;

function positiveMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Shape-local pattern phase only. Baking coverage/viewport origin into the offset
 * screen-locks the fog so it slides opposite the pan.
 */
function patternOffset(
  patternAnchor: Point,
  drift: { x: number; y: number },
): Point {
  return {
    x: positiveMod(drift.x - patternAnchor.x * FOG_PATTERN_SCALE, FOG_TEXTURE_SIZE),
    y: positiveMod(drift.y - patternAnchor.y * FOG_PATTERN_SCALE, FOG_TEXTURE_SIZE),
  };
}

function fogPatternProps(
  noiseImage: HTMLImageElement,
  drift: { x: number; y: number },
  patternAnchor: Point,
): {
  fillPatternImage: HTMLImageElement;
  fillPatternRepeat: 'repeat';
  fillPatternScaleX: number;
  fillPatternScaleY: number;
  fillPatternOffsetX: number;
  fillPatternOffsetY: number;
} {
  const off = patternOffset(patternAnchor, drift);
  return {
    fillPatternImage: noiseImage,
    fillPatternRepeat: 'repeat',
    fillPatternScaleX: FOG_PATTERN_SCALE,
    fillPatternScaleY: FOG_PATTERN_SCALE,
    fillPatternOffsetX: off.x,
    fillPatternOffsetY: off.y,
  };
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

const FOG_FILL = '#161c2c';
const FOG_FRONT_LAYER_OPACITY = 0.68;
const FOG_FRONT_DRIFT_STEP = { x: 0.55, y: 0.25 };
const FOG_BACK_DRIFT_STEP = { x: 0.28, y: 0.42 };
const FOG_NOISE_SRC = `${import.meta.env.BASE_URL}textures/fog-noise.png`;
const FOG_BACK_NOISE_SRC = `${import.meta.env.BASE_URL}textures/fog-noise-back.png`;
const FIXED_FOG_PATTERN_ORIGIN: Point = { x: 0, y: 0 };
const FIXED_FOG_DRIFT: Point = { x: 0, y: 0 };

function gmFogFillOpacity(opaqueHiddenFog: boolean, defaultHidden: boolean): number {
  if (opaqueHiddenFog) return 1;
  // See-through for GM editing. Must not wrap destination-out punches — Konva
  // multiplies Group opacity into each child, so punches would only partially clear.
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

type FogUniformFillProps = {
  bounds: WorldBounds;
  fill: string;
  noiseImage?: HTMLImageElement | null;
  drift?: { x: number; y: number };
  patternAnchor: Point;
  opacity: number;
};

/** Continuous fog fill — one rect, no per-chunk pattern seams. */
const FogUniformFill = memo(function FogUniformFill({
  bounds,
  fill,
  noiseImage,
  drift,
  patternAnchor,
  opacity,
}: FogUniformFillProps) {
  const pattern =
    noiseImage && drift ? fogPatternProps(noiseImage, drift, patternAnchor) : null;
  const shapeFill = pattern ?? { fill };
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  return (
    <Rect
      x={bounds.minX}
      y={bounds.minY}
      width={w}
      height={h}
      opacity={opacity}
      listening={false}
      {...shapeFill}
    />
  );
});

type FogUniformBodyProps = {
  bounds: WorldBounds;
  backNoiseImage: HTMLImageElement | null;
  frontNoiseImage: HTMLImageElement | null;
  backDrift: { x: number; y: number };
  frontDrift: { x: number; y: number };
  patternAnchor: Point;
};

const FogUniformBody = memo(function FogUniformBody({
  bounds,
  backNoiseImage,
  frontNoiseImage,
  backDrift,
  frontDrift,
  patternAnchor,
}: FogUniformBodyProps) {
  return (
    <>
      <FogUniformFill
        bounds={bounds}
        fill={FOG_FILL}
        noiseImage={backNoiseImage}
        drift={backDrift}
        patternAnchor={patternAnchor}
        opacity={1}
      />
      <FogUniformFill
        bounds={bounds}
        fill={FOG_FILL}
        noiseImage={frontNoiseImage}
        drift={frontDrift}
        patternAnchor={patternAnchor}
        opacity={FOG_FRONT_LAYER_OPACITY}
      />
    </>
  );
});

/** destination-out punch where chunk fog is clear (keeps continuous noise underneath). */
const FogChunkClearPunch = memo(function FogChunkClearPunch({
  chunk,
  punchCanvas,
}: {
  chunk: FogMaskChunk;
  punchCanvas: HTMLCanvasElement;
}) {
  const w = chunk.width * chunk.scale;
  const h = chunk.height * chunk.scale;
  return (
    <KonvaImage
      image={punchCanvas}
      x={chunk.origin.x}
      y={chunk.origin.y}
      width={w}
      height={h}
      listening={false}
      globalCompositeOperation="destination-out"
    />
  );
});

type FogBodyProps = {
  maskSet: FogMaskSet;
  maskVersion: string;
  defaultHidden: boolean;
  coverageBounds: WorldBounds;
  fillOpacity: number;
  backNoiseImage: HTMLImageElement | null;
  frontNoiseImage: HTMLImageElement | null;
  backDrift: { x: number; y: number };
  frontDrift: { x: number; y: number };
  patternAnchor: Point;
};

const FogBody = memo(function FogBody({
  maskSet,
  maskVersion,
  defaultHidden,
  coverageBounds,
  fillOpacity,
  backNoiseImage,
  frontNoiseImage,
  backDrift,
  frontDrift,
  patternAnchor,
}: FogBodyProps) {
  const chunks = useMemo(() => [...maskSet.chunks.values()], [maskSet, maskVersion]);

  const punchByKey = useMemo(() => {
    if (!defaultHidden || typeof document === 'undefined') return null;
    const map = new Map<string, HTMLCanvasElement>();
    for (const chunk of chunks) {
      map.set(`${chunk.cx},${chunk.cy}`, fogMaskToClearPunchCanvas(chunk));
    }
    return map;
  }, [chunks, defaultHidden, maskVersion]);

  const hideUnionBounds = useMemo(() => {
    if (defaultHidden) return null;
    return fogMaskSetChunkBounds(maskSet);
  }, [defaultHidden, maskSet, maskVersion]);

  const stitchedHideMask = useMemo(() => {
    if (defaultHidden || !hideUnionBounds || typeof document === 'undefined') return null;
    return stitchFogMaskSetToCanvas(maskSet, hideUnionBounds);
  }, [defaultHidden, hideUnionBounds, maskSet, maskVersion]);

  if (defaultHidden) {
    return (
      <>
        <Group opacity={fillOpacity} listening={false}>
          <FogUniformBody
            bounds={coverageBounds}
            backNoiseImage={backNoiseImage}
            frontNoiseImage={frontNoiseImage}
            backDrift={backDrift}
            frontDrift={frontDrift}
            patternAnchor={patternAnchor}
          />
        </Group>
        {punchByKey &&
          chunks.map((chunk) => {
            const punch = punchByKey.get(`${chunk.cx},${chunk.cy}`);
            if (!punch) return null;
            return (
              <FogChunkClearPunch
                key={`punch:${chunk.cx},${chunk.cy}`}
                chunk={chunk}
                punchCanvas={punch}
              />
            );
          })}
      </>
    );
  }

  if (!hideUnionBounds || !stitchedHideMask) return null;

  const sw = Math.max(1, hideUnionBounds.maxX - hideUnionBounds.minX);
  const sh = Math.max(1, hideUnionBounds.maxY - hideUnionBounds.minY);

  return (
    <Group opacity={fillOpacity} listening={false}>
      <FogUniformBody
        bounds={hideUnionBounds}
        backNoiseImage={backNoiseImage}
        frontNoiseImage={frontNoiseImage}
        backDrift={backDrift}
        frontDrift={frontDrift}
        patternAnchor={patternAnchor}
      />
      <KonvaImage
        image={stitchedHideMask}
        x={hideUnionBounds.minX}
        y={hideUnionBounds.minY}
        width={sw}
        height={sh}
        listening={false}
        globalCompositeOperation="destination-in"
      />
    </Group>
  );
});

/** Isolated so pointer-move preview ticks do not re-render the mask body. */
function FogToolPreview({ enabled }: { enabled: boolean }) {
  const fogPreview = useStore((s) => s.fogPreview);
  const fogMode = useStore((s) => s.fogMode);
  if (!enabled || !fogPreview) return null;
  const stroke = fogMode === 'hide' ? '#ef4444' : '#38bdf8';
  return (
    <Group listening={false}>
      {fogPreview.kind === 'stroke' && <PreviewStroke preview={fogPreview} stroke={stroke} />}
      {fogPreview.kind === 'rect' && <PreviewRect preview={fogPreview} stroke={stroke} />}
      {fogPreview.kind === 'cone' && <PreviewCone preview={fogPreview} stroke={stroke} />}
      {fogPreview.kind === 'sphere' && <PreviewSphere preview={fogPreview} stroke={stroke} />}
    </Group>
  );
}

function FogDriftPausedGate({
  fixedFogPattern,
  children,
}: {
  fixedFogPattern: boolean;
  children: (drift: { front: Point; back: Point }) => ReactNode;
}) {
  const drawing = useStore((s) => !!s.fogPreview);
  const [frontDrift, setFrontDrift] = useState({ x: 0, y: 0 });
  const [backDrift, setBackDrift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (fixedFogPattern || drawing) return;
    const id = window.setInterval(() => {
      setFrontDrift((o) => ({
        x: (o.x + FOG_FRONT_DRIFT_STEP.x) % FOG_TEXTURE_SIZE,
        y: (o.y + FOG_FRONT_DRIFT_STEP.y) % FOG_TEXTURE_SIZE,
      }));
      setBackDrift((o) => ({
        x: (o.x + FOG_BACK_DRIFT_STEP.x) % FOG_TEXTURE_SIZE,
        y: (o.y + FOG_BACK_DRIFT_STEP.y) % FOG_TEXTURE_SIZE,
      }));
    }, 50);
    return () => window.clearInterval(id);
  }, [fixedFogPattern, drawing]);

  const drift = fixedFogPattern
    ? { front: FIXED_FOG_DRIFT, back: FIXED_FOG_DRIFT }
    : { front: frontDrift, back: backDrift };

  return <>{children(drift)}</>;
}

export function FogLayer({
  fog,
  gridOffset,
  scene,
  renderAsPlayer = false,
  fixedFogPattern = false,
  showToolPreview = true,
  viewWorldBounds = null,
}: Props) {
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const fogOpaquePreview = useStore((s) => s.fogOpaquePreview);
  const asPlayer = renderAsPlayer || seesAsPlayer(role, playerView);
  const frontNoiseImage = useLoadedImage(FOG_NOISE_SRC);
  const backNoiseImage = useLoadedImage(FOG_BACK_NOISE_SRC);
  const patternAnchor = fixedFogPattern ? FIXED_FOG_PATTERN_ORIGIN : gridOffset;

  const maskVersion = fogOpsFingerprint(fog);
  const fullyCovered = isFogFullyCovered(fog);
  const stickyCoverageRef = useRef<WorldBounds | null>(null);
  const stickySceneKeyRef = useRef<string>('');
  const sceneFogKey = `${scene.id}:${fog.defaultHidden ? 1 : 0}`;
  if (stickySceneKeyRef.current !== sceneFogKey) {
    stickySceneKeyRef.current = sceneFogKey;
    stickyCoverageRef.current = null;
  }

  const coverageBounds = useMemo(() => {
    if (!fog.defaultHidden) {
      stickyCoverageRef.current = null;
      return fogMaskWorldBounds(scene, fog);
    }
    const next = fullFogCoverageBounds(
      scene,
      fog,
      viewWorldBounds,
      stickyCoverageRef.current,
    );
    stickyCoverageRef.current = next;
    return next;
  }, [scene, fog, viewWorldBounds]);

  const maskSet = useMemo(() => {
    if (fullyCovered) return null;
    return getFogMaskSetForScene(scene, fog);
  }, [scene, fog, maskVersion, fullyCovered]);

  const hasPreview = useStore((s) => !!s.fogPreview);
  if (isFogFullyClear(fog) && !(showToolPreview && hasPreview)) {
    return null;
  }

  const opaqueHiddenFog = asPlayer || fogOpaquePreview;
  const fogFillOpacity = gmFogFillOpacity(opaqueHiddenFog, fog.defaultHidden);

  return (
    <Group listening={false}>
      <FogDriftPausedGate fixedFogPattern={fixedFogPattern}>
        {(drift) => {
          if (fullyCovered) {
            return (
              <Group opacity={fogFillOpacity} listening={false}>
                <FogUniformBody
                  bounds={coverageBounds}
                  backNoiseImage={backNoiseImage}
                  frontNoiseImage={frontNoiseImage}
                  backDrift={drift.back}
                  frontDrift={drift.front}
                  patternAnchor={patternAnchor}
                />
              </Group>
            );
          }
          if (maskSet && (maskSet.chunks.size > 0 || fog.defaultHidden)) {
            return (
              <FogBody
                maskSet={maskSet}
                maskVersion={maskVersion}
                defaultHidden={!!fog.defaultHidden}
                coverageBounds={coverageBounds}
                fillOpacity={fogFillOpacity}
                backNoiseImage={backNoiseImage}
                frontNoiseImage={frontNoiseImage}
                backDrift={drift.back}
                frontDrift={drift.front}
                patternAnchor={patternAnchor}
              />
            );
          }
          return null;
        }}
      </FogDriftPausedGate>
      <FogToolPreview enabled={showToolPreview && !asPlayer} />
    </Group>
  );
}
