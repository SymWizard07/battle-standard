import type { MeasurementObject, SessionRole } from './types';

export interface MeasurementPinnedBy {
  role: 'gm' | 'player';
  name: string;
}

export function currentMeasurementPinnedBy(
  role: SessionRole,
  playerName: string,
): MeasurementPinnedBy {
  const name = playerName.trim();
  if (role === 'player') {
    return { role: 'player', name: name || 'Player' };
  }
  return { role: 'gm', name: name || 'GM' };
}

/** Whether the current session user pinned (or may dismiss) this measurement. */
export function isMeasurementOwnedBySessionUser(
  m: MeasurementObject,
  role: SessionRole,
  playerName: string,
): boolean {
  if (!m.pinnedBy) {
    return role === 'gm';
  }
  if (m.pinnedBy.role !== role) return false;
  if (role === 'gm') return true;
  return m.pinnedBy.name === playerName.trim();
}

export function measurementsOwnedBySessionUser(
  measurements: MeasurementObject[],
  role: SessionRole,
  playerName: string,
): MeasurementObject[] {
  return measurements.filter((m) => isMeasurementOwnedBySessionUser(m, role, playerName));
}
