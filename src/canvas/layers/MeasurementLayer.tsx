import type { ReactNode } from 'react';
import { useState } from 'react';
import { Circle, Group, Line, Rect } from 'react-konva';
import { ConeShape } from '../ConeShape';
import { MeasureLabel } from '../MeasureLabel';
import {
  cube5eIncludedCells,
  gridCellsUnionBoundarySegments,
  gridCellsToRects,
  line5eIncludedCells,
  sphere5eIncludedCells,
} from '../../lib/measure';
import { isValidMeasurePreview } from '../../lib/drawShapes';
import { getMeasureLabelInfo } from '../../lib/measureLabel';
import { isMeasurementOwnedBySessionUser } from '../../lib/measureOwnership';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  EphemeralMeasurement,
  LineMeasureParams,
  MeasureDisplayStyle,
  MeasurementObject,
  Point,
  SphereMeasureParams,
} from '../../lib/types';
import type { RemoteEphemeralMeasure } from '../../sync/remoteMotion';
import { GRID_SIZE_PX } from '../../lib/fixedGrid';
import {
  cubeCenterWorld,
  sphereCenterWorld,
  sphereRadiusWorld,
} from '../../lib/drawShapes';
import { useStore } from '../../store/useStore';

/** Debug overlay colors when VTT + 5e are shown together. */
const DEBUG_VTT_COLOR = '#fbbf24';
const DEBUG_5E_COLOR = '#38bdf8';

interface Props {
  measurements: MeasurementObject[];
  ephemeral: EphemeralMeasurement | null;
  remoteEphemeral?: RemoteEphemeralMeasure | null;
  alternatingDiagonals: boolean;
  debugDualView?: boolean;
  viewScale: number;
  fadingMeasurements?: Record<string, number>;
  sessionColor: string;
}

function resolveDisplayStyle(
  stored: MeasureDisplayStyle | undefined,
  coneParams?: ConeMeasureParams,
): MeasureDisplayStyle {
  return stored ?? coneParams?.style ?? 'vtt';
}

function renderGridCellHighlight(
  cells: ReturnType<typeof gridCellsToRects>,
  boundarySegments: Array<[Point, Point]>,
  color: string,
  opacity: number,
  key: string,
) {
  const fill = `${color}44`;
  return (
    <Group key={key} opacity={opacity} listening={false}>
      {cells.map((r, i) => (
        <Rect key={i} {...r} fill={fill} listening={false} />
      ))}
      {boundarySegments.map(([a, b], i) => (
        <Line
          key={`seg-${i}`}
          points={[a.x, a.y, b.x, b.y]}
          stroke={color}
          strokeWidth={2}
          lineCap="square"
          perfectDrawEnabled={false}
          listening={false}
        />
      ))}
    </Group>
  );
}

function renderLineOne(
  params: LineMeasureParams,
  color: string,
  opacity: number,
  key: string,
  displayStyle: MeasureDisplayStyle,
) {
  if (displayStyle === '5e') {
    const cells = line5eIncludedCells(params.from, params.to);
    return renderGridCellHighlight(
      gridCellsToRects(cells),
      gridCellsUnionBoundarySegments(cells),
      color,
      opacity,
      key,
    );
  }

  return (
    <Group key={key} opacity={opacity} listening={false}>
      <Line
        points={[params.from.x, params.from.y, params.to.x, params.to.y]}
        stroke={color}
        strokeWidth={3}
      />
    </Group>
  );
}

function renderLine(
  params: LineMeasureParams,
  color: string,
  opacity: number,
  key: string,
  activeStyle: MeasureDisplayStyle,
  debugDualView: boolean,
) {
  if (!debugDualView) {
    return renderLineOne(params, color, opacity, key, activeStyle);
  }
  return (
    <Group key={key} listening={false}>
      {renderLineOne(params, DEBUG_VTT_COLOR, opacity, `${key}-vtt`, 'vtt')}
      {renderLineOne(params, DEBUG_5E_COLOR, opacity, `${key}-5e`, '5e')}
    </Group>
  );
}

function renderCubeOne(
  params: CubeMeasureParams,
  color: string,
  opacity: number,
  key: string,
  displayStyle: MeasureDisplayStyle,
) {
  if (displayStyle === '5e') {
    const cells = cube5eIncludedCells(params.center, params.radiusCells);
    return renderGridCellHighlight(
      gridCellsToRects(cells),
      gridCellsUnionBoundarySegments(cells),
      color,
      opacity,
      key,
    );
  }

  const center = cubeCenterWorld(params);
  const size = params.radiusCells * 2 * GRID_SIZE_PX + GRID_SIZE_PX;
  const tl = {
    x: center.x - size / 2,
    y: center.y - size / 2,
  };
  return (
    <Group key={key} opacity={opacity} listening={false}>
      <Rect
        x={tl.x}
        y={tl.y}
        width={size}
        height={size}
        fill={`${color}44`}
        stroke={color}
        strokeWidth={2}
      />
    </Group>
  );
}

function renderCube(
  params: CubeMeasureParams,
  color: string,
  opacity: number,
  key: string,
  activeStyle: MeasureDisplayStyle,
  debugDualView: boolean,
) {
  if (!debugDualView) {
    return renderCubeOne(params, color, opacity, key, activeStyle);
  }
  return (
    <Group key={key} listening={false}>
      {renderCubeOne(params, DEBUG_VTT_COLOR, opacity, `${key}-vtt`, 'vtt')}
      {renderCubeOne(params, DEBUG_5E_COLOR, opacity, `${key}-5e`, '5e')}
    </Group>
  );
}

function renderSphereOne(
  params: SphereMeasureParams,
  color: string,
  opacity: number,
  key: string,
  displayStyle: MeasureDisplayStyle,
) {
  const c = sphereCenterWorld(params);

  if (displayStyle === '5e') {
    const cells = sphere5eIncludedCells(params);
    return renderGridCellHighlight(
      gridCellsToRects(cells),
      gridCellsUnionBoundarySegments(cells),
      color,
      opacity,
      key,
    );
  }

  const r = sphereRadiusWorld(params);
  return (
    <Group key={key} opacity={opacity} listening={false}>
      <Circle
        x={c.x}
        y={c.y}
        radius={r}
        fill={`${color}44`}
        stroke={color}
        strokeWidth={2}
      />
    </Group>
  );
}

function renderSphere(
  params: SphereMeasureParams,
  color: string,
  opacity: number,
  key: string,
  activeStyle: MeasureDisplayStyle,
  debugDualView: boolean,
) {
  if (!debugDualView) {
    return renderSphereOne(params, color, opacity, key, activeStyle);
  }
  return (
    <Group key={key} listening={false}>
      {renderSphereOne(params, DEBUG_VTT_COLOR, opacity, `${key}-vtt`, 'vtt')}
      {renderSphereOne(params, DEBUG_5E_COLOR, opacity, `${key}-5e`, '5e')}
    </Group>
  );
}

function renderConeOne(
  params: ConeMeasureParams,
  color: string,
  opacity: number,
  key: string,
  displayStyle: MeasureDisplayStyle,
) {
  return (
    <Group key={key}>
      <ConeShape params={params} displayStyle={displayStyle} color={color} opacity={opacity} />
    </Group>
  );
}

function renderCone(
  params: ConeMeasureParams,
  color: string,
  opacity: number,
  key: string,
  activeStyle: MeasureDisplayStyle,
  debugDualView: boolean,
) {
  if (!debugDualView) {
    return renderConeOne(params, color, opacity, key, activeStyle);
  }
  return (
    <Group key={key} listening={false}>
      {renderConeOne(params, DEBUG_VTT_COLOR, opacity, `${key}-vtt`, 'vtt')}
      {renderConeOne(params, DEBUG_5E_COLOR, opacity, `${key}-5e`, '5e')}
    </Group>
  );
}

function renderMeasurement(
  kind: MeasurementObject['kind'] | EphemeralMeasurement['kind'],
  params: MeasurementObject['params'],
  color: string,
  opacity: number,
  key: string,
  activeStyle: MeasureDisplayStyle,
  debugDualView: boolean,
) {
  if (kind === 'line') {
    return renderLine(params as LineMeasureParams, color, opacity, key, activeStyle, debugDualView);
  }
  if (kind === 'cube') {
    return renderCube(params as CubeMeasureParams, color, opacity, key, activeStyle, debugDualView);
  }
  if (kind === 'sphere') {
    return renderSphere(params as SphereMeasureParams, color, opacity, key, activeStyle, debugDualView);
  }
  return renderCone(params as ConeMeasureParams, color, opacity, key, activeStyle, debugDualView);
}

export function MeasurementLayer({
  measurements,
  ephemeral,
  remoteEphemeral = null,
  alternatingDiagonals: _alternatingDiagonals,
  debugDualView = false,
  viewScale: _viewScale,
  fadingMeasurements,
  sessionColor,
}: Props) {
  const items: ReactNode[] = [];

  for (const m of measurements) {
    const style = resolveDisplayStyle(
      m.displayStyle,
      m.kind === 'cone' ? (m.params as ConeMeasureParams) : undefined,
    );
    const opacity = fadingMeasurements?.[m.id] ?? 1;
    items.push(
      renderMeasurement(m.kind, m.params, m.color, opacity, m.id, style, debugDualView),
    );
  }

  if (ephemeral) {
    const style = resolveDisplayStyle(
      ephemeral.displayStyle,
      ephemeral.kind === 'cone' ? (ephemeral.params as ConeMeasureParams) : undefined,
    );
    items.push(
      renderMeasurement(
        ephemeral.kind,
        ephemeral.params,
        sessionColor,
        ephemeral.opacity,
        'ephemeral',
        style,
        debugDualView,
      ),
    );
  }

  if (remoteEphemeral && !ephemeral) {
    const remote = remoteEphemeral.measure;
    const style = resolveDisplayStyle(
      remote.displayStyle,
      remote.kind === 'cone' ? (remote.params as ConeMeasureParams) : undefined,
    );
    items.push(
      renderMeasurement(
        remote.kind,
        remote.params,
        remoteEphemeral.color,
        remote.opacity,
        'remote-ephemeral',
        style,
        debugDualView,
      ),
    );
  }

  return <Group listening={false}>{items}</Group>;
}

/** Foot readouts rendered above draw strokes so they stay visible. */
export function MeasurementLabelsLayer({
  measurements,
  ephemeral,
  remoteEphemeral = null,
  alternatingDiagonals,
  viewScale,
  fadingMeasurements,
  onDismissMeasurement,
}: Pick<
  Props,
  'measurements' | 'ephemeral' | 'remoteEphemeral' | 'alternatingDiagonals' | 'viewScale' | 'fadingMeasurements'
> & {
  onDismissMeasurement?: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const role = useStore((s) => s.role);
  const playerName = useStore((s) => s.playerName);
  const labels: Array<{ key: string; opacity: number; text: string; x: number; y: number; dismissible: boolean }> = [];

  for (const m of measurements) {
    if (!isValidMeasurePreview(m.kind, m.params)) continue;
    const info = getMeasureLabelInfo(m.kind, m.params, alternatingDiagonals);
    if (info) {
      labels.push({
        key: m.id,
        opacity: fadingMeasurements?.[m.id] ?? 1,
        dismissible: isMeasurementOwnedBySessionUser(m, role, playerName),
        ...info,
      });
    }
  }

  if (ephemeral && isValidMeasurePreview(ephemeral.kind, ephemeral.params)) {
    const info = getMeasureLabelInfo(ephemeral.kind, ephemeral.params, alternatingDiagonals);
    if (info) labels.push({ key: 'ephemeral', opacity: ephemeral.opacity, dismissible: false, ...info });
  }

  if (
    !ephemeral &&
    remoteEphemeral &&
    isValidMeasurePreview(remoteEphemeral.measure.kind, remoteEphemeral.measure.params)
  ) {
    const remote = remoteEphemeral.measure;
    const info = getMeasureLabelInfo(remote.kind, remote.params, alternatingDiagonals);
    if (info) {
      labels.push({
        key: 'remote-ephemeral',
        opacity: remote.opacity,
        dismissible: false,
        ...info,
      });
    }
  }

  return (
    <Group>
      {labels.map(({ key, opacity, text, x, y, dismissible }) => (
        <Group key={key} opacity={opacity} listening={dismissible}>
          <MeasureLabel
            x={x}
            y={y}
            text={text}
            viewScale={viewScale}
            dismissible={dismissible}
            hovered={dismissible && hoveredId === key}
            onHoverChange={(hovered) => {
              if (hovered) setHoveredId(key);
              else setHoveredId((prev) => (prev === key ? null : prev));
            }}
            onDismiss={() => onDismissMeasurement?.(key)}
          />
        </Group>
      ))}
    </Group>
  );
}
