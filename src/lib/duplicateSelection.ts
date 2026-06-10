import { GRID_SIZE_PX } from './fixedGrid';
import { shiftDrawStroke } from './drawShapes';
import { newId } from './ids';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  DrawStroke,
  LineMeasureParams,
  MeasurementObject,
  Point,
  SphereMeasureParams,
  Token,
} from './types';

/** World-space offset for duplicated objects (one grid cell diagonally). */
export const DUPLICATE_OFFSET: Point = { x: GRID_SIZE_PX, y: GRID_SIZE_PX };

export const DUPLICATE_GRID_DELTA = { col: 1, row: 1 };

function shiftPoint(p: Point, delta: Point): Point {
  return { x: p.x + delta.x, y: p.y + delta.y };
}

export function cloneDrawStroke(stroke: DrawStroke): DrawStroke {
  return {
    ...stroke,
    id: newId(),
    points: stroke.points?.map((p) => ({ ...p })),
    params: stroke.params ? (JSON.parse(JSON.stringify(stroke.params)) as typeof stroke.params) : undefined,
  };
}

export function cloneToken(token: Token): Token {
  return {
    ...token,
    id: newId(),
    gridPos: {
      col: token.gridPos.col + DUPLICATE_GRID_DELTA.col,
      row: token.gridPos.row + DUPLICATE_GRID_DELTA.row,
    },
    statusEffects: [...token.statusEffects],
  };
}

function shiftMeasurementParams(
  kind: MeasurementObject['kind'],
  params: MeasurementObject['params'],
  worldDelta: Point,
): MeasurementObject['params'] {
  if (kind === 'line') {
    const p = params as LineMeasureParams;
    return {
      from: shiftPoint(p.from, worldDelta),
      to: shiftPoint(p.to, worldDelta),
    };
  }
  if (kind === 'cone') {
    const p = params as ConeMeasureParams;
    return { ...p, origin: shiftPoint(p.origin, worldDelta) };
  }
  if (kind === 'cube' || kind === 'sphere') {
    const p = params as CubeMeasureParams | SphereMeasureParams;
    return {
      ...p,
      center: {
        col: p.center.col + DUPLICATE_GRID_DELTA.col,
        row: p.center.row + DUPLICATE_GRID_DELTA.row,
      },
    };
  }
  return params;
}

export function cloneMeasurement(m: MeasurementObject): MeasurementObject {
  return {
    ...m,
    id: newId(),
    params: shiftMeasurementParams(
      m.kind,
      JSON.parse(JSON.stringify(m.params)) as MeasurementObject['params'],
      DUPLICATE_OFFSET,
    ),
  };
}

export function duplicateDrawStrokes(strokes: DrawStroke[]): DrawStroke[] {
  return strokes
    .map(cloneDrawStroke)
    .map((stroke) => shiftDrawStroke(stroke, DUPLICATE_OFFSET));
}

export function duplicateTokens(tokens: Token[]): Token[] {
  return tokens.map(cloneToken);
}

export function duplicateMeasurements(measurements: MeasurementObject[]): MeasurementObject[] {
  return measurements.map(cloneMeasurement);
}
