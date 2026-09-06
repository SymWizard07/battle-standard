import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { memo, useMemo } from 'react';
import { ConeShape } from '../ConeShape';
import {
  cubeCenterWorld,
  drawFillColor,
  drawOutlineWidth,
  mergeDrawStrokeDragPreview,
  resolveDrawColor,
  sphereCenterWorld,
  sphereRadiusWorld,
} from '../../lib/drawShapes';
import { drawTextTopLeft, drawTextKonvaFontStyle, isDrawTextParams } from '../../lib/drawText';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import { useRemoteMotionDisplay } from '../../hooks/useRemoteMotion';
import { useStore } from '../../store/useStore';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  DrawPreview,
  DrawShapeKind,
  DrawStroke,
  DrawStrokeParams,
  EphemeralDrawText,
  LineMeasureParams,
  Point,
  RectMeasureParams,
  SphereMeasureParams,
} from '../../lib/types';

interface Props {
  strokes: DrawStroke[];
  preview: DrawPreview | null;
  erasePreview?: { center: Point; radius: number } | null;
  /** Live text previews (local and/or remote). */
  liveTexts?: EphemeralDrawText[];
}

function strokeToLinePoints(points: { x: number; y: number }[]): number[] {
  const pts: number[] = [];
  for (const p of points) pts.push(p.x, p.y);
  return pts;
}

export function renderDrawTextShape(
  params: {
    origin: Point;
    text: string;
    fontFamily: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  },
  color: string,
  fontSize: number,
  opacity: number,
  key: string,
) {
  if (!params.text) return null;
  const topLeft = drawTextTopLeft(params, fontSize);
  return (
    <Text
      key={key}
      x={topLeft.x}
      y={topLeft.y}
      text={params.text}
      fontSize={fontSize}
      fontFamily={params.fontFamily}
      fontStyle={drawTextKonvaFontStyle(params)}
      textDecoration={params.underline ? 'underline' : undefined}
      fill={color}
      opacity={opacity}
      listening={false}
    />
  );
}

function renderShape(
  kind: DrawShapeKind,
  params: DrawStrokeParams | undefined,
  points: Point[] | undefined,
  color: string | undefined,
  strokeWidth: number,
  opacity: number,
  key: string,
) {
  const strokeColor = resolveDrawColor(color);
  const outline = drawOutlineWidth(strokeWidth);

  if (kind === 'stroke') {
    const pts = points ?? [];
    if (pts.length < 2) return null;
    return (
      <Line
        key={key}
        points={strokeToLinePoints(pts)}
        stroke={strokeColor}
        strokeWidth={outline}
        lineCap="round"
        lineJoin="round"
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (kind === 'line' && params) {
    const p = params as LineMeasureParams;
    return (
      <Line
        key={key}
        points={[p.from.x, p.from.y, p.to.x, p.to.y]}
        stroke={strokeColor}
        strokeWidth={outline}
        lineCap="round"
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (kind === 'rect' && params) {
    const fill = drawFillColor(strokeColor);
    const p = params as RectMeasureParams;
    const x = Math.min(p.from.x, p.to.x);
    const y = Math.min(p.from.y, p.to.y);
    const w = Math.abs(p.to.x - p.from.x);
    const h = Math.abs(p.to.y - p.from.y);
    const rot = p.rotationDeg ?? 0;
    const cx = x + w / 2;
    const cy = y + h / 2;
    return (
      <Group key={key} x={cx} y={cy} rotation={rot}>
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill={fill}
          stroke={strokeColor}
          strokeWidth={outline}
          opacity={opacity}
          listening={false}
        />
      </Group>
    );
  }

  if (kind === 'cube' && params) {
    const fill = drawFillColor(strokeColor);
    const p = params as CubeMeasureParams;
    const center = cubeCenterWorld(p);
    const size = p.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
    const tl = { x: center.x - size / 2, y: center.y - size / 2 };
    return (
      <Rect
        key={key}
        x={tl.x}
        y={tl.y}
        width={size}
        height={size}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={outline}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (kind === 'sphere' && params) {
    const fill = drawFillColor(strokeColor);
    const p = params as SphereMeasureParams;
    const c = sphereCenterWorld(p);
    const r = sphereRadiusWorld(p);
    return (
      <Circle
        key={key}
        x={c.x}
        y={c.y}
        radius={r}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={outline}
        opacity={opacity}
        listening={false}
      />
    );
  }

  if (kind === 'cone' && params) {
    const fill = drawFillColor(strokeColor);
    const p = params as ConeMeasureParams;
    return (
      <Group key={key} opacity={opacity} listening={false}>
        <ConeShape params={p} color={strokeColor} fill={fill} strokeWidth={outline} />
      </Group>
    );
  }

  if (kind === 'text' && isDrawTextParams(params)) {
    return renderDrawTextShape(params, strokeColor, strokeWidth, opacity, key);
  }

  return null;
}

export function DrawLayer({ strokes, preview, erasePreview, liveTexts = [] }: Props) {
  return (
    <Group listening={false}>
      {strokes.map((stroke) =>
        renderShape(
          stroke.kind,
          stroke.params,
          stroke.points,
          stroke.color,
          stroke.strokeWidth,
          1,
          stroke.id,
        ),
      )}
      {preview &&
        renderShape(
          preview.kind,
          preview.params,
          preview.points,
          preview.color,
          preview.strokeWidth,
          0.75,
          'preview',
        )}
      {liveTexts.map((live, i) =>
        renderDrawTextShape(
          live.params,
          resolveDrawColor(live.color),
          live.strokeWidth,
          1,
          `live-text-${i}`,
        ),
      )}
      {erasePreview && (
        <Circle
          x={erasePreview.center.x}
          y={erasePreview.center.y}
          radius={erasePreview.radius}
          fill="rgba(248, 113, 113, 0.12)"
          stroke="#f87171"
          strokeWidth={2}
          dash={[6, 4]}
          opacity={0.9}
          listening={false}
        />
      )}
    </Group>
  );
}

export const ConnectedDrawLayer = memo(function ConnectedDrawLayer({
  hideLocalEphemeralText = false,
  ...props
}: Props & { hideLocalEphemeralText?: boolean }) {
  const dragPreview = useStore((s) => s.drawStrokeDragPreview);
  const localEphemeral = useStore((s) => s.ephemeralDrawText);
  const remoteMotion = useRemoteMotionDisplay();
  const strokes = useMemo(() => {
    let next = mergeDrawStrokeDragPreview(props.strokes, dragPreview);
    const remoteStrokes = remoteMotion.drawStrokes;
    if (Object.keys(remoteStrokes).length > 0) {
      next = next.map((stroke) => remoteStrokes[stroke.id] ?? stroke);
    }
    return next;
  }, [props.strokes, dragPreview, remoteMotion.drawStrokes]);

  const liveTexts = useMemo(() => {
    const list: EphemeralDrawText[] = [];
    if (remoteMotion.ephemeralDrawText) list.push(remoteMotion.ephemeralDrawText);
    if (localEphemeral && !hideLocalEphemeralText) list.push(localEphemeral);
    return list;
  }, [remoteMotion.ephemeralDrawText, localEphemeral, hideLocalEphemeralText]);

  return <DrawLayer {...props} strokes={strokes} liveTexts={liveTexts} />;
});
