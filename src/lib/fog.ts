import type { FogState } from './types';

/** No fog overlay — map fully visible to GM and players. */
export function isFogFullyClear(fog: FogState): boolean {
  return (
    !fog.defaultHidden &&
    fog.unexploredMask.length === 0 &&
    fog.revealedMask.length === 0
  );
}

/** Normalize fog state after edits (no-op for now; full-grid fog stays until explicitly cleared). */
export function normalizeFogState(fog: FogState): FogState {
  return fog;
}
