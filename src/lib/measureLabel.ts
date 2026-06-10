import { GRID_CELL_FT, GRID_SIZE_PX } from './fixedGrid';
import { lineLengthFt } from './measure';
import {
  cubeCenterWorld,
  sphereCenterWorld,
  sphereRadiusWorld,
} from './drawShapes';
import type {
  ConeMeasureParams,
  CubeMeasureParams,
  LineMeasureParams,
  MeasureKind,
  MeasurementParams,
  SphereMeasureParams,
} from './types';

export interface MeasureLabelInfo {
  text: string;
  x: number;
  y: number;
}

/** Foot readout and anchor point for a measurement shape. */
export function getMeasureLabelInfo(
  kind: MeasureKind,
  params: MeasurementParams,
  alternatingDiagonals: boolean,
): MeasureLabelInfo | null {
  if (kind === 'line') {
    const p = params as LineMeasureParams;
    const ft = lineLengthFt(
      p.from,
      p.to,
      GRID_CELL_FT,
      GRID_SIZE_PX,
      alternatingDiagonals,
    );
    return {
      text: `${ft} ft`,
      x: (p.from.x + p.to.x) / 2,
      y: (p.from.y + p.to.y) / 2,
    };
  }

  if (kind === 'cube') {
    const p = params as CubeMeasureParams;
    if (p.radiusCells <= 0) return null;
    const center = cubeCenterWorld(p);
    return {
      text: `${(p.radiusCells * 2 + 1) * GRID_CELL_FT} ft`,
      x: center.x,
      y: center.y,
    };
  }

  if (kind === 'sphere') {
    const p = params as SphereMeasureParams;
    const r = sphereRadiusWorld(p);
    if (r <= 0) return null;
    const c = sphereCenterWorld(p);
    const radiusFt = Math.round((r * GRID_CELL_FT) / GRID_SIZE_PX);
    return { text: `${radiusFt} ft`, x: c.x, y: c.y };
  }

  if (kind === 'cone') {
    const p = params as ConeMeasureParams;
    const lengthWorld = p.lengthWorld ?? p.lengthCells * GRID_SIZE_PX;
    if (lengthWorld <= 0) return null;
    const lenFt = Math.round((lengthWorld * GRID_CELL_FT) / GRID_SIZE_PX);
    const t = 0.45;
    return {
      text: `${lenFt} ft`,
      x: p.origin.x + Math.cos(p.direction) * lengthWorld * t,
      y: p.origin.y + Math.sin(p.direction) * lengthWorld * t,
    };
  }

  return null;
}
