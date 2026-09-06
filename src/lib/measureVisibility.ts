import { isMeasurementOwnedBySessionUser } from './measureOwnership';
import type { MeasurementObject, SessionRole } from './types';

export function isMeasurementVisibleToPlayers(m: { visibleToPlayers?: boolean }): boolean {
  return m.visibleToPlayers !== false;
}

export function isMeasurementVisibleToViewer(
  m: MeasurementObject,
  role: SessionRole,
  playerName: string,
  asPlayer: boolean,
): boolean {
  if (!asPlayer) return true;
  if (isMeasurementOwnedBySessionUser(m, role, playerName)) return true;
  return isMeasurementVisibleToPlayers(m);
}

export function filterMeasurementsForViewer(
  measurements: MeasurementObject[],
  role: SessionRole,
  playerName: string,
  asPlayer: boolean,
): MeasurementObject[] {
  if (!asPlayer) return measurements;
  return measurements.filter((m) => isMeasurementVisibleToViewer(m, role, playerName, asPlayer));
}
