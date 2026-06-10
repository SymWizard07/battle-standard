import { useEffect, useMemo, useState } from 'react';
import { Circle, Group, Line, Rect } from 'react-konva';
import { isFogFullyClear } from '../../lib/fog';
import type { FogPolygon, FogPreview, FogState, Point } from '../../lib/types';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { gridCellToWorldCenter } from '../../lib/grid';
import { ConeShape } from '../ConeShape';
import { useStore, seesAsPlayer } from '../../store/useStore';

interface Props {
  fog: FogState;
  fogPreview: FogPreview | null;
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

function FogShape({
  polygon,
  fill,
  stroke,
  listening = false,
}: {
  polygon: FogPolygon;
  fill: string;
  stroke?: string;
  listening?: boolean;
}) {
  const rings = getRings(polygon);
  const outer = rings[0] ?? [];

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
        fill={fill}
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
        fill={fill}
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
        fill={fill}
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
  const r = preview.radius ?? 0;
  const xs = [preview.from.x, preview.to.x];
  const ys = [preview.from.y, preview.to.y];
  const x = Math.min(...xs) - r;
  const y = Math.min(...ys) - r;
  const w = Math.abs(preview.to.x - preview.from.x) + r * 2;
  const h = Math.abs(preview.to.y - preview.from.y) + r * 2;
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

function useLoadedImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => setImg(im);
    im.onerror = () => setImg(null);
    im.src = src;
    return () => setImg(null);
  }, [src]);
  return img;
}

function FogNoiseOverlay({
  opacity,
}: {
  opacity: number;
}) {
  const base = import.meta.env.BASE_URL;
  const src = `${base}textures/fog-noise.png`;
  const img = useLoadedImage(src);

  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Slow drift; update infrequently to keep overhead low.
    const id = window.setInterval(() => {
      setOffset((o) => ({
        x: (o.x + 0.55) % 512,
        y: (o.y + 0.25) % 512,
      }));
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  if (!img) return null;

  // Huge rect; masked by source-atop where fog pixels already exist.
  const extent = 120000;
  return (
    <Group globalCompositeOperation="source-atop" listening={false}>
      <Rect
        x={-extent}
        y={-extent}
        width={extent * 2}
        height={extent * 2}
        listening={false}
        opacity={opacity}
        fillPatternImage={img}
        fillPatternRepeat="repeat"
        fillPatternScale={{ x: 1.25, y: 1.25 }}
        fillPatternOffset={offset}
      />
    </Group>
  );
}

export function FogLayer({ fog, fogPreview }: Props) {
  const role = useStore((s) => s.role);
  const playerView = useStore((s) => s.playerView);
  const fogOpaquePreview = useStore((s) => s.fogOpaquePreview);
  const fogMode = useStore((s) => s.fogMode);
  const asPlayer = seesAsPlayer(role, playerView);

  if (isFogFullyClear(fog) && !fogPreview) {
    return null;
  }

  const opaqueHiddenFog = asPlayer || fogOpaquePreview;
  const noiseOpacity = useMemo(() => {
    // Keep it subtle; slightly reduced when GM can see through fog.
    if (opaqueHiddenFog) return 0.1;
    return fog.defaultHidden ? 0.07 : 0.09;
  }, [opaqueHiddenFog, fog.defaultHidden]);
  const gmHiddenFill = opaqueHiddenFog
    ? 'rgba(15,23,42,1)'
    : fog.defaultHidden
      ? 'rgba(15,23,42,0.40)'
      : 'rgba(15,23,42,0.72)';

  if (!asPlayer) {
    return (
      <Group listening={false}>
        {fog.unexploredMask.map((p) => (
          <FogShape key={p.id} polygon={p} fill={gmHiddenFill} />
        ))}
        <RevealCutouts fog={fog} />
        <FogNoiseOverlay opacity={noiseOpacity} />
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
      {fog.unexploredMask.map((p) => (
        <FogShape key={p.id} polygon={p} fill="rgba(15,23,42,1)" listening />
      ))}
      <RevealCutouts fog={fog} />
      <FogNoiseOverlay opacity={noiseOpacity} />
    </Group>
  );
}
