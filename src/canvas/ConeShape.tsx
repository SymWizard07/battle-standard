import { Group, Line, Rect } from 'react-konva';
import { getGridOffset } from '../lib/fixedGrid';
import {
  cone5eCellRects,
  cone5eIncludedCells,
  conePolygonPoints,
  gridCellsUnionBoundarySegments,
} from '../lib/measure';
import type { ConeMeasureParams, MeasureDisplayStyle } from '../lib/types';

interface Props {
  params: ConeMeasureParams;
  /** Overrides params.style (used for global measure display mode). */
  displayStyle?: MeasureDisplayStyle;
  color: string;
  opacity?: number;
  strokeWidth?: number;
  /** Override computed fill (e.g. draw tool rgba). */
  fill?: string;
  /** Hex suffix for fill alpha when fill is not set, e.g. '44'. */
  fillAlpha?: string;
}

export function ConeShape({
  params,
  displayStyle,
  color,
  opacity = 1,
  strokeWidth = 2,
  fill: fillOverride,
  fillAlpha = '44',
}: Props) {
  const style = displayStyle ?? params.style ?? 'vtt';
  const fill = fillOverride ?? `${color}${fillAlpha}`;
  const gridOffset = getGridOffset();

  if (style === '5e') {
    const rects = cone5eCellRects(
      params.origin,
      params.direction,
      params.lengthCells,
      gridOffset,
    );
    if (rects.length === 0) return null;
    const segments = gridCellsUnionBoundarySegments(
      cone5eIncludedCells(
        params.origin,
        params.direction,
        params.lengthCells,
        gridOffset,
      ),
      gridOffset,
    );
    return (
      <Group opacity={opacity} listening={false}>
        {rects.map((r, i) => (
          <Rect key={i} {...r} fill={fill} listening={false} />
        ))}
        {segments.map(([a, b], i) => (
          <Line
            key={i}
            points={[a.x, a.y, b.x, b.y]}
            stroke={color}
            strokeWidth={strokeWidth}
            lineCap="square"
            perfectDrawEnabled={false}
            listening={false}
          />
        ))}
      </Group>
    );
  }

  const pts = conePolygonPoints(params, gridOffset);
  if (pts.length < 4) return null;
  return (
    <Line
      points={pts}
      closed
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      lineJoin="miter"
      perfectDrawEnabled={false}
      opacity={opacity}
      listening={false}
    />
  );
}
